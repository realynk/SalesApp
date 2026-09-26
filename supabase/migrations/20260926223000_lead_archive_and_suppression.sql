-- Archive leads without deleting history, and suppress permanently deleted
-- SendPilot identities so webhooks/imports cannot silently recreate them.

alter table public.leads
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles (id) on delete set null;

create index if not exists leads_archived_at_idx
  on public.leads (archived_at)
  where archived_at is not null;

create index if not exists leads_active_updated_idx
  on public.leads (updated_at desc)
  where archived_at is null;

alter table public.sendpilot_syncs
  add column if not exists suppressed_records integer not null default 0;

create table if not exists public.sendpilot_suppressions (
  id uuid primary key default gen_random_uuid(),
  sendpilot_lead_id text,
  email text,
  email_key text,
  linkedin_url text,
  linkedin_key text,
  display_name text,
  company_name text,
  reason text not null default 'permanent_delete',
  suppressed_at timestamptz not null default now(),
  suppressed_by uuid references public.profiles (id) on delete set null,
  released_at timestamptz,
  released_by uuid references public.profiles (id) on delete set null
);

create unique index if not exists sendpilot_suppressions_lead_id_active
  on public.sendpilot_suppressions (sendpilot_lead_id)
  where sendpilot_lead_id is not null and released_at is null;

create unique index if not exists sendpilot_suppressions_email_active
  on public.sendpilot_suppressions (email_key)
  where email_key is not null and released_at is null;

create unique index if not exists sendpilot_suppressions_linkedin_active
  on public.sendpilot_suppressions (linkedin_key)
  where linkedin_key is not null and released_at is null;

alter table public.sendpilot_suppressions enable row level security;

drop policy if exists sendpilot_suppressions_select on public.sendpilot_suppressions;
create policy sendpilot_suppressions_select
  on public.sendpilot_suppressions for select to authenticated
  using ((select private.is_internal()));

drop policy if exists sendpilot_suppressions_insert on public.sendpilot_suppressions;
create policy sendpilot_suppressions_insert
  on public.sendpilot_suppressions for insert to authenticated
  with check ((select private.is_internal()));

drop policy if exists sendpilot_suppressions_update on public.sendpilot_suppressions;
create policy sendpilot_suppressions_update
  on public.sendpilot_suppressions for update to authenticated
  using ((select private.is_internal()))
  with check ((select private.is_internal()));

create or replace function private.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('realynk.allow_history_delete', true) = 'on' then
    return old;
  end if;
  raise exception 'Historical records cannot be changed or deleted';
end;
$$;

