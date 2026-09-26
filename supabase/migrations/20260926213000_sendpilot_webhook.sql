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
