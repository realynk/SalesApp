-- =============================================================================
-- STAGING ONLY — salesapp-staging
-- Combined remaining migrations 5–13 for a project that already applied 1–4.
--
-- DO NOT run this on production.
-- DO NOT merge PR #35. Migration 13 is copied here for staging apply only.
-- DO NOT put this file in supabase/migrations (the CLI would treat it as a new migration).
-- This script contains no production credentials, webhook secrets, or customer data.
-- Original files under supabase/migrations/ were not modified.
--
-- Assumed already applied:
--   1. 20260923170000_command_center.sql
--   2. 20260923215000_not_interested_outcomes.sql
--   3. 20260923223000_not_interested_intake.sql
--   4. 20260924183000_account_flags.sql
--
-- This file applies, in order:
--   5. 20260926213000_sendpilot_webhook.sql
--   6. 20260926223000_lead_archive_and_suppression.sql
--   7. 20260926233000_sendpilot_import_storage.sql
--   8. 20261005120000_sendpilot_integrations.sql
--      (creates empty Realynk Main, legacy_env=true, no credentials)
--   9. 20261007180000_sendpilot_credential_grants.sql
--  10. 20261007210000_sendpilot_integration_management.sql
--  11. 20261007220000_sendpilot_cross_workspace_matching.sql
--      (requires the Realynk Main row from 8)
--  12. 20261007230000_sendpilot_credential_status.sql
--  13. 20261008020000_executive_role_security.sql  (draft PR #35, unmerged)
--
-- Transaction notes (Supabase SQL Editor typically runs the paste as one transaction):
--   - ALTER TYPE ... ADD VALUE 'executive' is allowed in a transaction on hosted
--     Postgres 15. File 13 does not use the new enum value, so no extra COMMIT
--     is required between 12 and 13.
--   - There is no CREATE INDEX CONCURRENTLY.
--   - If any statement fails, roll back the whole paste and do not retry blindly.
--   - Run once. Several CREATE TYPE / CREATE TABLE / CREATE POLICY statements
--     are not idempotent.
--
-- After a successful run: invite staging-only users, then promote roles with
-- service-role SQL (file 13 defaults new profiles to member).
-- Do not configure live SendPilot webhooks or copy production secrets.
-- =============================================================================

-- Preflight: abort unless migrations 1–4 look present and 5+ have not started.
do $preflight$
begin
  if to_regclass('public.leads') is null then
    raise exception 'Stop: public.leads is missing. Migrations 1–4 do not look applied.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'account_flag'
  ) then
    raise exception 'Stop: leads.account_flag is missing. Finish migrations 1–4 before this script.';
  end if;

  if to_regclass('public.sendpilot_webhook_events') is not null then
    raise exception 'Stop: sendpilot_webhook_events already exists. Migration 5+ looks partially applied. Do not re-run this combined script.';
  end if;

  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role'
      and e.enumlabel = 'executive'
  ) then
    raise exception 'Stop: user_role already includes executive. Migration 13 looks applied. Do not re-run this combined script.';
  end if;
end
$preflight$;

-- =============================================================================
-- MIGRATION 5/13 — 20260926213000_sendpilot_webhook.sql
-- SendPilot lead ids and webhook event log (PK event_id).
-- =============================================================================

-- Store SendPilot lead ids, webhook idempotency, and an audit trail for live sync.
-- Internal opportunity stage is unchanged by this migration.

alter table public.leads
  add column if not exists sendpilot_lead_id text;

create unique index if not exists leads_sendpilot_lead_id_unique
  on public.leads (sendpilot_lead_id)
  where sendpilot_lead_id is not null;

create index if not exists sendpilot_records_external_id_idx
  on public.sendpilot_records (external_id)
  where external_id is not null;

create table if not exists public.sendpilot_webhook_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null check (status in ('applied', 'ignored', 'failed')),
  lead_id uuid references public.leads (id) on delete set null,
  result jsonb not null default '{}'::jsonb,
  error text,
  processed_at timestamptz not null default now()
);

alter table public.sendpilot_webhook_events enable row level security;

create policy sendpilot_webhook_events_select
  on public.sendpilot_webhook_events
  for select to authenticated
  using ((select private.is_internal()));

-- =============================================================================
-- MIGRATION 6/13 — 20260926223000_lead_archive_and_suppression.sql
-- Lead archive, suppressions, import/delete RPCs.
-- =============================================================================

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