create or replace function private.active_suppression_id(
  p_sendpilot_lead_id text,
  p_email text,
  p_linkedin text
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select s.id
  from public.sendpilot_suppressions s
  where s.released_at is null
    and (
      (nullif(btrim(coalesce(p_sendpilot_lead_id, '')), '') is not null and s.sendpilot_lead_id = btrim(p_sendpilot_lead_id))
      or (private.normalize_email(p_email) is not null and s.email_key = private.normalize_email(p_email))
      or (private.normalize_linkedin(p_linkedin) is not null and s.linkedin_key = private.normalize_linkedin(p_linkedin))
    )
  limit 1;
$$;

create or replace function private.classify_lead_row(lead_row jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_email text := private.normalize_email(lead_row ->> 'email');
  v_linkedin text := private.normalize_linkedin(lead_row ->> 'linkedin_url');
  v_company text := private.normalize_name(lead_row ->> 'company');
  v_person text := private.normalize_name(
    case
      when btrim(concat_ws(' ', lead_row ->> 'first_name', lead_row ->> 'last_name')) <> ''
        then concat_ws(' ', lead_row ->> 'first_name', lead_row ->> 'last_name')
      else lead_row ->> 'name'
    end
  );
  v_external_id text := nullif(btrim(coalesce(
    lead_row ->> 'external_id',
    lead_row ->> 'sendpilot_lead_id',
    lead_row ->> 'lead_id',
    ''
  )), '');
  raw_status text := nullif(btrim(coalesce(lead_row ->> 'sendpilot_status', '')), '');
  parsed_status public.sendpilot_status := private.normalize_sendpilot_status(raw_status);
  match_count integer;
  contact_record public.contacts%rowtype;
  matched_lead_id uuid;
  current_status public.sendpilot_status;
  current_phone text;
  current_archived timestamptz;
  classification text;
  reason text := null;
  display_name text;
  suppression_id uuid;
begin
  display_name := nullif(btrim(concat_ws(' ', lead_row ->> 'first_name', lead_row ->> 'last_name')), '');
  if display_name is null then
    display_name := nullif(btrim(coalesce(lead_row ->> 'name', '')), '');
  end if;

  suppression_id := private.active_suppression_id(v_external_id, lead_row ->> 'email', lead_row ->> 'linkedin_url');

  if v_email is null and v_linkedin is null and (v_company is null or v_person is null) and v_external_id is null then
    return jsonb_build_object(
      'classification', 'unmatched',
      'reason', 'Missing email, LinkedIn, or company plus contact name',
      'review_required', true,
      'display_name', display_name,
      'sendpilot_status', parsed_status,
      'status_raw', raw_status
    );
  end if;

  select count(distinct c.id)
  into match_count
  from public.contacts c
  join public.companies co on co.id = c.company_id
  where
    (v_email is not null and c.email_key = v_email)
    or (v_linkedin is not null and c.linkedin_key = v_linkedin)
    or (
      v_company is not null
      and v_person is not null
      and co.name_key = v_company
      and private.normalize_name(concat_ws(' ', c.first_name, c.last_name)) = v_person
    );

  if match_count > 1 then
    return jsonb_build_object(
      'classification', 'possible_duplicate',
      'reason', 'Email, LinkedIn, or company and name match more than one contact',
      'review_required', true,
      'display_name', display_name,
      'sendpilot_status', parsed_status,
      'status_raw', raw_status
    );
  end if;

  if match_count = 1 then
    select c.*
    into contact_record
    from public.contacts c
    join public.companies co on co.id = c.company_id
    where
      (v_email is not null and c.email_key = v_email)
      or (v_linkedin is not null and c.linkedin_key = v_linkedin)
      or (
        v_company is not null
        and v_person is not null
        and co.name_key = v_company
        and private.normalize_name(concat_ws(' ', c.first_name, c.last_name)) = v_person
      )
    limit 1;

    if v_email is not null and contact_record.email_key is not null and contact_record.email_key <> v_email then
      reason := 'Same company and name, different email';
    elsif v_linkedin is not null and contact_record.linkedin_key is not null and contact_record.linkedin_key <> v_linkedin then
      reason := 'Matched contact has a different LinkedIn URL';
    end if;

    if reason is not null then
      return jsonb_build_object(
        'classification', 'possible_duplicate',
        'reason', reason,
        'review_required', true,
        'matched_contact_id', contact_record.id,
        'matched_name', concat_ws(' ', contact_record.first_name, contact_record.last_name),
        'display_name', display_name,
        'sendpilot_status', parsed_status,
        'status_raw', raw_status
      );
    end if;

    select id, sendpilot_status, archived_at into matched_lead_id, current_status, current_archived
    from public.leads
    where contact_id = contact_record.id;
    current_phone := contact_record.phone;

    if current_archived is not null then
      return jsonb_build_object(
        'classification', 'archived',
        'reason', 'Matched an archived lead. Source data can update; the lead stays archived until restored.',
        'review_required', false,
        'matched_contact_id', contact_record.id,
        'matched_lead_id', matched_lead_id,
        'matched_name', concat_ws(' ', contact_record.first_name, contact_record.last_name),
        'display_name', display_name,
        'sendpilot_status', parsed_status,
        'status_raw', raw_status
      );
    end if;

    classification := 'existing';
    if matched_lead_id is null
      or current_status is distinct from parsed_status
      or (
        nullif(btrim(coalesce(lead_row ->> 'phone', '')), '') is not null
        and current_phone is distinct from btrim(lead_row ->> 'phone')
      )
    then
      classification := 'updated';
    end if;

    if raw_status is not null and parsed_status is null then
      reason := 'SendPilot status was not recognized';
    end if;

    return jsonb_build_object(
      'classification', classification,
      'reason', reason,
      'review_required', raw_status is not null and parsed_status is null,
      'matched_contact_id', contact_record.id,
      'matched_lead_id', matched_lead_id,
      'matched_name', concat_ws(' ', contact_record.first_name, contact_record.last_name),
      'display_name', display_name,
      'sendpilot_status', parsed_status,
      'status_raw', raw_status
    );
  end if;

  if suppression_id is not null then
    return jsonb_build_object(
      'classification', 'suppressed',
      'reason', 'This SendPilot lead was permanently deleted. Recreate it only with an explicit restore from review.',
      'review_required', true,
      'display_name', display_name,
      'sendpilot_status', parsed_status,
      'status_raw', raw_status,
      'suppression_id', suppression_id
    );
  end if;

  return jsonb_build_object(
    'classification', 'new',
    'reason', case when raw_status is not null and parsed_status is null then 'SendPilot status was not recognized' else null end,
    'review_required', raw_status is not null and parsed_status is null,
    'display_name', display_name,
    'sendpilot_status', parsed_status,
    'status_raw', raw_status
  );
end;
$$;

create or replace function public.preview_sendpilot_import(payload jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  row jsonb;
  classified jsonb;
  rows jsonb := '[]'::jsonb;
  total integer := 0;
  new_count integer := 0;
  existing_count integer := 0;
  updated_count integer := 0;
  duplicate_count integer := 0;
  unmatched_count integer := 0;
  archived_count integer := 0;
  suppressed_count integer := 0;
begin
  if auth.uid() is null or not private.is_internal() then
    raise exception 'Not authorized';
  end if;
  if jsonb_typeof(payload -> 'rows') <> 'array' then
    raise exception 'Import payload is missing rows';
  end if;
  if jsonb_array_length(payload -> 'rows') > 5000 then
    raise exception 'Import is limited to 5000 rows at a time';
  end if;

  for row in select value from jsonb_array_elements(payload -> 'rows')
  loop
    classified := private.classify_lead_row(row);
    total := total + 1;
    case classified ->> 'classification'
      when 'new' then new_count := new_count + 1;
      when 'existing' then existing_count := existing_count + 1;
      when 'updated' then updated_count := updated_count + 1;
      when 'possible_duplicate' then duplicate_count := duplicate_count + 1;
      when 'archived' then archived_count := archived_count + 1;
      when 'suppressed' then suppressed_count := suppressed_count + 1;
      else unmatched_count := unmatched_count + 1;
    end case;
    rows := rows || jsonb_build_array(classified || jsonb_build_object(
      'row_number', coalesce((row ->> 'row_number')::integer, total + 1),
      'company', row ->> 'company',
      'email', row ->> 'email',
      'linkedin_url', row ->> 'linkedin_url',
      'phone', row ->> 'phone',
      'source', row ->> 'source'
    ));
  end loop;

  return jsonb_build_object(
    'total', total,
    'new', new_count,
    'existing', existing_count,
    'updated', updated_count,
    'possible_duplicates', duplicate_count,
    'unmatched', unmatched_count,
    'archived', archived_count,
    'suppressed', suppressed_count,
    'review', duplicate_count + unmatched_count + suppressed_count,
    'rows', rows
  );
end;
$$;

create or replace function public.apply_sendpilot_import(payload jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  row jsonb;
  classified jsonb;
  sync_id uuid;
  total integer := 0;
  new_count integer := 0;
  existing_count integer := 0;
  updated_count integer := 0;
  duplicate_count integer := 0;
  unmatched_count integer := 0;
  suppressed_count integer := 0;
  archived_count integer := 0;
  v_error_count integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_company_id uuid;
  v_contact_id uuid;
  v_lead_id uuid;
  parsed_status public.sendpilot_status;
  v_first_name text;
  v_last_name text;
  v_full_name text;
  source_name text;
  v_class text;
begin
  if uid is null or not private.is_internal() then
    raise exception 'Not authorized';
  end if;
  if jsonb_typeof(payload -> 'rows') <> 'array' or jsonb_array_length(payload -> 'rows') = 0 then
    raise exception 'The file has no data rows';
  end if;
  if jsonb_array_length(payload -> 'rows') > 5000 then
    raise exception 'Import is limited to 5000 rows at a time';
  end if;

  source_name := coalesce(payload ->> 'source', 'csv');
  if source_name not in ('csv', 'xls', 'xlsx') then
    source_name := 'csv';
  end if;

  insert into public.sendpilot_syncs (source, filename, status, created_by)
  values (source_name, payload ->> 'filename', 'applied', uid)
  returning id into sync_id;

  for row in select value from jsonb_array_elements(payload -> 'rows')
  loop
    total := total + 1;
    begin
      classified := private.classify_lead_row(row);
      v_class := classified ->> 'classification';
      parsed_status := nullif(classified ->> 'sendpilot_status', '')::public.sendpilot_status;
      v_company_id := null;
      v_contact_id := null;
      v_lead_id := null;
      v_first_name := nullif(btrim(coalesce(row ->> 'v_first_name', '')), '');
      v_last_name := nullif(btrim(coalesce(row ->> 'v_last_name', '')), '');
      v_full_name := coalesce(classified ->> 'display_name', row ->> 'name');
      if v_first_name is null and v_full_name is not null then
        v_first_name := split_part(v_full_name, ' ', 1);
        v_last_name := nullif(btrim(regexp_replace(v_full_name, '^\S+\s*', '')), '');
      end if;

      if v_class = 'new' then
        select id into v_company_id
        from public.companies
        where name_key = private.normalize_name(coalesce(nullif(btrim(coalesce(row ->> 'company', '')), ''), 'Unknown company'));
        if v_company_id is null then
          insert into public.companies (name)
          values (coalesce(nullif(btrim(coalesce(row ->> 'company', '')), ''), 'Unknown company'))
          returning id into v_company_id;
        end if;

        insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url)
        values (
          v_company_id,
          coalesce(v_first_name, 'Unknown'),
          coalesce(v_last_name, ''),
          nullif(btrim(coalesce(row ->> 'email', '')), ''),
          nullif(btrim(coalesce(row ->> 'phone', '')), ''),
          nullif(btrim(coalesce(row ->> 'linkedin_url', '')), '')
        )
        returning id into v_contact_id;

        insert into public.leads (
          contact_id, company_id, source, sendpilot_status, sendpilot_status_raw,
          last_synced_at, requires_review, review_reason
        ) values (
          v_contact_id,
          v_company_id,
          coalesce(nullif(btrim(coalesce(row ->> 'source', '')), ''), 'sendpilot'),
          parsed_status,
          classified ->> 'status_raw',
          now(),
          coalesce((classified ->> 'review_required')::boolean, false),
          classified ->> 'reason'
        )
        returning id into v_lead_id;

        insert into public.activities (lead_id, contact_id, company_id, type, title, actor_id, occurred_at)
        values (v_lead_id, v_contact_id, v_company_id, 'lead_imported', 'Lead imported from SendPilot file', uid, now());

        if parsed_status = 'Interested' then
          insert into public.activities (lead_id, contact_id, company_id, type, title, actor_id, occurred_at)
          values (v_lead_id, v_contact_id, v_company_id, 'lead_became_interested', 'SendPilot status is Interested', uid, now());
        end if;
      elsif v_class in ('existing', 'updated', 'archived') then
        v_contact_id := (classified ->> 'matched_contact_id')::uuid;
        v_lead_id := nullif(classified ->> 'matched_lead_id', '')::uuid;
        select c.company_id into v_company_id from public.contacts c where c.id = v_contact_id;

        update public.contacts
        set
          phone = coalesce(phone, nullif(btrim(coalesce(row ->> 'phone', '')), '')),
          linkedin_url = coalesce(linkedin_url, nullif(btrim(coalesce(row ->> 'linkedin_url', '')), '')),
          email = coalesce(email, nullif(btrim(coalesce(row ->> 'email', '')), ''))
        where id = v_contact_id;

        if v_lead_id is null then
          insert into public.leads (
            contact_id, company_id, source, sendpilot_status, sendpilot_status_raw, last_synced_at, requires_review, review_reason
          ) values (
            v_contact_id, v_company_id, coalesce(nullif(row ->> 'source', ''), 'sendpilot'),
            parsed_status, classified ->> 'status_raw', now(),
            coalesce((classified ->> 'review_required')::boolean, false), classified ->> 'reason'
          )
          returning id into v_lead_id;
        else
          update public.leads
          set
            sendpilot_status = parsed_status,
            sendpilot_status_raw = classified ->> 'status_raw',
            last_synced_at = now(),
            requires_review = coalesce((classified ->> 'review_required')::boolean, false),
            review_reason = classified ->> 'reason',
            source = coalesce(nullif(btrim(coalesce(row ->> 'source', '')), ''), source)
          where id = v_lead_id;
        end if;

        if v_class = 'updated' then
          insert into public.activities (lead_id, contact_id, company_id, type, title, body, actor_id)
          values (
            v_lead_id, v_contact_id, v_company_id, 'sendpilot_status_changed',
            'SendPilot record updated',
            case when parsed_status is null then classified ->> 'status_raw' else parsed_status::text end,
            uid
          );
          if parsed_status = 'Interested' then
            insert into public.activities (lead_id, contact_id, company_id, type, title, actor_id)
            values (v_lead_id, v_contact_id, v_company_id, 'lead_became_interested', 'SendPilot status is Interested', uid);
          end if;
        end if;
      elsif v_class = 'possible_duplicate' then
        v_contact_id := nullif(classified ->> 'matched_contact_id', '')::uuid;
        v_lead_id := null;
      else
        v_contact_id := null;
        v_lead_id := null;
      end if;

      insert into public.sendpilot_records (
        sync_id, row_number, raw, full_name, first_name, last_name, company_name, email,
        linkedin_url, phone, sendpilot_status, source, classification, review_required,
        review_reason, matched_contact_id, matched_lead_id, applied
      ) values (
        sync_id,
        coalesce((row ->> 'row_number')::integer, total + 1),
        coalesce(row -> 'extra', '{}'::jsonb) || row,
        v_full_name,
        v_first_name,
        v_last_name,
        row ->> 'company',
        nullif(btrim(coalesce(row ->> 'email', '')), ''),
        nullif(btrim(coalesce(row ->> 'linkedin_url', '')), ''),
        nullif(btrim(coalesce(row ->> 'phone', '')), ''),
        coalesce(parsed_status::text, classified ->> 'status_raw'),
        row ->> 'source',
        v_class,
        v_class in ('possible_duplicate', 'unmatched', 'suppressed')
          or coalesce((classified ->> 'review_required')::boolean, false),
        classified ->> 'reason',
        v_contact_id,
        v_lead_id,
        v_class in ('new', 'existing', 'updated', 'archived')
      );

      case v_class
        when 'new' then new_count := new_count + 1;
        when 'existing' then existing_count := existing_count + 1;
        when 'updated' then updated_count := updated_count + 1;
        when 'archived' then archived_count := archived_count + 1;
        when 'possible_duplicate' then duplicate_count := duplicate_count + 1;
        when 'suppressed' then suppressed_count := suppressed_count + 1;
        else unmatched_count := unmatched_count + 1;
      end case;
    exception when others then
      v_error_count := v_error_count + 1;
      if jsonb_array_length(v_errors) < 50 then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'row', coalesce(row ->> 'row_number', total::text),
          'message', sqlerrm
        ));
      end if;
    end;
  end loop;

  update public.sendpilot_syncs
  set
    completed_at = now(),
    total_records = total,
    new_records = new_count,
    existing_records = existing_count + archived_count,
    updated_records = updated_count,
    matched_records = new_count + existing_count + updated_count + archived_count,
    possible_duplicates = duplicate_count,
    unmatched_records = unmatched_count,
    suppressed_records = suppressed_count,
    review_records = duplicate_count + unmatched_count + suppressed_count,
    error_count = v_error_count,
    errors = v_errors,
    status = case when v_error_count > 0 and new_count + updated_count + existing_count + archived_count = 0 then 'failed' else 'applied' end
  where id = sync_id;

  return jsonb_build_object(
    'sync_id', sync_id,
    'total', total,
    'new', new_count,
    'existing', existing_count,
    'updated', updated_count,
    'archived', archived_count,
    'possible_duplicates', duplicate_count,
    'unmatched', unmatched_count,
    'suppressed', suppressed_count,
    'errors', v_error_count
  );
end;
$$;

create or replace function public.delete_lead_permanently(p_lead_id uuid, p_confirm_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  lead_row public.leads%rowtype;
  contact_row public.contacts%rowtype;
  company_name text;
  display_name text;
  remaining_contacts integer;
begin
  if uid is null or not private.is_internal() then
    raise exception 'Not authorized';
  end if;

  select * into lead_row from public.leads where id = p_lead_id;
  if not found then
    raise exception 'Lead not found';
  end if;

  select * into contact_row from public.contacts where id = lead_row.contact_id;
  display_name := nullif(btrim(concat_ws(' ', contact_row.first_name, contact_row.last_name)), '');
  if display_name is null then
    display_name := 'Unnamed contact';
  end if;
  select name into company_name from public.companies where id = lead_row.company_id;

  if btrim(coalesce(p_confirm_name, '')) <> display_name then
    raise exception 'Type the lead name to confirm permanent deletion';
  end if;

  begin
    insert into public.sendpilot_suppressions (
      sendpilot_lead_id, email, email_key, linkedin_url, linkedin_key,
      display_name, company_name, reason, suppressed_by
    ) values (
      nullif(btrim(coalesce(lead_row.sendpilot_lead_id, '')), ''),
      contact_row.email,
      private.normalize_email(contact_row.email),
      contact_row.linkedin_url,
      private.normalize_linkedin(contact_row.linkedin_url),
      display_name,
      company_name,
      'permanent_delete',
      uid
    );
  exception when unique_violation then
    update public.sendpilot_suppressions
    set
      released_at = null,
      released_by = null,
      suppressed_at = now(),
      suppressed_by = uid,
      display_name = display_name,
      company_name = company_name
    where released_at is null
      and (
        sendpilot_lead_id = nullif(btrim(coalesce(lead_row.sendpilot_lead_id, '')), '')
        or email_key = private.normalize_email(contact_row.email)
        or linkedin_key = private.normalize_linkedin(contact_row.linkedin_url)
      );
  end;

  perform set_config('realynk.allow_history_delete', 'on', true);

  delete from public.leads where id = p_lead_id;

  if contact_row.id is not null then
    if not exists (select 1 from public.leads where contact_id = contact_row.id) then
      delete from public.contacts where id = contact_row.id;
    end if;
  end if;

  select count(*) into remaining_contacts from public.contacts where company_id = lead_row.company_id;
  if remaining_contacts = 0
     and not exists (select 1 from public.leads where company_id = lead_row.company_id)
     and not exists (select 1 from public.opportunities where company_id = lead_row.company_id)
  then
    delete from public.companies where id = lead_row.company_id;
  end if;

  return jsonb_build_object('ok', true, 'lead_id', p_lead_id);
end;
$$;

create or replace function public.release_sendpilot_suppression(p_suppression_id uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_internal() then
    raise exception 'Not authorized';
  end if;
  update public.sendpilot_suppressions
  set released_at = now(), released_by = auth.uid()
  where id = p_suppression_id and released_at is null;
end;
$$;

revoke all on function public.delete_lead_permanently(uuid, text) from public, anon;
grant execute on function public.delete_lead_permanently(uuid, text) to authenticated;
revoke all on function public.release_sendpilot_suppression(uuid) from public, anon;
grant execute on function public.release_sendpilot_suppression(uuid) to authenticated;
revoke all on function private.active_suppression_id(text, text, text) from public;
grant execute on function private.classify_lead_row(jsonb) to authenticated;
grant execute on function public.preview_sendpilot_import(jsonb) to authenticated;
grant execute on function public.apply_sendpilot_import(jsonb) to authenticated;


