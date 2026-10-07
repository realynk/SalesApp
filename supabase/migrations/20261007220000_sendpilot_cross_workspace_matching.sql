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
