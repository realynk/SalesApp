-- Interested and Sent Profiles column flags.

alter table public.leads drop constraint if exists leads_account_flag_check;
alter table public.opportunities drop constraint if exists opportunities_account_flag_check;

alter table public.leads
  add constraint leads_account_flag_check
  check (
    account_flag is null
    or account_flag in (
      'Urgent',
      'Follow up',
      'Waiting on client',
      'Waiting on recruitment',
      'At risk',
      'First follow up',
      'Second Follow up',
      'No Email',
      'LinkedIn-First Follow up',
      'LinkedIn-Second Follow Up',
      'Email- First Follow up',
      'Email- Second Follow up'
    )
  );

alter table public.opportunities
  add constraint opportunities_account_flag_check
  check (
    account_flag is null
    or account_flag in (
      'Urgent',
      'Follow up',
      'Waiting on client',
      'Waiting on recruitment',
      'At risk',
      'First follow up',
      'Second Follow up',
      'No Email',
      'LinkedIn-First Follow up',
      'LinkedIn-Second Follow Up',
      'Email- First Follow up',
      'Email- Second Follow up'
    )
  );
