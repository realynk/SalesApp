-- Phase 5: cross-workspace matching safety.
-- Additive. Does not rewrite Phase 1–4 migrations.
-- There is no repo evidence that SendPilot/Svix event IDs are unique across workspaces,
-- so webhook idempotency becomes (integration_id, event_id) before non-legacy CRM apply.

alter table public.sendpilot_records
  add column if not exists review_metadata jsonb not null default '{}'::jsonb;

comment on column public.sendpilot_records.review_metadata is
  'Safe review evidence only. Never store API keys, webhook secrets, encryption keys, or ciphertext.';

do $$
declare
  legacy uuid;
begin
  select id into legacy from public.sendpilot_integrations where legacy_env limit 1;
  if legacy is not null then
    update public.sendpilot_webhook_events
    set integration_id = legacy
    where integration_id is null;
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