-- =============================================================================
-- MIGRATION 7/13 — 20260926233000_sendpilot_import_storage.sql
-- Private storage bucket sendpilot-imports.
-- =============================================================================

-- Private storage for SendPilot exports. The browser uploads the file with the
-- signed-in user session; preview/apply only send the storage path.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sendpilot-imports',
  'sendpilot-imports',
  false,
  15728640,
  null
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit;

drop policy if exists sendpilot_imports_select on storage.objects;
create policy sendpilot_imports_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'sendpilot-imports'
    and (select private.is_internal())
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

drop policy if exists sendpilot_imports_insert on storage.objects;
create policy sendpilot_imports_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sendpilot-imports'
    and (select private.is_internal())
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

drop policy if exists sendpilot_imports_delete on storage.objects;
create policy sendpilot_imports_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sendpilot-imports'
    and (select private.is_internal())
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

-- =============================================================================
-- MIGRATION 8/13 — 20261005120000_sendpilot_integrations.sql
-- Integration tables + backfill empty Realynk Main (legacy_env=true, no secrets).
-- =============================================================================

-- Phase 1: SendPilot Integration Manager schema foundation.
-- Additive only. Does not change webhook matching, uniqueness of
-- public.leads.sendpilot_lead_id, env-based secrets, or POST /api/sendpilot/webhook.
-- Idempotency for live webhooks remains public.sendpilot_webhook_events.event_id (PK).
-- Future uniqueness (integration_id, event_id) is postponed until apply() is
-- integration-aware (Phase 2+). Do not DROP that primary key in this migration.

create type public.sendpilot_integration_status as enum ('draft', 'active', 'disabled', 'removed');
create type public.sendpilot_tracking_mode as enum ('all', 'selected');

create or replace function private.is_sendpilot_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'sales_lead'::public.user_role
  );
$$;

revoke all on function private.is_sendpilot_admin() from public;
grant execute on function private.is_sendpilot_admin() to authenticated;

create table public.sendpilot_integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  workspace_id text,
  status public.sendpilot_integration_status not null default 'draft',
  tracking_mode public.sendpilot_tracking_mode not null default 'all',
  legacy_env boolean not null default false,
  last_webhook_at timestamptz,
  last_webhook_event_type text,
  last_api_ok_at timestamptz,
  last_api_error text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  activated_at timestamptz,
  disabled_at timestamptz,
  removed_at timestamptz,
  removed_reason text
);

create unique index sendpilot_integrations_workspace_id_unique
  on public.sendpilot_integrations (workspace_id)
  where workspace_id is not null;

create unique index sendpilot_integrations_one_legacy_env
  on public.sendpilot_integrations (legacy_env)
  where legacy_env;

create index sendpilot_integrations_status_idx
  on public.sendpilot_integrations (status);

create table public.sendpilot_campaigns (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.sendpilot_integrations (id) on delete cascade,
  sendpilot_campaign_id text not null,
  name text,
  remote_status text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_id, sendpilot_campaign_id)
);

create table public.sendpilot_campaign_tracking (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.sendpilot_integrations (id) on delete cascade,
  sendpilot_campaign_id text not null,
  tracked boolean not null default true,
  tracked_from timestamptz not null default now(),
  untracked_at timestamptz,
  unique (integration_id, sendpilot_campaign_id)
);

create table public.sendpilot_lead_identities (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.sendpilot_integrations (id) on delete cascade,
  sendpilot_lead_id text not null,
  lead_id uuid references public.leads (id) on delete set null,
  sendpilot_campaign_id text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (integration_id, sendpilot_lead_id)
);

create index sendpilot_lead_identities_lead_id_idx
  on public.sendpilot_lead_identities (lead_id)
  where lead_id is not null;

create table public.sendpilot_integration_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  action text not null,
  integration_id uuid references public.sendpilot_integrations (id) on delete set null,
  campaign_id text,
  metadata jsonb not null default '{}'::jsonb
);

create index sendpilot_integration_audit_integration_idx
  on public.sendpilot_integration_audit (integration_id, created_at desc);

