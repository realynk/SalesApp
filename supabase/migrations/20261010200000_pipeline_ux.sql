-- Pipeline UX: manual next-action override and talent-request draft state.
-- Do not apply to production until reviewed and approved.
-- Does not change existing RLS.

alter table public.opportunities
  add column if not exists next_action_manual boolean not null default false,
  add column if not exists talent_request_draft text,
  add column if not exists talent_request_sent_on date;
