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