create table private.sendpilot_integration_credentials (
  integration_id uuid primary key references public.sendpilot_integrations (id) on delete cascade,
  api_key_ciphertext text,
  webhook_secret_ciphertext text,
  key_version integer not null default 1,
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.sendpilot_integration_credentials enable row level security;
alter table private.sendpilot_integration_credentials force row level security;

revoke all on table private.sendpilot_integration_credentials from public, anon, authenticated;

alter table public.sendpilot_webhook_events
  add column if not exists integration_id uuid references public.sendpilot_integrations (id) on delete set null,
  add column if not exists campaign_id text;

create index if not exists sendpilot_webhook_events_integration_idx
  on public.sendpilot_webhook_events (integration_id)
  where integration_id is not null;

alter table public.sendpilot_syncs
  add column if not exists integration_id uuid references public.sendpilot_integrations (id) on delete set null,
  add column if not exists campaign_id text;

alter table public.sendpilot_records
  add column if not exists integration_id uuid references public.sendpilot_integrations (id) on delete set null,
  add column if not exists campaign_id text;

alter table public.sendpilot_suppressions
  add column if not exists integration_id uuid references public.sendpilot_integrations (id) on delete set null,
  add column if not exists campaign_id text;

-- Existing unique indexes on suppressions stay global. Per-integration uniqueness
-- is postponed so Account 1 suppression matching is unchanged.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'sendpilot_integrations',
    'sendpilot_campaigns',
    'sendpilot_campaign_tracking',
    'sendpilot_lead_identities',
    'sendpilot_integration_audit'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.is_internal()))',
      table_name || '_select',
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.is_internal()))',
      table_name || '_insert',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.is_internal())) with check ((select private.is_internal()))',
      table_name || '_update',
      table_name
    );
  end loop;
end $$;

-- No DELETE policies on integration tables in Phase 1 (no permanent-delete UI).

create or replace function private.legacy_sendpilot_workspace_id()
returns text
language sql
stable
set search_path = ''
as $$
  with ids as (
    select distinct nullif(btrim(payload ->> 'workspaceId'), '') as workspace_id
    from public.sendpilot_webhook_events
    where nullif(btrim(payload ->> 'workspaceId'), '') is not null
  )
  select ids.workspace_id
  from ids
  where (select count(*) from ids) = 1;
$$;

create or replace function private.backfill_legacy_sendpilot_integration()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  integration_uuid uuid;
  recovered_workspace text;
  identities_inserted integer := 0;
  events_updated integer := 0;
  syncs_updated integer := 0;
  records_updated integer := 0;
  suppressions_updated integer := 0;
  campaigns_upserted integer := 0;
