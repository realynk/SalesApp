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
