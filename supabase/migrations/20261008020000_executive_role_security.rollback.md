# Rollback: `20261008020000_executive_role_security`

Do **not** run this unless you are reverting Phase 1 after a successful apply. Do not use it as a forward migration. Prefer a review/staging database first.

This rollback restores callable CRM write paths for existing `sales_lead` accounts. It does **not** automatically make new Auth users `sales_lead` again. Keep public email signup disabled. New users should stay `member` unless you deliberately promote them with SQL.

Do **not** `UPDATE public.profiles` to change existing Admin (`sales_lead`) rows.

## Deployment rollback order

1. Confirm at least one `sales_lead` row still exists.
2. Roll back the **application** to the revision from before PR #35 (so the app no longer requires `executive` / `requireWriter`).
3. Then apply the SQL in “Restore previous RPC definitions” and “Restore previous RLS write policies” on the same database.
4. Reload the PostgREST schema cache if RPC names 404.
5. Leave the `executive` enum value in place (see below).
6. Do not reopen public signup. Do not create CEO accounts as part of recovery.

If the app revision after PR #35 must stay deployed, skip step 2. `requireWriter()` still allows `sales_lead`. Only the database objects need restoring if you are undoing the SQL lock.

## Protect existing Admin accounts

```sql
-- Read-only check. Do not update these rows during rollback.
select id, email, role
from public.profiles
where role = 'sales_lead';
```

Stop if this returns no rows. Do not demote or rewrite `sales_lead` during rollback.

## Handling the `executive` enum value

Do **not** try to remove `executive` from `public.user_role`. PostgreSQL cannot drop an enum value safely if anything referenced it.

Leave `executive` unused. No profile should be set to `executive` during rollback.

## Restore previous profile default and Auth trigger (optional)

Prefer keeping the secure default (`member`) and `handle_new_user` inserting `member`.

Only if you must match pre-Phase-1 behavior (every new Auth user becomes Admin):

```sql
alter table public.profiles
  alter column role set default 'sales_lead';

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
    'sales_lead'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
```

That reopens automatic Admin on **new** Auth users. Do not do this if signup could be enabled.

The last-admin trigger (`private.protect_profile_role`) can stay. It does not change existing roles.

## Restore previous RPC definitions

Move the Phase 1 impls back to `public` under the original names, then drop the wrappers.

```sql
drop function if exists public.apply_sendpilot_import(jsonb);
alter function private.apply_sendpilot_import_impl(jsonb) set schema public;
alter function public.apply_sendpilot_import_impl(jsonb) rename to apply_sendpilot_import;
revoke all on function public.apply_sendpilot_import(jsonb) from public, anon;
grant execute on function public.apply_sendpilot_import(jsonb) to authenticated;

drop function if exists public.update_opportunity_stage(uuid, public.opportunity_stage, text, text, date, public.waiting_on, public.risk_level, text);
alter function private.update_opportunity_stage_impl(uuid, public.opportunity_stage, text, text, date, public.waiting_on, public.risk_level, text) set schema public;
alter function public.update_opportunity_stage_impl(uuid, public.opportunity_stage, text, text, date, public.waiting_on, public.risk_level, text) rename to update_opportunity_stage;
revoke all on function public.update_opportunity_stage(uuid, public.opportunity_stage, text, text, date, public.waiting_on, public.risk_level, text) from public, anon;
grant execute on function public.update_opportunity_stage(uuid, public.opportunity_stage, text, text, date, public.waiting_on, public.risk_level, text) to authenticated;

drop function if exists public.start_client(uuid, date, integer, numeric, text);
alter function private.start_client_impl(uuid, date, integer, numeric, text) set schema public;
alter function public.start_client_impl(uuid, date, integer, numeric, text) rename to start_client;
revoke all on function public.start_client(uuid, date, integer, numeric, text) from public, anon;
grant execute on function public.start_client(uuid, date, integer, numeric, text) to authenticated;

drop function if exists public.load_sample_workspace();
alter function private.load_sample_workspace_impl() set schema public;
alter function public.load_sample_workspace_impl() rename to load_sample_workspace;
revoke all on function public.load_sample_workspace() from public, anon;
grant execute on function public.load_sample_workspace() to authenticated;
```

`delete_lead_permanently` and `release_sendpilot_suppression` were replaced in place. Restore their previous bodies from `supabase/migrations/20260926223000_lead_archive_and_suppression.sql` (the `is_internal()` guards), or keep the `can_write()` guards if you only need to undo the wrappers.

## Restore previous RLS write policies

This reopens insert/update/delete to every internal profile (`is_internal()`), which is the pre-Phase-1 model. Only do this if you must undo the write lock.

```sql
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
      'create policy %I on public.%I for insert to authenticated with check ((select private.is_internal()))',
      table_name || '_insert',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select private.is_internal())) with check ((select private.is_internal()))',
      table_name || '_update',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select private.is_internal()))',
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
  with check ((select private.is_internal()));
create policy sendpilot_suppressions_update
  on public.sendpilot_suppressions for update to authenticated
  using ((select private.is_internal()))
  with check ((select private.is_internal()));

drop policy if exists opportunity_documents_insert on storage.objects;
drop policy if exists opportunity_documents_update on storage.objects;
drop policy if exists opportunity_documents_delete on storage.objects;
create policy opportunity_documents_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'opportunity-documents' and (select private.is_internal()));
create policy opportunity_documents_update
  on storage.objects for update to authenticated
  using (bucket_id = 'opportunity-documents' and (select private.is_internal()))
  with check (bucket_id = 'opportunity-documents' and (select private.is_internal()));
create policy opportunity_documents_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'opportunity-documents' and (select private.is_internal()));

drop policy if exists sendpilot_imports_insert on storage.objects;
drop policy if exists sendpilot_imports_delete on storage.objects;
create policy sendpilot_imports_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sendpilot-imports'
    and (select private.is_internal())
    and split_part(name, '/', 1) = (select auth.uid())::text
  );
create policy sendpilot_imports_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sendpilot-imports'
    and (select private.is_internal())
    and split_part(name, '/', 1) = (select auth.uid())::text
  );
```

SELECT policies were not changed by Phase 1. Do not drop them.

`private.can_write()` can remain. Nothing requires dropping it.

## After rollback

- Existing `sales_lead` accounts should still be Admins.
- SendPilot webhooks still use the service role and do not depend on these wrappers.
- Do not assign `executive` or create a CEO user as part of recovery.