begin
  recovered_workspace := private.legacy_sendpilot_workspace_id();

  insert into public.sendpilot_integrations (
    name,
    workspace_id,
    status,
    tracking_mode,
    legacy_env,
    activated_at
  )
  select
    'Realynk Main',
    recovered_workspace,
    'active',
    'all',
    true,
    now()
  where not exists (
    select 1 from public.sendpilot_integrations where legacy_env
  );

  select id into integration_uuid
  from public.sendpilot_integrations
  where legacy_env
  limit 1;

  if integration_uuid is null then
    return jsonb_build_object('ok', false, 'reason', 'legacy_integration_missing');
  end if;

  update public.sendpilot_integrations
  set workspace_id = recovered_workspace
  where id = integration_uuid
    and workspace_id is null
    and recovered_workspace is not null;

  insert into public.sendpilot_integration_audit (actor_id, action, integration_id, metadata)
  select
    null,
    'integration_created',
    integration_uuid,
    jsonb_build_object(
      'source', 'phase1_migration',
      'legacy_env', true,
      'tracking_mode', 'all',
      'workspace_id_recovered', recovered_workspace is not null
    )
  where not exists (
    select 1
    from public.sendpilot_integration_audit
    where integration_id = integration_uuid
      and action = 'integration_created'
      and metadata ->> 'source' = 'phase1_migration'
  );

  insert into public.sendpilot_campaigns (integration_id, sendpilot_campaign_id, name, last_seen_at)
  select
    integration_uuid,
    campaign_id,
    null,
    max(processed_at)
  from (
    select
      nullif(btrim(payload -> 'data' ->> 'campaignId'), '') as campaign_id,
      processed_at
    from public.sendpilot_webhook_events
  ) extracted
  where campaign_id is not null
  group by campaign_id
  on conflict (integration_id, sendpilot_campaign_id) do update
    set last_seen_at = greatest(
      coalesce(public.sendpilot_campaigns.last_seen_at, excluded.last_seen_at),
      excluded.last_seen_at
    ),
    updated_at = now();

  get diagnostics campaigns_upserted = row_count;

  update public.sendpilot_webhook_events e
  set
    integration_id = integration_uuid,
    campaign_id = coalesce(
      e.campaign_id,
      nullif(btrim(e.payload -> 'data' ->> 'campaignId'), '')
    )
  where e.integration_id is null;

  get diagnostics events_updated = row_count;

  update public.sendpilot_syncs
  set integration_id = integration_uuid
  where integration_id is null;

  get diagnostics syncs_updated = row_count;

  update public.sendpilot_records r
  set
    integration_id = coalesce(r.integration_id, integration_uuid),
    campaign_id = coalesce(
      r.campaign_id,
      nullif(btrim(r.raw ->> 'campaignId'), '')
    )
  where r.integration_id is null or (
    r.campaign_id is null
    and nullif(btrim(r.raw ->> 'campaignId'), '') is not null
  );

  get diagnostics records_updated = row_count;

  update public.sendpilot_suppressions
  set integration_id = integration_uuid
  where integration_id is null;

  get diagnostics suppressions_updated = row_count;

  insert into public.sendpilot_lead_identities (
    integration_id,
    sendpilot_lead_id,
    lead_id,
    sendpilot_campaign_id,
    first_seen_at,
    last_seen_at
  )
  select
    integration_uuid,
    btrim(l.sendpilot_lead_id),
    l.id,
    camp.campaign_id,
    l.created_at,
    coalesce(l.last_synced_at, l.created_at)
  from public.leads l
  left join lateral (
    select min(nullif(btrim(e.payload -> 'data' ->> 'campaignId'), '')) as campaign_id
    from public.sendpilot_webhook_events e
    where nullif(btrim(e.payload -> 'data' ->> 'leadId'), '') = btrim(l.sendpilot_lead_id)
      and nullif(btrim(e.payload -> 'data' ->> 'campaignId'), '') is not null
    having count(distinct nullif(btrim(e.payload -> 'data' ->> 'campaignId'), '')) = 1
  ) camp on true
  where nullif(btrim(l.sendpilot_lead_id), '') is not null
  on conflict (integration_id, sendpilot_lead_id) do update
    set
      lead_id = coalesce(public.sendpilot_lead_identities.lead_id, excluded.lead_id),
      sendpilot_campaign_id = coalesce(
        public.sendpilot_lead_identities.sendpilot_campaign_id,
        excluded.sendpilot_campaign_id
      ),
      last_seen_at = greatest(
        public.sendpilot_lead_identities.last_seen_at,
        excluded.last_seen_at
      );

  get diagnostics identities_inserted = row_count;

  return jsonb_build_object(
    'ok', true,
    'integration_id', integration_uuid,
    'workspace_id', recovered_workspace,
    'identities_upserted', identities_inserted,
    'webhook_events_updated', events_updated,
    'syncs_updated', syncs_updated,
    'records_updated', records_updated,
    'suppressions_updated', suppressions_updated,
    'campaigns_upserted', campaigns_upserted
  );
end;
$$;

revoke all on function private.legacy_sendpilot_workspace_id() from public, anon, authenticated;
revoke all on function private.backfill_legacy_sendpilot_integration() from public, anon, authenticated;

select private.backfill_legacy_sendpilot_integration();

-- =============================================================================
-- MIGRATION 9/13 — 20261007180000_sendpilot_credential_grants.sql
-- Service-role credential RPCs. Does not copy env secrets.
-- =============================================================================

-- Phase 3: service-role RPCs to load/upsert encrypted SendPilot credentials.
-- Ciphertext stays in private.sendpilot_integration_credentials.
-- anon/authenticated cannot execute these functions.
-- Does not copy env secrets into the database.

create or replace function public.sendpilot_load_integration_credentials(p_integration_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'api_key_ciphertext', c.api_key_ciphertext,
    'webhook_secret_ciphertext', c.webhook_secret_ciphertext,
    'key_version', c.key_version
  )
  into result
  from private.sendpilot_integration_credentials c
  where c.integration_id = p_integration_id;
  return result;
end;
$$;

