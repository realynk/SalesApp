-- Sort Not Interested leads on the board: Nurture, left the company,
-- not the decision maker, not relevant, or stop.

alter table public.leads
  add column if not exists not_interested_outcome text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_not_interested_outcome_check'
  ) then
    alter table public.leads
      add constraint leads_not_interested_outcome_check
      check (
        not_interested_outcome is null
        or not_interested_outcome in (
          'Nurture',
          'No longer in the company',
          'Not the decision maker',
          'Not relevant',
          'Stop'
        )
      );
  end if;
end
$$;

update public.leads
set not_interested_outcome = 'Nurture'
where sendpilot_status = 'Not Interested'
  and not_interested_outcome is null;

create index if not exists leads_not_interested_outcome_idx
  on public.leads (not_interested_outcome)
  where sendpilot_status = 'Not Interested';
