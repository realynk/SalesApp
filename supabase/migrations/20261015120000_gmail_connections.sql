-- Per-user Gmail OAuth for sales-profile emails.
-- Do not apply to production until reviewed and approved.
-- Tokens are stored encrypted by the app. RLS keeps each row to its owner.
-- Does not change existing CRM tables or SendPilot policies.

create table if not exists public.gmail_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email text not null,
  refresh_token_ciphertext text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gmail_connections enable row level security;

drop policy if exists gmail_connections_select_own on public.gmail_connections;
create policy gmail_connections_select_own
  on public.gmail_connections
  for select
  to authenticated
  using (user_id = (select auth.uid()) and (select private.can_write()));

drop policy if exists gmail_connections_insert_own on public.gmail_connections;
create policy gmail_connections_insert_own
  on public.gmail_connections
  for insert
  to authenticated
  with check (user_id = (select auth.uid()) and (select private.can_write()));

drop policy if exists gmail_connections_update_own on public.gmail_connections;
create policy gmail_connections_update_own
  on public.gmail_connections
  for update
  to authenticated
  using (user_id = (select auth.uid()) and (select private.can_write()))
  with check (user_id = (select auth.uid()) and (select private.can_write()));

drop policy if exists gmail_connections_delete_own on public.gmail_connections;
create policy gmail_connections_delete_own
  on public.gmail_connections
  for delete
  to authenticated
  using (user_id = (select auth.uid()) and (select private.can_write()));