create or replace function public.sendpilot_upsert_integration_credentials(
  p_integration_id uuid,
  p_api_key_ciphertext text,
  p_webhook_secret_ciphertext text,
  p_key_version integer default 1
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.sendpilot_integration_credentials (
    integration_id,
    api_key_ciphertext,
    webhook_secret_ciphertext,
    key_version,
    rotated_at,
    updated_at
  )
  values (
    p_integration_id,
    p_api_key_ciphertext,
    p_webhook_secret_ciphertext,
    coalesce(p_key_version, 1),
    now(),
    now()
  )
  on conflict (integration_id) do update
    set
      api_key_ciphertext = excluded.api_key_ciphertext,
      webhook_secret_ciphertext = excluded.webhook_secret_ciphertext,
      key_version = excluded.key_version,
      rotated_at = now(),
      updated_at = now();
end;
$$;

revoke all on function public.sendpilot_load_integration_credentials(uuid) from public, anon, authenticated;
revoke all on function public.sendpilot_upsert_integration_credentials(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.sendpilot_load_integration_credentials(uuid) to service_role;
grant execute on function public.sendpilot_upsert_integration_credentials(uuid, text, text, integer) to service_role;

-- =============================================================================
-- MIGRATION 10/13 — 20261007210000_sendpilot_integration_management.sql
-- Admin-only integration mutation policies.
-- =============================================================================

-- Phase 4: SendPilot Integrations management.
-- Additive only. Does not rewrite Phase 1 or Phase 3 migrations.
-- Does not hard-delete integrations, credentials, campaigns, identities, or webhook history.
-- Does not grant credential RPCs to authenticated clients.
-- Webhook apply continues to use the service role, which bypasses RLS.

alter table public.sendpilot_integrations
  add column if not exists last_campaign_sync_at timestamptz,
  add column if not exists credentials_present boolean not null default false;

comment on column public.sendpilot_integrations.last_campaign_sync_at is
  'Set when campaign discovery succeeds for this integration. Unused while campaign-list sync is unavailable.';
comment on column public.sendpilot_integrations.credentials_present is
  'True after encrypted credentials are stored. Never holds plaintext, ciphertext, or env secrets.';

-- Replace Phase 1 is_internal() mutation policies with is_sendpilot_admin()
-- (profiles.role = sales_lead). SELECT stays is_internal() so authenticated
-- workspace users can still see safe integration metadata.

-- sendpilot_integrations: drop internal insert/update; admin-only mutations.
drop policy if exists sendpilot_integrations_insert on public.sendpilot_integrations;
drop policy if exists sendpilot_integrations_update on public.sendpilot_integrations;
create policy sendpilot_integrations_insert on public.sendpilot_integrations
  for insert to authenticated
  with check ((select private.is_sendpilot_admin()));
create policy sendpilot_integrations_update on public.sendpilot_integrations
  for update to authenticated
  using ((select private.is_sendpilot_admin()))
  with check ((select private.is_sendpilot_admin()));

-- sendpilot_campaigns: same tightening. Service-role webhook/sync writes still work.
drop policy if exists sendpilot_campaigns_insert on public.sendpilot_campaigns;
drop policy if exists sendpilot_campaigns_update on public.sendpilot_campaigns;
create policy sendpilot_campaigns_insert on public.sendpilot_campaigns
  for insert to authenticated
  with check ((select private.is_sendpilot_admin()));
create policy sendpilot_campaigns_update on public.sendpilot_campaigns
  for update to authenticated
  using ((select private.is_sendpilot_admin()))
  with check ((select private.is_sendpilot_admin()));

-- sendpilot_campaign_tracking: admin-only campaign selection changes.
drop policy if exists sendpilot_campaign_tracking_insert on public.sendpilot_campaign_tracking;
drop policy if exists sendpilot_campaign_tracking_update on public.sendpilot_campaign_tracking;
create policy sendpilot_campaign_tracking_insert on public.sendpilot_campaign_tracking
  for insert to authenticated
  with check ((select private.is_sendpilot_admin()));
create policy sendpilot_campaign_tracking_update on public.sendpilot_campaign_tracking
  for update to authenticated
  using ((select private.is_sendpilot_admin()))
  with check ((select private.is_sendpilot_admin()));

-- sendpilot_lead_identities: stop non-admin authenticated writes.
-- Webhook dual-write uses service role and is unchanged.
drop policy if exists sendpilot_lead_identities_insert on public.sendpilot_lead_identities;
drop policy if exists sendpilot_lead_identities_update on public.sendpilot_lead_identities;
create policy sendpilot_lead_identities_insert on public.sendpilot_lead_identities
  for insert to authenticated
  with check ((select private.is_sendpilot_admin()));
create policy sendpilot_lead_identities_update on public.sendpilot_lead_identities
  for update to authenticated
  using ((select private.is_sendpilot_admin()))
  with check ((select private.is_sendpilot_admin()));

-- sendpilot_integration_audit: admin insert only. Drop authenticated update so
-- audit rows cannot be rewritten from the browser. Service role is unaffected.
drop policy if exists sendpilot_integration_audit_insert on public.sendpilot_integration_audit;
drop policy if exists sendpilot_integration_audit_update on public.sendpilot_integration_audit;
create policy sendpilot_integration_audit_insert on public.sendpilot_integration_audit
  for insert to authenticated
  with check ((select private.is_sendpilot_admin()));

-- No DELETE policies. Permanent delete remains unavailable.

-- Credential ciphertext stays private + service-role RPCs from Phase 3.
revoke all on table private.sendpilot_integration_credentials from public, anon, authenticated;

-- =============================================================================
-- MIGRATION 11/13 — 20261007220000_sendpilot_cross_workspace_matching.sql
-- Webhook PK becomes (integration_id, event_id). Requires Realynk Main from 8.
-- =============================================================================

-- Phase 5: cross-workspace matching safety.
-- Additive. Does not rewrite Phase 1–4 migrations.
-- There is no repo evidence that SendPilot/Svix event IDs are unique across workspaces,
-- so webhook idempotency becomes (integration_id, event_id) before non-legacy CRM apply.
-- This migration fails closed: it does not guess a legacy integration, overwrite
-- existing integration_id values, delete webhook history, or replace the primary key
-- if NULL integration_id rows or duplicate (integration_id, event_id) pairs remain.

alter table public.sendpilot_records
  add column if not exists review_metadata jsonb not null default '{}'::jsonb;

comment on column public.sendpilot_records.review_metadata is
  'Safe review evidence only. Never store API keys, webhook secrets, encryption keys, or ciphertext.';

do $$
declare
  legacy_count integer;
  legacy uuid;
  remaining_nulls integer;
  duplicate_pairs integer;
begin
  select count(*)
  into legacy_count
  from public.sendpilot_integrations
  where legacy_env = true;

  if legacy_count = 0 then
    raise exception 'Phase 5 webhook key change stopped: no legacy SendPilot integration (legacy_env = true) was found.';
  end if;

  if legacy_count > 1 then
    raise exception 'Phase 5 webhook key change stopped: more than one legacy SendPilot integration (legacy_env = true) was found.';
  end if;

  select id
  into legacy
  from public.sendpilot_integrations
  where legacy_env = true;

  update public.sendpilot_webhook_events
  set integration_id = legacy
  where integration_id is null;

  select count(*)
  into remaining_nulls
  from public.sendpilot_webhook_events
  where integration_id is null;

  if remaining_nulls > 0 then
    raise exception 'Phase 5 webhook key change stopped: sendpilot_webhook_events.integration_id still has NULL rows after the legacy backfill.';
  end if;

  select count(*)
  into duplicate_pairs
  from (
    select integration_id, event_id
    from public.sendpilot_webhook_events
    group by integration_id, event_id
    having count(*) > 1
  ) duplicates;

  if duplicate_pairs > 0 then
    raise exception 'Phase 5 webhook key change stopped: duplicate (integration_id, event_id) rows exist. No webhook rows were deleted or merged.';
  end if;
end $$;

alter table public.sendpilot_webhook_events
  alter column integration_id set not null;

alter table public.sendpilot_webhook_events
  drop constraint if exists sendpilot_webhook_events_pkey;

alter table public.sendpilot_webhook_events
  add primary key (integration_id, event_id);

create index if not exists sendpilot_webhook_events_event_id_idx
  on public.sendpilot_webhook_events (event_id);

create index if not exists sendpilot_records_integration_external_idx
  on public.sendpilot_records (integration_id, external_id)
  where integration_id is not null and external_id is not null;

-- =============================================================================
-- MIGRATION 12/13 — 20261007230000_sendpilot_credential_status.sql
-- api_key_configured / webhook_secret_configured flags. Empty UPDATE is a no-op.
-- =============================================================================

-- Phase 5.1: separate safe credential presence flags for staged onboarding.
-- Additive. Does not rewrite Phase 1–5 migrations.
-- Does not store plaintext, ciphertext, or encryption keys.
-- Does not change Realynk Main credentials, webhook URL, or tracking mode.

alter table public.sendpilot_integrations
  add column if not exists api_key_configured boolean not null default false,
  add column if not exists webhook_secret_configured boolean not null default false;

comment on column public.sendpilot_integrations.api_key_configured is
  'True after an encrypted API key is stored for this integration. Never holds plaintext, ciphertext, or env secrets.';
comment on column public.sendpilot_integrations.webhook_secret_configured is
  'True after an encrypted webhook signing secret is stored for this integration. Never holds plaintext, ciphertext, or env secrets.';

-- Non-legacy rows that already reported both credentials present keep both flags true.
-- Realynk Main (legacy_env) is left false so the UI continues to show legacy environment, not stored ciphertext.
update public.sendpilot_integrations
set
  api_key_configured = true,
  webhook_secret_configured = true
where credentials_present = true
  and legacy_env = false
  and api_key_configured = false
  and webhook_secret_configured = false;

-- =============================================================================
-- MIGRATION 13/13 — 20261008020000_executive_role_security.sql
-- Draft PR #35 (unmerged). Executive role + CRM write lock. Copied from cursor/executive-role-foundation-a3ff.
-- =============================================================================

-- Phase 1: Executive read-only role and CRM write lock.
-- Does not update existing profiles.role values.
-- Does not change SendPilot webhook apply (service_role bypasses RLS).
-- SELECT policies stay private.is_internal() so every internal profile can read.
-- Rollback notes: 20261008020000_executive_role_security.rollback.md

alter type public.user_role add value if not exists 'executive';

alter table public.profiles
  alter column role set default 'member';

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    'member'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function private.can_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'sales_lead'::public.user_role
  );
$$;

revoke all on function private.can_write() from public;
grant execute on function private.can_write() to authenticated;

create or replace function private.protect_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  remaining_admins integer;
begin
  if new.role is distinct from old.role and coalesce(auth.role(), '') <> 'service_role' then
    new.role := old.role;
  end if;
  if old.role = 'sales_lead'::public.user_role and new.role is distinct from old.role then
    select count(*) filter (where role = 'sales_lead'::public.user_role)
      into remaining_admins
    from public.profiles
    where id <> old.id;
    if coalesce(remaining_admins, 0) = 0 then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'companies', 'contacts', 'leads', 'opportunities', 'activities', 'follow_ups',
    'strategy_calls', 'recruitment_requests', 'candidates', 'interviews',
    'contracts', 'clients', 'tasks', 'notes', 'documents', 'sendpilot_syncs',
    'sendpilot_records', 'profile_batches', 'profile_batch_candidates', 'app_settings'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_insert', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete', table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select private.can_write()))',
      table_name || '_insert',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.can_write())) with check ((select private.can_write()))',
      table_name || '_update',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select private.can_write()))',
      table_name || '_delete',
      table_name
    );
  end loop;
