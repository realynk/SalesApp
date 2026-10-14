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
