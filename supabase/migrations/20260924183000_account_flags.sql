-- Per-account flags on the client journey board and drop prompts.

alter table public.leads
  add column if not exists account_flag text;

alter table public.opportunities
  add column if not exists account_flag text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leads_account_flag_check'
  ) then
    alter table public.leads
      add constraint leads_account_flag_check
      check (
        account_flag is null
        or account_flag in (
          'Urgent',
          'Follow up',
          'Waiting on client',
          'Waiting on recruitment',
          'At risk'
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'opportunities_account_flag_check'
  ) then
    alter table public.opportunities
      add constraint opportunities_account_flag_check
      check (
        account_flag is null
        or account_flag in (
          'Urgent',
          'Follow up',
          'Waiting on client',
          'Waiting on recruitment',
          'At risk'
        )
      );
  end if;
end
$$;