end $$;

drop policy if exists activities_update on public.activities;
drop policy if exists activities_delete on public.activities;
drop policy if exists notes_update on public.notes;
drop policy if exists notes_delete on public.notes;

drop policy if exists sendpilot_suppressions_insert on public.sendpilot_suppressions;
drop policy if exists sendpilot_suppressions_update on public.sendpilot_suppressions;
create policy sendpilot_suppressions_insert
  on public.sendpilot_suppressions for insert to authenticated
  with check ((select private.can_write()));
create policy sendpilot_suppressions_update
  on public.sendpilot_suppressions for update to authenticated
  using ((select private.can_write()))
  with check ((select private.can_write()));

drop policy if exists opportunity_documents_insert on storage.objects;
drop policy if exists opportunity_documents_update on storage.objects;
drop policy if exists opportunity_documents_delete on storage.objects;
create policy opportunity_documents_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'opportunity-documents' and (select private.can_write()));
create policy opportunity_documents_update
  on storage.objects for update to authenticated
  using (bucket_id = 'opportunity-documents' and (select private.can_write()))
  with check (bucket_id = 'opportunity-documents' and (select private.can_write()));
create policy opportunity_documents_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'opportunity-documents' and (select private.can_write()));

drop policy if exists sendpilot_imports_insert on storage.objects;
drop policy if exists sendpilot_imports_delete on storage.objects;
create policy sendpilot_imports_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sendpilot-imports'
    and (select private.can_write())
    and split_part(name, '/', 1) = (select auth.uid())::text
  );
