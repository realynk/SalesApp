-- Record who completed a follow-up. Additive only. Existing RLS is unchanged.

alter table public.follow_ups
  add column if not exists completed_by uuid references public.profiles (id);
