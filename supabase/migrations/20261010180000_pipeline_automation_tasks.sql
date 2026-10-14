-- Pipeline automation keys for idempotent follow-ups and tasks.
-- Do not apply to production until reviewed and approved.
-- Adds columns only. Existing RLS on follow_ups and tasks is unchanged.

alter table public.follow_ups
  add column if not exists automation_key text,
  add column if not exists automation_type text,
  add column if not exists urgent boolean not null default false,
  add column if not exists pending_schedule boolean not null default false;

alter table public.tasks
  add column if not exists automation_key text,
  add column if not exists automation_type text,
  add column if not exists follow_up_id uuid references public.follow_ups (id) on delete set null,
  add column if not exists urgent boolean not null default false,
  add column if not exists pending_schedule boolean not null default false;

create unique index if not exists follow_ups_automation_key_uidx
  on public.follow_ups (automation_key)
  where automation_key is not null;

create unique index if not exists tasks_automation_key_uidx
  on public.tasks (automation_key)
  where automation_key is not null;

create index if not exists follow_ups_automation_type_idx
  on public.follow_ups (automation_type)
  where status = 'open';

create index if not exists tasks_follow_up_id_idx
  on public.tasks (follow_up_id);

alter table public.opportunities
  add column if not exists target_start_on date;