create policy sendpilot_imports_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sendpilot-imports'
    and (select private.can_write())
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

alter function public.apply_sendpilot_import(jsonb) rename to apply_sendpilot_import_impl;
alter function public.apply_sendpilot_import_impl(jsonb) set schema private;

-- Wrappers are SECURITY DEFINER so they can call private impls after can_write().
-- auth.uid() remains the signed-in user. Impl EXECUTE is not granted to
-- authenticated/anon, so executives cannot call impls directly.
create or replace function public.apply_sendpilot_import(payload jsonb)
returns jsonb
language plpgsql
security definer
volatile
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_write() then
    raise exception 'Not authorized';
  end if;
  return private.apply_sendpilot_import_impl(payload);
end;
$$;

revoke all on function public.apply_sendpilot_import(jsonb) from public, anon;
grant execute on function public.apply_sendpilot_import(jsonb) to authenticated;
revoke all on function private.apply_sendpilot_import_impl(jsonb) from public, anon, authenticated;

alter function public.update_opportunity_stage(uuid, public.opportunity_stage, text, text, date, public.waiting_on, public.risk_level, text) rename to update_opportunity_stage_impl;
alter function public.update_opportunity_stage_impl(uuid, public.opportunity_stage, text, text, date, public.waiting_on, public.risk_level, text) set schema private;

create or replace function public.update_opportunity_stage(
  p_opportunity_id uuid,
  p_stage public.opportunity_stage,
  p_note text,
  p_next_action text,
  p_next_action_date date,
  p_waiting_on public.waiting_on,
  p_risk public.risk_level,
  p_lost_reason text default null
)
returns void
language plpgsql
security definer
volatile
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_write() then
    raise exception 'Not authorized';
  end if;
  perform private.update_opportunity_stage_impl(
    p_opportunity_id, p_stage, p_note, p_next_action, p_next_action_date, p_waiting_on, p_risk, p_lost_reason
  );
end;
$$;

revoke all on function public.update_opportunity_stage(uuid, public.opportunity_stage, text, text, date, public.waiting_on, public.risk_level, text) from public, anon;
grant execute on function public.update_opportunity_stage(uuid, public.opportunity_stage, text, text, date, public.waiting_on, public.risk_level, text) to authenticated;
revoke all on function private.update_opportunity_stage_impl(uuid, public.opportunity_stage, text, text, date, public.waiting_on, public.risk_level, text) from public, anon, authenticated;

alter function public.start_client(uuid, date, integer, numeric, text) rename to start_client_impl;
alter function public.start_client_impl(uuid, date, integer, numeric, text) set schema private;

create or replace function public.start_client(
  p_opportunity_id uuid,
  p_start_date date,
  p_number_of_vas integer,
  p_billing_rate numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_write() then
    raise exception 'Not authorized';
  end if;
  return private.start_client_impl(p_opportunity_id, p_start_date, p_number_of_vas, p_billing_rate, p_note);
end;
$$;

revoke all on function public.start_client(uuid, date, integer, numeric, text) from public, anon;
grant execute on function public.start_client(uuid, date, integer, numeric, text) to authenticated;
revoke all on function private.start_client_impl(uuid, date, integer, numeric, text) from public, anon, authenticated;

alter function public.load_sample_workspace() rename to load_sample_workspace_impl;
alter function public.load_sample_workspace_impl() set schema private;

create or replace function public.load_sample_workspace()
returns jsonb
language plpgsql
security definer
volatile
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_write() then
    raise exception 'Sign in before loading the sample workspace';
  end if;
  return private.load_sample_workspace_impl();
end;
$$;

revoke all on function public.load_sample_workspace() from public, anon;
grant execute on function public.load_sample_workspace() to authenticated;
revoke all on function private.load_sample_workspace_impl() from public, anon, authenticated;

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
  if uid is null or not private.can_write() then
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
  if auth.uid() is null or not private.can_write() then
    raise exception 'Not authorized';
  end if;
  update public.sendpilot_suppressions
  set released_at = now(), released_by = auth.uid()
  where id = p_suppression_id and released_at is null;
end;
$$;

