-- Realynk Sales & Growth Command Center
-- Apply in the Supabase SQL editor or with the Supabase CLI.
-- SendPilot status and the internal sales pipeline are separate.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.sendpilot_status as enum (
  'Interested',
  'Not Interested',
  'Meeting Booked',
  'Meeting Complete',
  'Closed',
  'Wrong Person',
  'No Response'
);

create type public.opportunity_stage as enum (
  'Interested',
  'Email / Profile Preparation',
  'Strategy Call Proposed',
  'Strategy Call Scheduled',
  'Strategy Call Complete',
  'Requirements Captured',
  'Recruitment',
  'Profiles Ready',
  'Profiles Sent',
  'Client Review',
  'Interview Scheduled',
  'Interview Complete',
  'Candidate Selected',
  'SOW Preparation',
  'SOW Sent',
  'SOW Negotiation',
  'SOW Signed',
  'Onboarding',
  'Client Started',
  'Won',
  'Lost',
  'On Hold / Nurture'
);

create type public.opportunity_status as enum ('active', 'won', 'lost', 'nurture', 'on_hold');
create type public.risk_level as enum ('low', 'medium', 'high', 'critical');
create type public.waiting_on as enum ('none', 'client', 'recruitment', 'internal', 'candidate');
create type public.follow_up_status as enum ('open', 'completed', 'cancelled');
create type public.user_role as enum ('sales_lead', 'recruiter', 'member');

create type public.activity_type as enum (
  'lead_imported',
  'sendpilot_status_changed',
  'lead_became_interested',
  'email_received',
  'profile_sent',
  'proposal_sent',
  'strategy_call_scheduled',
  'strategy_call_completed',
  'requirements_captured',
  'recruitment_requested',
  'candidate_added',
  'candidate_profile_sent',
  'client_response_received',
  'interview_scheduled',
  'interview_completed',
  'candidate_selected',
  'sow_sent',
  'sow_signed',
  'client_started',
  'follow_up_created',
  'follow_up_completed',
  'note_added',
  'stage_changed',
  'opportunity_created',
  'record_updated'
);

create type public.recruitment_status as enum (
  'Not Started',
  'Sourcing',
  'Screening',
  'Profiles Ready',
  'Sent to Client',
  'Client Reviewing',
  'Interview Requested',
  'Candidate Selected',
  'No Suitable Candidate',
  'On Hold'
);

create type public.candidate_status as enum (
  'Sourcing',
  'Screening',
  'Profile Ready',
  'Sent',
  'Shortlisted',
  'Interview',
  'Selected',
  'Rejected',
  'Withdrawn'
);

create type public.interview_status as enum (
  'Requested',
  'Scheduled',
  'Completed',
  'Client Reviewing',
  'Additional Interview',
  'Selected',
  'Rejected',
  'No-show',
  'Reschedule'
);

create type public.contract_status as enum (
  'Preparing',
  'Sent',
  'Negotiating',
  'Signed',
  'Cancelled'
);

create type public.client_status as enum ('active', 'paused', 'ended');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Historical records cannot be changed or deleted';
end;
$$;

create or replace function private.normalize_email(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(btrim(coalesce(value, ''))), '');
$$;

create or replace function private.normalize_linkedin(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(btrim(coalesce(value, ''))), '^https?://(www\.)?', ''),
      '/+$',
      ''
    ),
    ''
  );
$$;

create or replace function private.normalize_name(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(lower(btrim(coalesce(value, ''))), '\s+', ' ', 'g'), '');
$$;

create or replace function private.normalize_sendpilot_status(value text)
returns public.sendpilot_status
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text := private.normalize_name(value);
begin
  if cleaned is null then
    return null;
  end if;
  return case cleaned
    when 'interested' then 'Interested'::public.sendpilot_status
    when 'not interested' then 'Not Interested'::public.sendpilot_status
    when 'notinterested' then 'Not Interested'::public.sendpilot_status
    when 'uninterested' then 'Not Interested'::public.sendpilot_status
    when 'meeting booked' then 'Meeting Booked'::public.sendpilot_status
    when 'booked' then 'Meeting Booked'::public.sendpilot_status
    when 'meeting complete' then 'Meeting Complete'::public.sendpilot_status
    when 'meeting completed' then 'Meeting Complete'::public.sendpilot_status
    when 'closed' then 'Closed'::public.sendpilot_status
    when 'wrong person' then 'Wrong Person'::public.sendpilot_status
    when 'no response' then 'No Response'::public.sendpilot_status
    when 'no reply' then 'No Response'::public.sendpilot_status
    when 'unresponsive' then 'No Response'::public.sendpilot_status
    else null
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.user_role not null default 'sales_lead',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text generated always as (
    nullif(regexp_replace(lower(btrim(name)), '\s+', ' ', 'g'), '')
  ) stored,
  website text,
  industry text,
  timezone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index companies_name_key_unique on public.companies (name_key);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text,
  email_key text generated always as (
    nullif(lower(btrim(coalesce(email, ''))), '')
  ) stored,
  phone text,
  linkedin_url text,
  linkedin_key text generated always as (
    nullif(
      regexp_replace(
        regexp_replace(lower(btrim(coalesce(linkedin_url, ''))), '^https?://(www\.)?', ''),
        '/+$',
        ''
      ),
      ''
    )
  ) stored,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index contacts_email_key_unique on public.contacts (email_key) where email_key is not null;
create unique index contacts_linkedin_key_unique on public.contacts (linkedin_key) where linkedin_key is not null;
create index contacts_company_idx on public.contacts (company_id);
create index contacts_name_trgm on public.contacts using gin ((first_name || ' ' || last_name) gin_trgm_ops);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references public.contacts (id) on delete cascade,
  company_id uuid not null references public.companies (id),
  source text not null default 'sendpilot',
  sendpilot_status public.sendpilot_status,
  sendpilot_status_raw text,
  last_synced_at timestamptz,
  requires_review boolean not null default false,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_company_idx on public.leads (company_id);
create index leads_status_idx on public.leads (sendpilot_status);
create index leads_review_idx on public.leads (requires_review) where requires_review;

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  company_id uuid not null references public.companies (id),
  contact_id uuid not null references public.contacts (id),
  owner_id uuid references public.profiles (id),
  title text not null,
  stage public.opportunity_stage not null default 'Interested',
  status public.opportunity_status not null default 'active',
  risk_level public.risk_level not null default 'low',
  waiting_on public.waiting_on not null default 'internal',
  next_action text,
  next_action_date date,
  last_activity_at timestamptz,
  last_activity_summary text,
  headcount integer check (headcount is null or headcount > 0),
  billing_rate numeric(12, 2) check (billing_rate is null or billing_rate >= 0),
  nurture_reason text,
  nurture_notes text,
  lost_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index opportunities_one_open_per_lead
  on public.opportunities (lead_id)
  where status in ('active', 'nurture', 'on_hold');

create index opportunities_stage_idx on public.opportunities (stage);
create index opportunities_owner_idx on public.opportunities (owner_id);
create index opportunities_next_action_idx on public.opportunities (next_action_date);
create index opportunities_last_activity_idx on public.opportunities (last_activity_at);
create index opportunities_company_idx on public.opportunities (company_id);
create index opportunities_status_idx on public.opportunities (status);
create index companies_name_trgm on public.companies using gin (name gin_trgm_ops);

create table public.pipeline_stage_history (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  previous_stage public.opportunity_stage,
  new_stage public.opportunity_stage not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles (id),
  note text
);

create index stage_history_opp_idx on public.pipeline_stage_history (opportunity_id, changed_at);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  type public.activity_type not null,
  title text not null,
  body text,
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles (id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint activities_subject_check check (opportunity_id is not null or lead_id is not null)
);

create index activities_opportunity_idx on public.activities (opportunity_id, occurred_at desc);
create index activities_lead_idx on public.activities (lead_id, occurred_at desc);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  owner_id uuid references public.profiles (id),
  title text not null,
  due_on date not null,
  status public.follow_up_status not null default 'open',
  reason text,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follow_ups_subject_check check (opportunity_id is not null or lead_id is not null)
);

create index follow_ups_open_due_idx on public.follow_ups (due_on) where status = 'open';
create index follow_ups_opportunity_idx on public.follow_ups (opportunity_id);
create index follow_ups_lead_idx on public.follow_ups (lead_id);

create table public.strategy_calls (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities (id) on delete cascade,
  call_on date,
  client_name text,
  company_name text,
  headcount_requirement integer,
  work_arrangement text,
  schedule text,
  preferred_virtual_staff text,
  tools text,
  start_date_target date,
  client_billing_rate numeric(12, 2),
  status text not null default 'Draft' check (status in ('Draft', 'Scheduled', 'Complete', 'Cancelled')),
  tasks text,
  ideal_candidate text,
  deal_breakers text,
  current_staffing text,
  reason_for_hiring text,
  main_pain_point text,
  urgency text,
  budget text,
  decision_maker text,
  decision_timeline text,
  number_of_positions integer,
  employment_type text,
  timezone text,
  special_requirements text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recruitment_requests (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities (id) on delete cascade,
  strategy_call_id uuid references public.strategy_calls (id) on delete set null,
  status public.recruitment_status not null default 'Not Started',
  target_on date not null,
  urgent boolean not null default false,
  client_name text,
  company_name text,
  headcount integer,
  work_arrangement text,
  schedule text,
  preferred_staff text,
  tools text,
  start_date date,
  billing_rate numeric(12, 2),
  ideal_candidate text,
  deal_breakers text,
  tasks text,
  notes text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recruitment_status_idx on public.recruitment_requests (status);
create index recruitment_target_idx on public.recruitment_requests (target_on);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  recruitment_request_id uuid not null references public.recruitment_requests (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  profile_path text,
  status public.candidate_status not null default 'Sourcing',
  date_added date not null default current_date,
  date_sent_to_client date,
  client_feedback text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index candidates_request_idx on public.candidates (recruitment_request_id);

create table public.candidate_status_history (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  previous_status public.candidate_status,
  new_status public.candidate_status not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles (id),
  note text
);

create index candidate_status_history_idx on public.candidate_status_history (candidate_id, changed_at);

create table public.profile_batches (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  recruitment_request_id uuid references public.recruitment_requests (id) on delete set null,
  sent_on date not null,
  profile_count integer not null check (profile_count >= 0),
  client_response text,
  follow_up_on date,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index profile_batches_opportunity_idx on public.profile_batches (opportunity_id, sent_on desc);
create index profile_batches_sent_idx on public.profile_batches (sent_on);

create table public.profile_batch_candidates (
  profile_batch_id uuid not null references public.profile_batches (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  primary key (profile_batch_id, candidate_id)
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  candidate_id uuid references public.candidates (id) on delete set null,
  candidate_name text not null,
  client_name text,
  interview_at timestamptz,
  status public.interview_status not null default 'Requested',
  client_feedback text,
  next_action text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index interviews_opportunity_idx on public.interviews (opportunity_id);
create index interviews_date_idx on public.interviews (interview_at);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities (id) on delete cascade,
  candidate_id uuid references public.candidates (id) on delete set null,
  status public.contract_status not null default 'Preparing',
  candidate_selected_on date,
  sow_preparation_on date,
  sow_sent_on date,
  negotiation_status text,
  sow_signed_on date,
  expected_start_on date,
  actual_start_on date,
  billing_rate numeric(12, 2),
  headcount integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  contact_id uuid references public.contacts (id),
  opportunity_id uuid not null unique references public.opportunities (id) on delete cascade,
  name text not null,
  start_date date not null,
  number_of_vas integer not null check (number_of_vas > 0),
  billing_rate numeric(12, 2) not null check (billing_rate >= 0),
  monthly_recurring_revenue numeric(12, 2) not null,
  annual_recurring_revenue numeric(12, 2) not null,
  status public.client_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_company_idx on public.clients (company_id);
create index clients_start_idx on public.clients (start_date);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  title text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  due_on date,
  owner_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_opportunity_idx on public.tasks (opportunity_id);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  body text not null,
  author_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint notes_subject_check check (opportunity_id is not null or lead_id is not null)
);

create index notes_opportunity_idx on public.notes (opportunity_id, created_at desc);
create index notes_lead_idx on public.notes (lead_id, created_at desc);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index documents_opportunity_idx on public.documents (opportunity_id, created_at desc);

create table public.sendpilot_syncs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('csv', 'xls', 'xlsx', 'api', 'webhook')),
  filename text,
  status text not null check (status in ('applied', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  total_records integer not null default 0,
  new_records integer not null default 0,
  existing_records integer not null default 0,
  updated_records integer not null default 0,
  matched_records integer not null default 0,
  possible_duplicates integer not null default 0,
  unmatched_records integer not null default 0,
  review_records integer not null default 0,
  error_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index sendpilot_syncs_created_idx on public.sendpilot_syncs (created_at desc);

create table public.sendpilot_records (
  id uuid primary key default gen_random_uuid(),
  sync_id uuid not null references public.sendpilot_syncs (id) on delete cascade,
  row_number integer,
  external_id text,
  raw jsonb not null default '{}'::jsonb,
  full_name text,
  first_name text,
  last_name text,
  company_name text,
  email text,
  linkedin_url text,
  phone text,
  sendpilot_status text,
  source text,
  classification text not null,
  review_required boolean not null default false,
  review_reason text,
  matched_contact_id uuid references public.contacts (id) on delete set null,
  matched_lead_id uuid references public.leads (id) on delete set null,
  applied boolean not null default false,
  created_at timestamptz not null default now()
);

create index sendpilot_records_sync_idx on public.sendpilot_records (sync_id);
create index sendpilot_records_review_idx on public.sendpilot_records (review_required) where review_required and not applied;

create table public.app_settings (
  id integer primary key default 1 check (id = 1),
  stale_after_days integer not null default 10 check (stale_after_days between 1 and 180),
  profiles_waiting_days integer not null default 5 check (profiles_waiting_days between 1 and 90),
  recruitment_target_business_days integer not null default 7 check (recruitment_target_business_days between 1 and 60),
  approaching_window_days integer not null default 3 check (approaching_window_days between 1 and 30),
  business_timezone text not null default 'America/New_York',
  sample_loaded_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

insert into public.app_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    'sales_lead'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.protect_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and coalesce(auth.role(), '') <> 'service_role' then
    new.role := old.role;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function private.protect_profile_role();

create or replace function private.record_opportunity_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  note_value text := nullif(current_setting('realynk.stage_note', true), '');
  changed_at_value timestamptz := coalesce(
    nullif(current_setting('realynk.stage_changed_at', true), '')::timestamptz,
    now()
  );
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.pipeline_stage_history (
      opportunity_id, previous_stage, new_stage, changed_at, changed_by, note
    ) values (
      new.id,
      case when tg_op = 'UPDATE' then old.stage else null end,
      new.stage,
      changed_at_value,
      auth.uid(),
      note_value
    );
  end if;
  return new;
end;
$$;

create trigger opportunities_stage_history
  after insert or update of stage on public.opportunities
  for each row execute function private.record_opportunity_stage();

create or replace function private.touch_last_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.opportunity_id is not null then
    update public.opportunities
    set
      last_activity_at = new.occurred_at,
      last_activity_summary = new.title,
      updated_at = now()
    where id = new.opportunity_id
      and (last_activity_at is null or last_activity_at <= new.occurred_at);
  end if;
  return new;
end;
$$;

create trigger activities_touch_opportunity
  after insert on public.activities
  for each row execute function private.touch_last_activity();

create trigger activities_immutable
  before update or delete on public.activities
  for each row execute function private.reject_mutation();

create trigger notes_immutable
  before update or delete on public.notes
  for each row execute function private.reject_mutation();

create trigger stage_history_immutable
  before update or delete on public.pipeline_stage_history
  for each row execute function private.reject_mutation();

create trigger candidate_history_immutable
  before update or delete on public.candidate_status_history
  for each row execute function private.reject_mutation();

create or replace function private.record_candidate_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.candidate_status_history (
      candidate_id, previous_status, new_status, changed_at, changed_by
    ) values (
      new.id,
      case when tg_op = 'UPDATE' then old.status else null end,
      new.status,
      now(),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

create trigger candidates_status_history
  after insert or update of status on public.candidates
  for each row execute function private.record_candidate_status();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'companies', 'contacts', 'leads', 'opportunities', 'follow_ups',
    'strategy_calls', 'recruitment_requests', 'candidates', 'interviews',
    'contracts', 'clients', 'tasks', 'documents', 'app_settings'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Authorization
-- ---------------------------------------------------------------------------

create or replace function private.is_internal()
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
  );
$$;

revoke all on function private.is_internal() from public;
grant execute on function private.is_internal() to authenticated;
grant usage on schema private to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'companies', 'contacts', 'leads', 'opportunities', 'activities', 'follow_ups',
    'strategy_calls', 'recruitment_requests', 'candidates', 'interviews',
    'contracts', 'clients', 'tasks', 'notes', 'documents', 'sendpilot_syncs',
    'sendpilot_records', 'profile_batches', 'profile_batch_candidates', 'app_settings'
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
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select private.is_internal()))',
      table_name || '_delete',
      table_name
    );
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles
  for select to authenticated using ((select private.is_internal()));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter table public.pipeline_stage_history enable row level security;
create policy stage_history_select on public.pipeline_stage_history
  for select to authenticated using ((select private.is_internal()));

alter table public.candidate_status_history enable row level security;
create policy candidate_history_select on public.candidate_status_history
  for select to authenticated using ((select private.is_internal()));

-- Historical tables are append-only. Direct updates are rejected by trigger.
drop policy if exists activities_update on public.activities;
drop policy if exists activities_delete on public.activities;
drop policy if exists notes_update on public.notes;
drop policy if exists notes_delete on public.notes;

insert into storage.buckets (id, name, public, file_size_limit)
values ('opportunity-documents', 'opportunity-documents', false, 10485760)
on conflict (id) do nothing;

create policy opportunity_documents_select on storage.objects
  for select to authenticated
  using (bucket_id = 'opportunity-documents' and (select private.is_internal()));

create policy opportunity_documents_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'opportunity-documents' and (select private.is_internal()));

create policy opportunity_documents_update on storage.objects
  for update to authenticated
  using (bucket_id = 'opportunity-documents' and (select private.is_internal()))
  with check (bucket_id = 'opportunity-documents' and (select private.is_internal()));

create policy opportunity_documents_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'opportunity-documents' and (select private.is_internal()));

-- ---------------------------------------------------------------------------
-- Import classification and apply
-- ---------------------------------------------------------------------------

create or replace function private.classify_lead_row(row jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  email_key text := private.normalize_email(row ->> 'email');
  linkedin_key text := private.normalize_linkedin(row ->> 'linkedin_url');
  company_key text := private.normalize_name(row ->> 'company');
  person_key text := private.normalize_name(
    case
      when btrim(concat_ws(' ', row ->> 'first_name', row ->> 'last_name')) <> ''
        then concat_ws(' ', row ->> 'first_name', row ->> 'last_name')
      else row ->> 'name'
    end
  );
  raw_status text := nullif(btrim(coalesce(row ->> 'sendpilot_status', '')), '');
  parsed_status public.sendpilot_status := private.normalize_sendpilot_status(raw_status);
  match_count integer;
  contact_record public.contacts%rowtype;
  matched_lead_id uuid;
  current_status public.sendpilot_status;
  current_phone text;
  classification text;
  reason text := null;
  display_name text;
begin
  display_name := nullif(btrim(concat_ws(' ', row ->> 'first_name', row ->> 'last_name')), '');
  if display_name is null then
    display_name := nullif(btrim(coalesce(row ->> 'name', '')), '');
  end if;

  if email_key is null and linkedin_key is null and (company_key is null or person_key is null) then
    return jsonb_build_object(
      'classification', 'unmatched',
      'reason', 'Missing email, LinkedIn, or company plus contact name',
      'review_required', true,
      'display_name', display_name,
      'sendpilot_status', parsed_status,
      'status_raw', raw_status
    );
  end if;

  select count(distinct c.id)
  into match_count
  from public.contacts c
  join public.companies co on co.id = c.company_id
  where
    (email_key is not null and c.email_key = email_key)
    or (linkedin_key is not null and c.linkedin_key = linkedin_key)
    or (
      company_key is not null
      and person_key is not null
      and co.name_key = company_key
      and private.normalize_name(concat_ws(' ', c.first_name, c.last_name)) = person_key
    );

  if match_count > 1 then
    return jsonb_build_object(
      'classification', 'possible_duplicate',
      'reason', 'Email, LinkedIn, or company and name match more than one contact',
      'review_required', true,
      'display_name', display_name,
      'sendpilot_status', parsed_status,
      'status_raw', raw_status
    );
  end if;

  if match_count = 1 then
    select c.*
    into contact_record
    from public.contacts c
    join public.companies co on co.id = c.company_id
    where
      (email_key is not null and c.email_key = email_key)
      or (linkedin_key is not null and c.linkedin_key = linkedin_key)
      or (
        company_key is not null
        and person_key is not null
        and co.name_key = company_key
        and private.normalize_name(concat_ws(' ', c.first_name, c.last_name)) = person_key
      )
    limit 1;

    if email_key is not null and contact_record.email_key is not null and contact_record.email_key <> email_key then
      reason := 'Same company and name, different email';
    elsif linkedin_key is not null and contact_record.linkedin_key is not null and contact_record.linkedin_key <> linkedin_key then
      reason := 'Matched contact has a different LinkedIn URL';
    end if;

    if reason is not null then
      return jsonb_build_object(
        'classification', 'possible_duplicate',
        'reason', reason,
        'review_required', true,
        'matched_contact_id', contact_record.id,
        'matched_name', concat_ws(' ', contact_record.first_name, contact_record.last_name),
        'display_name', display_name,
        'sendpilot_status', parsed_status,
        'status_raw', raw_status
      );
    end if;

    select id, sendpilot_status into matched_lead_id, current_status
    from public.leads
    where contact_id = contact_record.id;
    current_phone := contact_record.phone;

    classification := 'existing';
    if matched_lead_id is null
      or current_status is distinct from parsed_status
      or (
        nullif(btrim(coalesce(row ->> 'phone', '')), '') is not null
        and current_phone is distinct from btrim(row ->> 'phone')
      )
    then
      classification := 'updated';
    end if;

    if raw_status is not null and parsed_status is null then
      reason := 'SendPilot status was not recognized';
    end if;

    return jsonb_build_object(
      'classification', classification,
      'reason', reason,
      'review_required', raw_status is not null and parsed_status is null,
      'matched_contact_id', contact_record.id,
      'matched_lead_id', matched_lead_id,
      'matched_name', concat_ws(' ', contact_record.first_name, contact_record.last_name),
      'display_name', display_name,
      'sendpilot_status', parsed_status,
      'status_raw', raw_status
    );
  end if;

  return jsonb_build_object(
    'classification', 'new',
    'reason', case when raw_status is not null and parsed_status is null then 'SendPilot status was not recognized' else null end,
    'review_required', raw_status is not null and parsed_status is null,
    'display_name', display_name,
    'sendpilot_status', parsed_status,
    'status_raw', raw_status
  );
end;
$$;

create or replace function public.preview_sendpilot_import(payload jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  row jsonb;
  classified jsonb;
  rows jsonb := '[]'::jsonb;
  total integer := 0;
  new_count integer := 0;
  existing_count integer := 0;
  updated_count integer := 0;
  duplicate_count integer := 0;
  unmatched_count integer := 0;
begin
  if auth.uid() is null or not private.is_internal() then
    raise exception 'Not authorized';
  end if;
  if jsonb_typeof(payload -> 'rows') <> 'array' then
    raise exception 'Import payload is missing rows';
  end if;
  if jsonb_array_length(payload -> 'rows') > 5000 then
    raise exception 'Import is limited to 5000 rows at a time';
  end if;

  for row in select value from jsonb_array_elements(payload -> 'rows')
  loop
    classified := private.classify_lead_row(row);
    total := total + 1;
    case classified ->> 'classification'
      when 'new' then new_count := new_count + 1;
      when 'existing' then existing_count := existing_count + 1;
      when 'updated' then updated_count := updated_count + 1;
      when 'possible_duplicate' then duplicate_count := duplicate_count + 1;
      else unmatched_count := unmatched_count + 1;
    end case;
    rows := rows || jsonb_build_array(classified || jsonb_build_object(
      'row_number', coalesce((row ->> 'row_number')::integer, total + 1),
      'company', row ->> 'company',
      'email', row ->> 'email',
      'linkedin_url', row ->> 'linkedin_url',
      'phone', row ->> 'phone',
      'source', row ->> 'source'
    ));
  end loop;

  return jsonb_build_object(
    'total', total,
    'new', new_count,
    'existing', existing_count,
    'updated', updated_count,
    'possible_duplicates', duplicate_count,
    'unmatched', unmatched_count,
    'review', duplicate_count + unmatched_count,
    'rows', rows
  );
end;
$$;

create or replace function public.apply_sendpilot_import(payload jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  row jsonb;
  classified jsonb;
  sync_id uuid;
  total integer := 0;
  new_count integer := 0;
  existing_count integer := 0;
  updated_count integer := 0;
  duplicate_count integer := 0;
  unmatched_count integer := 0;
  error_count integer := 0;
  errors jsonb := '[]'::jsonb;
  company_id uuid;
  contact_id uuid;
  lead_id uuid;
  parsed_status public.sendpilot_status;
  first_name text;
  last_name text;
  full_name text;
  source_name text;
begin
  if uid is null or not private.is_internal() then
    raise exception 'Not authorized';
  end if;
  if jsonb_typeof(payload -> 'rows') <> 'array' or jsonb_array_length(payload -> 'rows') = 0 then
    raise exception 'The file has no data rows';
  end if;
  if jsonb_array_length(payload -> 'rows') > 5000 then
    raise exception 'Import is limited to 5000 rows at a time';
  end if;

  source_name := coalesce(payload ->> 'source', 'csv');
  if source_name not in ('csv', 'xls', 'xlsx') then
    source_name := 'csv';
  end if;

  insert into public.sendpilot_syncs (source, filename, status, created_by)
  values (source_name, payload ->> 'filename', 'applied', uid)
  returning id into sync_id;

  for row in select value from jsonb_array_elements(payload -> 'rows')
  loop
    total := total + 1;
    begin
      classified := private.classify_lead_row(row);
      parsed_status := nullif(classified ->> 'sendpilot_status', '')::public.sendpilot_status;
      company_id := null;
      contact_id := null;
      lead_id := null;
      first_name := nullif(btrim(coalesce(row ->> 'first_name', '')), '');
      last_name := nullif(btrim(coalesce(row ->> 'last_name', '')), '');
      full_name := coalesce(classified ->> 'display_name', row ->> 'name');
      if first_name is null and full_name is not null then
        first_name := split_part(full_name, ' ', 1);
        last_name := nullif(btrim(regexp_replace(full_name, '^\S+\s*', '')), '');
      end if;

      if classified ->> 'classification' = 'new' then
        select id into company_id
        from public.companies
        where name_key = private.normalize_name(coalesce(nullif(btrim(coalesce(row ->> 'company', '')), ''), 'Unknown company'));
        if company_id is null then
          insert into public.companies (name)
          values (coalesce(nullif(btrim(coalesce(row ->> 'company', '')), ''), 'Unknown company'))
          returning id into company_id;
        end if;

        insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url)
        values (
          company_id,
          coalesce(first_name, 'Unknown'),
          coalesce(last_name, ''),
          nullif(btrim(coalesce(row ->> 'email', '')), ''),
          nullif(btrim(coalesce(row ->> 'phone', '')), ''),
          nullif(btrim(coalesce(row ->> 'linkedin_url', '')), '')
        )
        returning id into contact_id;

        insert into public.leads (
          contact_id, company_id, source, sendpilot_status, sendpilot_status_raw,
          last_synced_at, requires_review, review_reason
        ) values (
          contact_id,
          company_id,
          coalesce(nullif(btrim(coalesce(row ->> 'source', '')), ''), 'sendpilot'),
          parsed_status,
          classified ->> 'status_raw',
          now(),
          coalesce((classified ->> 'review_required')::boolean, false),
          classified ->> 'reason'
        )
        returning id into lead_id;

        insert into public.activities (lead_id, contact_id, company_id, type, title, actor_id, occurred_at)
        values (lead_id, contact_id, company_id, 'lead_imported', 'Lead imported from SendPilot file', uid, now());

        if parsed_status = 'Interested' then
          insert into public.activities (lead_id, contact_id, company_id, type, title, actor_id, occurred_at)
          values (lead_id, contact_id, company_id, 'lead_became_interested', 'SendPilot status is Interested', uid, now());
        end if;
      elsif classified ->> 'classification' in ('existing', 'updated') then
        contact_id := (classified ->> 'matched_contact_id')::uuid;
        lead_id := nullif(classified ->> 'matched_lead_id', '')::uuid;
        select company_id into company_id from public.contacts where id = contact_id;

        update public.contacts
        set
          phone = coalesce(phone, nullif(btrim(coalesce(row ->> 'phone', '')), '')),
          linkedin_url = coalesce(linkedin_url, nullif(btrim(coalesce(row ->> 'linkedin_url', '')), '')),
          email = coalesce(email, nullif(btrim(coalesce(row ->> 'email', '')), ''))
        where id = contact_id;

        if lead_id is null then
          insert into public.leads (
            contact_id, company_id, source, sendpilot_status, sendpilot_status_raw, last_synced_at, requires_review, review_reason
          ) values (
            contact_id, company_id, coalesce(nullif(row ->> 'source', ''), 'sendpilot'),
            parsed_status, classified ->> 'status_raw', now(),
            coalesce((classified ->> 'review_required')::boolean, false), classified ->> 'reason'
          )
          returning id into lead_id;
        else
          update public.leads
          set
            sendpilot_status = parsed_status,
            sendpilot_status_raw = classified ->> 'status_raw',
            last_synced_at = now(),
            requires_review = coalesce((classified ->> 'review_required')::boolean, false),
            review_reason = classified ->> 'reason',
            source = coalesce(nullif(btrim(coalesce(row ->> 'source', '')), ''), source)
          where id = lead_id;
        end if;

        if classified ->> 'classification' = 'updated' then
          insert into public.activities (lead_id, contact_id, company_id, type, title, body, actor_id)
          values (
            lead_id, contact_id, company_id, 'sendpilot_status_changed',
            'SendPilot record updated',
            case when parsed_status is null then classified ->> 'status_raw' else parsed_status::text end,
            uid
          );
          if parsed_status = 'Interested' then
            insert into public.activities (lead_id, contact_id, company_id, type, title, actor_id)
            values (lead_id, contact_id, company_id, 'lead_became_interested', 'SendPilot status is Interested', uid);
          end if;
        end if;
      elsif classified ->> 'classification' = 'possible_duplicate' then
        contact_id := nullif(classified ->> 'matched_contact_id', '')::uuid;
        lead_id := null;
      else
        contact_id := null;
        lead_id := null;
      end if;

      insert into public.sendpilot_records (
        sync_id, row_number, raw, full_name, first_name, last_name, company_name, email,
        linkedin_url, phone, sendpilot_status, source, classification, review_required,
        review_reason, matched_contact_id, matched_lead_id, applied
      ) values (
        sync_id,
        coalesce((row ->> 'row_number')::integer, total + 1),
        coalesce(row -> 'extra', '{}'::jsonb) || row,
        full_name,
        first_name,
        last_name,
        row ->> 'company',
        nullif(btrim(coalesce(row ->> 'email', '')), ''),
        nullif(btrim(coalesce(row ->> 'linkedin_url', '')), ''),
        nullif(btrim(coalesce(row ->> 'phone', '')), ''),
        coalesce(parsed_status::text, classified ->> 'status_raw'),
        row ->> 'source',
        classified ->> 'classification',
        classified ->> 'classification' in ('possible_duplicate', 'unmatched')
          or coalesce((classified ->> 'review_required')::boolean, false),
        classified ->> 'reason',
        contact_id,
        lead_id,
        classified ->> 'classification' in ('new', 'existing', 'updated')
      );

      case classified ->> 'classification'
        when 'new' then new_count := new_count + 1;
        when 'existing' then existing_count := existing_count + 1;
        when 'updated' then updated_count := updated_count + 1;
        when 'possible_duplicate' then duplicate_count := duplicate_count + 1;
        else unmatched_count := unmatched_count + 1;
      end case;
    exception when others then
      error_count := error_count + 1;
      if jsonb_array_length(errors) < 50 then
        errors := errors || jsonb_build_array(jsonb_build_object(
          'row', coalesce(row ->> 'row_number', total::text),
          'message', sqlerrm
        ));
      end if;
    end;
  end loop;

  update public.sendpilot_syncs
  set
    completed_at = now(),
    total_records = total,
    new_records = new_count,
    existing_records = existing_count,
    updated_records = updated_count,
    matched_records = new_count + existing_count + updated_count,
    possible_duplicates = duplicate_count,
    unmatched_records = unmatched_count,
    review_records = duplicate_count + unmatched_count,
    error_count = error_count,
    errors = errors,
    status = case when error_count > 0 and new_count + updated_count + existing_count = 0 then 'failed' else 'applied' end
  where id = sync_id;

  return jsonb_build_object(
    'sync_id', sync_id,
    'total', total,
    'new', new_count,
    'existing', existing_count,
    'updated', updated_count,
    'possible_duplicates', duplicate_count,
    'unmatched', unmatched_count,
    'errors', error_count
  );
end;
$$;

create or replace function public.update_opportunity_stage(
  p_opportunity_id uuid,
  p_stage public.opportunity_stage,
  p_note text,
  p_next_action text,
  p_next_action_date date,
  p_waiting_on public.waiting_on,
  p_risk public.risk_level,
  p_lost_reason text default null
)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  previous public.opportunity_stage;
  next_status public.opportunity_status;
begin
  if uid is null or not private.is_internal() then
    raise exception 'Not authorized';
  end if;
  if p_stage = 'Client Started' then
    raise exception 'Use Client start so the start date, headcount, and billing rate are recorded';
  end if;

  select stage into previous from public.opportunities where id = p_opportunity_id;
  if previous is null then
    raise exception 'Opportunity not found';
  end if;

  if p_stage = 'Lost' then
    if nullif(btrim(coalesce(p_lost_reason, '')), '') is null then
      raise exception 'Add a lost reason before moving the opportunity to Lost';
    end if;
    next_status := 'lost';
  elsif p_stage = 'Won' then
    next_status := 'won';
  elsif p_stage = 'On Hold / Nurture' then
    next_status := 'nurture';
  else
    if nullif(btrim(coalesce(p_next_action, '')), '') is null or p_next_action_date is null then
      raise exception 'Every active opportunity needs a next action and a due date';
    end if;
    next_status := 'active';
  end if;

  perform set_config('realynk.stage_note', coalesce(p_note, ''), true);
  update public.opportunities
  set
    stage = p_stage,
    status = next_status,
    next_action = nullif(btrim(coalesce(p_next_action, '')), ''),
    next_action_date = p_next_action_date,
    waiting_on = p_waiting_on,
    risk_level = p_risk,
    lost_reason = case when p_stage = 'Lost' then btrim(p_lost_reason) else lost_reason end
  where id = p_opportunity_id;
  perform set_config('realynk.stage_note', '', true);

  if previous is distinct from p_stage then
    insert into public.activities (opportunity_id, type, title, body, actor_id, metadata)
    select
      p_opportunity_id,
      'stage_changed',
      'Stage changed to ' || p_stage::text,
      nullif(btrim(coalesce(p_note, '')), ''),
      uid,
      jsonb_build_object('from', previous, 'to', p_stage)
    from public.opportunities
    where id = p_opportunity_id;
  end if;
end;
$$;

create or replace function public.start_client(
  p_opportunity_id uuid,
  p_start_date date,
  p_number_of_vas integer,
  p_billing_rate numeric,
  p_note text default null
)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  opp public.opportunities%rowtype;
  company_name text;
  contact_name text;
  client_id uuid;
  mrr numeric(12, 2);
begin
  if uid is null or not private.is_internal() then
    raise exception 'Not authorized';
  end if;
  if p_start_date is null or p_number_of_vas is null or p_number_of_vas < 1 or p_billing_rate is null or p_billing_rate < 0 then
    raise exception 'Start date, number of VAs, and billing rate are required';
  end if;

  select * into opp from public.opportunities where id = p_opportunity_id;
  if opp.id is null then
    raise exception 'Opportunity not found';
  end if;

  select name into company_name from public.companies where id = opp.company_id;
  select concat_ws(' ', first_name, last_name) into contact_name from public.contacts where id = opp.contact_id;
  mrr := round(p_number_of_vas * p_billing_rate, 2);

  perform set_config('realynk.stage_note', coalesce(p_note, 'Client started'), true);
  update public.opportunities
  set
    stage = 'Client Started',
    status = 'won',
    headcount = p_number_of_vas,
    billing_rate = p_billing_rate,
    next_action = 'Confirm the first week of onboarding',
    next_action_date = p_start_date,
    waiting_on = 'internal',
    risk_level = 'low'
  where id = p_opportunity_id;
  perform set_config('realynk.stage_note', '', true);

  insert into public.clients (
    company_id, contact_id, opportunity_id, name, start_date, number_of_vas,
    billing_rate, monthly_recurring_revenue, annual_recurring_revenue, status
  ) values (
    opp.company_id, opp.contact_id, opp.id,
    coalesce(company_name, contact_name, 'Client'),
    p_start_date, p_number_of_vas, p_billing_rate, mrr, round(mrr * 12, 2), 'active'
  )
  on conflict (opportunity_id) do update
  set
    start_date = excluded.start_date,
    number_of_vas = excluded.number_of_vas,
    billing_rate = excluded.billing_rate,
    monthly_recurring_revenue = excluded.monthly_recurring_revenue,
    annual_recurring_revenue = excluded.annual_recurring_revenue,
    status = 'active'
  returning id into client_id;

  update public.contracts
  set actual_start_on = p_start_date, status = 'Signed'
  where opportunity_id = p_opportunity_id and actual_start_on is null;

  insert into public.activities (opportunity_id, lead_id, company_id, contact_id, type, title, body, actor_id, occurred_at)
  values (
    opp.id, opp.lead_id, opp.company_id, opp.contact_id, 'client_started',
    'Client started',
    coalesce(company_name, 'Client') || ' started with ' || p_number_of_vas || ' VA(s)',
    uid, p_start_date::timestamptz
  );

  return client_id;
end;
$$;

revoke all on function public.preview_sendpilot_import(jsonb) from public, anon;
revoke all on function public.apply_sendpilot_import(jsonb) from public, anon;
revoke all on function public.update_opportunity_stage(uuid, public.opportunity_stage, text, text, date, public.waiting_on, public.risk_level, text) from public, anon;
revoke all on function public.start_client(uuid, date, integer, numeric, text) from public, anon;
grant execute on function public.preview_sendpilot_import(jsonb) to authenticated;
grant execute on function public.apply_sendpilot_import(jsonb) to authenticated;
grant execute on function public.update_opportunity_stage(uuid, public.opportunity_stage, text, text, date, public.waiting_on, public.risk_level, text) to authenticated;
grant execute on function public.start_client(uuid, date, integer, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Sample workspace
-- Dates are relative to current_date so the command center stays current.
-- ---------------------------------------------------------------------------

create or replace function public.load_sample_workspace()
returns jsonb
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c_northstar uuid; c_harbor uuid; c_lumen uuid; c_bright uuid; c_oak uuid;
  c_summit uuid; c_cedar uuid; c_marlowe uuid; c_field uuid; c_atlas uuid;
  c_redbird uuid; c_kinfolk uuid; c_bluebird uuid; c_westline uuid; c_plover uuid;
  p_elena uuid; p_marcus uuid; p_priya uuid; p_daniel uuid; p_claire uuid;
  p_andre uuid; p_hannah uuid; p_sofia uuid; p_owen uuid; p_mei uuid;
  p_patrick uuid; p_amira uuid; p_jonah uuid; p_leah uuid; p_samir uuid;
  l_elena uuid; l_marcus uuid; l_priya uuid; l_daniel uuid; l_claire uuid;
  l_andre uuid; l_hannah uuid; l_sofia uuid; l_owen uuid; l_mei uuid;
  l_patrick uuid; l_amira uuid; l_jonah uuid; l_leah uuid; l_samir uuid;
  o_elena uuid; o_marcus uuid; o_priya uuid; o_daniel uuid; o_claire uuid;
  o_andre uuid; o_hannah uuid; o_sofia uuid; o_owen uuid; o_mei uuid;
  o_patrick uuid; o_amira uuid; o_jonah uuid;
  r_summit uuid; r_lumen uuid; r_cedar uuid;
  cand_a uuid; cand_b uuid; cand_c uuid; cand_d uuid;
  batch_id uuid;
  sync_id uuid;
begin
  if uid is null or not private.is_internal() then
    raise exception 'Sign in before loading the sample workspace';
  end if;
  if (select sample_loaded_at from public.app_settings where id = 1) is not null then
    raise exception 'Sample workspace is already loaded';
  end if;

  insert into public.companies (name, industry, timezone) values
    ('Northstar Legal Group', 'Legal', 'America/New_York') returning id into c_northstar;
  insert into public.companies (name, industry, timezone) values
    ('Harbor & Co. Accounting', 'Accounting', 'America/Chicago') returning id into c_harbor;
  insert into public.companies (name, industry, timezone) values
    ('Lumen Dental Group', 'Healthcare', 'America/Denver') returning id into c_lumen;
  insert into public.companies (name, industry, timezone) values
    ('BrightPath Mortgage', 'Financial services', 'America/New_York') returning id into c_bright;
  insert into public.companies (name, industry, timezone) values
    ('Oak & Pine Interiors', 'Design', 'America/Los_Angeles') returning id into c_oak;
  insert into public.companies (name, industry, timezone) values
    ('Summit Property Management', 'Property', 'America/Chicago') returning id into c_summit;
  insert into public.companies (name, industry, timezone) values
    ('Cedar Ridge Clinics', 'Healthcare', 'America/New_York') returning id into c_cedar;
  insert into public.companies (name, industry, timezone) values
    ('Marlowe Wealth', 'Wealth management', 'America/New_York') returning id into c_marlowe;
  insert into public.companies (name, industry, timezone) values
    ('Fieldnote Marketing', 'Marketing', 'America/Los_Angeles') returning id into c_field;
  insert into public.companies (name, industry, timezone) values
    ('Atlas Logistics', 'Logistics', 'America/Chicago') returning id into c_atlas;
  insert into public.companies (name, industry, timezone) values
    ('Redbird Insurance', 'Insurance', 'America/New_York') returning id into c_redbird;
  insert into public.companies (name, industry, timezone) values
    ('Kinfolk Hospitality', 'Hospitality', 'America/Los_Angeles') returning id into c_kinfolk;
  insert into public.companies (name, industry, timezone) values
    ('Bluebird Pediatrics', 'Healthcare', 'America/New_York') returning id into c_bluebird;
  insert into public.companies (name, industry, timezone) values
    ('Westline Architects', 'Architecture', 'America/Denver') returning id into c_westline;
  insert into public.companies (name, industry, timezone) values
    ('Plover Studio', 'Creative', 'America/New_York') returning id into c_plover;

  insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url, title) values
    (c_northstar, 'Elena', 'Voss', 'elena.voss@northstarlegal.example', '+1 212 555 0142', 'https://www.linkedin.com/in/elena-voss-northstar', 'Managing Partner') returning id into p_elena;
  insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url, title) values
    (c_harbor, 'Marcus', 'Hale', 'marcus.hale@harborandco.example', '+1 312 555 0177', 'https://www.linkedin.com/in/marcus-hale-harbor', 'COO') returning id into p_marcus;
  insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url, title) values
    (c_lumen, 'Priya', 'Shah', 'priya.shah@lumendental.example', '+1 303 555 0118', 'https://www.linkedin.com/in/priya-shah-lumen', 'Practice Administrator') returning id into p_priya;
  insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url, title) values
    (c_bright, 'Daniel', 'Cho', 'daniel.cho@brightpath.example', '+1 646 555 0190', 'https://www.linkedin.com/in/daniel-cho-brightpath', 'VP Operations') returning id into p_daniel;
  insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url, title) values
    (c_oak, 'Claire', 'Dubois', 'claire.dubois@oakandpine.example', '+1 415 555 0164', 'https://www.linkedin.com/in/claire-dubois-oak', 'Founder') returning id into p_claire;
  insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url, title) values
    (c_summit, 'Andre', 'Williams', 'andre.williams@summitpm.example', '+1 773 555 0129', 'https://www.linkedin.com/in/andre-williams-summit', 'Director of Operations') returning id into p_andre;
  insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url, title) values
    (c_cedar, 'Hannah', 'Brooks', 'hannah.brooks@cedarridge.example', '+1 917 555 0184', 'https://www.linkedin.com/in/hannah-brooks-cedar', 'Clinic Director') returning id into p_hannah;
  insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url, title) values
    (c_marlowe, 'Sofia', 'Alvarez', 'sofia.alvarez@marlowewealth.example', '+1 212 555 0133', 'https://www.linkedin.com/in/sofia-alvarez-marlowe', 'Chief of Staff') returning id into p_sofia;
  insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url, title) values
    (c_field, 'Owen', 'Blake', 'owen.blake@fieldnote.example', '+1 323 555 0155', 'https://www.linkedin.com/in/owen-blake-fieldnote', 'Founder') returning id into p_owen;
  insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url, title) values
    (c_atlas, 'Mei', 'Chen', 'mei.chen@atlaslogistics.example', '+1 312 555 0108', 'https://www.linkedin.com/in/mei-chen-atlas', 'Head of People Ops') returning id into p_mei;
  insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url, title) values
    (c_redbird, 'Patrick', 'Nguyen', 'patrick.nguyen@redbird.example', '+1 646 555 0171', 'https://www.linkedin.com/in/patrick-nguyen-redbird', 'Operations Manager') returning id into p_patrick;
  insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url, title) values
    (c_kinfolk, 'Amira', 'Hassan', 'amira.hassan@kinfolk.example', '+1 213 555 0199', 'https://www.linkedin.com/in/amira-hassan-kinfolk', 'General Manager') returning id into p_amira;
  insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url, title) values
    (c_bluebird, 'Jonah', 'Ellis', 'jonah.ellis@bluebirdpeds.example', '+1 718 555 0148', 'https://www.linkedin.com/in/jonah-ellis-bluebird', 'Office Manager') returning id into p_jonah;
  insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url, title) values
    (c_westline, 'Leah', 'Okonkwo', 'leah.okonkwo@westline.example', '+1 720 555 0160', 'https://www.linkedin.com/in/leah-okonkwo-westline', 'Principal') returning id into p_leah;
  insert into public.contacts (company_id, first_name, last_name, email, phone, linkedin_url, title) values
    (c_plover, 'Samir', 'Haddad', 'samir.haddad@plover.studio', '+1 347 555 0122', 'https://www.linkedin.com/in/samir-haddad-plover', 'Studio Director') returning id into p_samir;

  insert into public.leads (contact_id, company_id, source, sendpilot_status, last_synced_at) values
    (p_elena, c_northstar, 'SendPilot — Q3 partners', 'Interested', now()) returning id into l_elena;
  insert into public.leads (contact_id, company_id, source, sendpilot_status, last_synced_at) values
    (p_marcus, c_harbor, 'SendPilot — accounting firms', 'Meeting Booked', now()) returning id into l_marcus;
  insert into public.leads (contact_id, company_id, source, sendpilot_status, last_synced_at) values
    (p_priya, c_lumen, 'SendPilot — healthcare', 'Meeting Complete', now()) returning id into l_priya;
  insert into public.leads (contact_id, company_id, source, sendpilot_status, last_synced_at) values
    (p_daniel, c_bright, 'SendPilot — mortgage', 'Meeting Complete', now()) returning id into l_daniel;
  insert into public.leads (contact_id, company_id, source, sendpilot_status, last_synced_at) values
    (p_claire, c_oak, 'SendPilot — design studios', 'Not Interested', now()) returning id into l_claire;
  insert into public.leads (contact_id, company_id, source, sendpilot_status, last_synced_at) values
    (p_andre, c_summit, 'SendPilot — property', 'Meeting Complete', now()) returning id into l_andre;
  insert into public.leads (contact_id, company_id, source, sendpilot_status, last_synced_at) values
    (p_hannah, c_cedar, 'SendPilot — clinics', 'Meeting Complete', now()) returning id into l_hannah;
  insert into public.leads (contact_id, company_id, source, sendpilot_status, last_synced_at) values
    (p_sofia, c_marlowe, 'SendPilot — wealth', 'Meeting Complete', now()) returning id into l_sofia;
  insert into public.leads (contact_id, company_id, source, sendpilot_status, last_synced_at) values
    (p_owen, c_field, 'SendPilot — agencies', 'Not Interested', now()) returning id into l_owen;
  insert into public.leads (contact_id, company_id, source, sendpilot_status, last_synced_at) values
    (p_mei, c_atlas, 'SendPilot — logistics', 'Closed', now()) returning id into l_mei;
  insert into public.leads (contact_id, company_id, source, sendpilot_status, last_synced_at) values
    (p_patrick, c_redbird, 'SendPilot — insurance', 'Meeting Complete', now()) returning id into l_patrick;
  insert into public.leads (contact_id, company_id, source, sendpilot_status, last_synced_at) values
    (p_amira, c_kinfolk, 'SendPilot — hospitality', 'Interested', now() - interval '18 days') returning id into l_amira;
  insert into public.leads (contact_id, company_id, source, sendpilot_status, last_synced_at) values
    (p_jonah, c_bluebird, 'SendPilot — clinics', 'Meeting Booked', now()) returning id into l_jonah;
  insert into public.leads (contact_id, company_id, source, sendpilot_status, last_synced_at) values
    (p_leah, c_westline, 'SendPilot — architecture', 'Interested', now()) returning id into l_leah;
  insert into public.leads (contact_id, company_id, source, sendpilot_status, last_synced_at) values
    (p_samir, c_plover, 'SendPilot — studios', 'Interested', now()) returning id into l_samir;

  perform set_config('realynk.stage_changed_at', (now() - interval '1 day')::text, true);
  insert into public.opportunities (lead_id, company_id, contact_id, owner_id, title, stage, status, risk_level, waiting_on, next_action, next_action_date, headcount, billing_rate)
  values (l_elena, c_northstar, p_elena, uid, 'Northstar Legal Group — virtual staff', 'Email / Profile Preparation', 'active', 'low', 'internal', 'Send the firm profile and propose a strategy call', current_date, 2, 1800)
  returning id into o_elena;

  perform set_config('realynk.stage_changed_at', (now() - interval '2 days')::text, true);
  insert into public.opportunities (lead_id, company_id, contact_id, owner_id, title, stage, status, risk_level, waiting_on, next_action, next_action_date, headcount, billing_rate)
  values (l_marcus, c_harbor, p_marcus, uid, 'Harbor & Co. Accounting — virtual staff', 'Strategy Call Scheduled', 'active', 'low', 'client', 'Hold the strategy call and capture requirements', current_date + 1, 1, 1600)
  returning id into o_marcus;

  perform set_config('realynk.stage_changed_at', (now() - interval '6 days')::text, true);
  insert into public.opportunities (lead_id, company_id, contact_id, owner_id, title, stage, status, risk_level, waiting_on, next_action, next_action_date, headcount, billing_rate)
  values (l_priya, c_lumen, p_priya, uid, 'Lumen Dental Group — virtual staff', 'Profiles Sent', 'active', 'medium', 'client', 'Follow up on the three profiles sent to Priya', current_date + 1, 2, 1700)
  returning id into o_priya;

  perform set_config('realynk.stage_changed_at', (now() - interval '4 days')::text, true);
  insert into public.opportunities (lead_id, company_id, contact_id, owner_id, title, stage, status, risk_level, waiting_on, next_action, next_action_date, headcount, billing_rate)
  values (l_daniel, c_bright, p_daniel, uid, 'BrightPath Mortgage — virtual staff', 'SOW Sent', 'active', 'medium', 'client', 'Confirm Daniel has reviewed the SOW', current_date + 2, 3, 2000)
  returning id into o_daniel;

  perform set_config('realynk.stage_changed_at', (now() - interval '12 days')::text, true);
  insert into public.opportunities (lead_id, company_id, contact_id, owner_id, title, stage, status, risk_level, waiting_on, next_action, next_action_date, headcount, billing_rate, nurture_reason, nurture_notes)
  values (l_claire, c_oak, p_claire, uid, 'Oak & Pine Interiors — nurture', 'On Hold / Nurture', 'nurture', 'low', 'client', 'Revisit VA support after the holiday rush', current_date + 80, 1, 1500, 'Timing', 'May need a VA after year-end project work settles.')
  returning id into o_claire;

  perform set_config('realynk.stage_changed_at', (now() - interval '8 days')::text, true);
  insert into public.opportunities (lead_id, company_id, contact_id, owner_id, title, stage, status, risk_level, waiting_on, next_action, next_action_date, headcount, billing_rate)
  values (l_andre, c_summit, p_andre, uid, 'Summit Property Management — virtual staff', 'Recruitment', 'active', 'high', 'recruitment', 'Check sourcing progress against the overdue target', current_date, 2, 1500)
  returning id into o_andre;

  perform set_config('realynk.stage_changed_at', (now() - interval '1 day')::text, true);
  insert into public.opportunities (lead_id, company_id, contact_id, owner_id, title, stage, status, risk_level, waiting_on, next_action, next_action_date, headcount, billing_rate)
  values (l_hannah, c_cedar, p_hannah, uid, 'Cedar Ridge Clinics — virtual staff', 'Interview Scheduled', 'active', 'low', 'client', 'Prep Hannah for tomorrow''s candidate interview', current_date + 1, 1, 1850)
  returning id into o_hannah;

  perform set_config('realynk.stage_changed_at', (now() - interval '1 day')::text, true);
  insert into public.opportunities (lead_id, company_id, contact_id, owner_id, title, stage, status, risk_level, waiting_on, next_action, next_action_date, headcount, billing_rate)
  values (l_sofia, c_marlowe, p_sofia, uid, 'Marlowe Wealth — virtual staff', 'Requirements Captured', 'active', 'low', 'internal', 'Send the captured requirements to recruitment', current_date, 1, 2200)
  returning id into o_sofia;

  perform set_config('realynk.stage_changed_at', (now() - interval '20 days')::text, true);
  insert into public.opportunities (lead_id, company_id, contact_id, owner_id, title, stage, status, risk_level, waiting_on, next_action, next_action_date, headcount, billing_rate, nurture_reason, nurture_notes)
  values (l_owen, c_field, p_owen, uid, 'Fieldnote Marketing — nurture', 'On Hold / Nurture', 'nurture', 'medium', 'client', 'Ask whether the budget opened for a VA', current_date - 2, 1, 1600, 'Budget', 'Budget was closed. Revisit next quarter.')
  returning id into o_owen;

  perform set_config('realynk.stage_changed_at', (current_date::timestamptz)::text, true);
  insert into public.opportunities (lead_id, company_id, contact_id, owner_id, title, stage, status, risk_level, waiting_on, next_action, next_action_date, headcount, billing_rate)
  values (l_mei, c_atlas, p_mei, uid, 'Atlas Logistics — virtual staff', 'Won', 'won', 'low', 'none', 'Confirm week-one check-in is on the calendar', current_date + 7, 2, 1900)
  returning id into o_mei;

  perform set_config('realynk.stage_changed_at', (now() - interval '15 days')::text, true);
  insert into public.opportunities (lead_id, company_id, contact_id, owner_id, title, stage, status, risk_level, waiting_on, next_action, next_action_date, headcount, billing_rate, lost_reason)
  values (l_patrick, c_redbird, p_patrick, uid, 'Redbird Insurance — virtual staff', 'Lost', 'lost', 'low', 'none', null, null, 2, 1700, 'Hired in-house instead of a virtual assistant')
  returning id into o_patrick;

  perform set_config('realynk.stage_changed_at', (now() - interval '18 days')::text, true);
  insert into public.opportunities (lead_id, company_id, contact_id, owner_id, title, stage, status, risk_level, waiting_on, next_action, next_action_date, headcount, billing_rate)
  values (l_amira, c_kinfolk, p_amira, uid, 'Kinfolk Hospitality — virtual staff', 'Email / Profile Preparation', 'active', 'high', 'internal', 'Restart the profile email — this opportunity has gone quiet', current_date, 1, 1600)
  returning id into o_amira;

  perform set_config('realynk.stage_changed_at', (now() - interval '1 day')::text, true);
  insert into public.opportunities (lead_id, company_id, contact_id, owner_id, title, stage, status, risk_level, waiting_on, next_action, next_action_date, headcount, billing_rate)
  values (l_jonah, c_bluebird, p_jonah, uid, 'Bluebird Pediatrics — virtual staff', 'Strategy Call Proposed', 'active', 'low', 'client', 'Confirm a strategy call time with Jonah', current_date, 1, 1650)
  returning id into o_jonah;

  perform set_config('realynk.stage_changed_at', '', true);

  insert into public.pipeline_stage_history (opportunity_id, previous_stage, new_stage, changed_at, changed_by) values
    (o_priya, null, 'Interested', now() - interval '30 days', uid),
    (o_priya, 'Interested', 'Strategy Call Scheduled', now() - interval '24 days', uid),
    (o_priya, 'Strategy Call Scheduled', 'Strategy Call Complete', now() - interval '22 days', uid),
    (o_priya, 'Strategy Call Complete', 'Requirements Captured', now() - interval '21 days', uid),
    (o_priya, 'Requirements Captured', 'Recruitment', now() - interval '20 days', uid),
    (o_priya, 'Recruitment', 'Profiles Ready', now() - interval '8 days', uid),
    (o_daniel, null, 'Interested', now() - interval '40 days', uid),
    (o_daniel, 'Interested', 'Strategy Call Complete', now() - interval '28 days', uid),
    (o_daniel, 'Strategy Call Complete', 'Recruitment', now() - interval '26 days', uid),
    (o_daniel, 'Recruitment', 'Profiles Sent', now() - interval '18 days', uid),
    (o_daniel, 'Profiles Sent', 'Interview Scheduled', now() - interval '12 days', uid),
    (o_daniel, 'Interview Scheduled', 'Candidate Selected', now() - interval '9 days', uid),
    (o_daniel, 'Candidate Selected', 'SOW Preparation', now() - interval '7 days', uid),
    (o_mei, null, 'Interested', now() - interval '50 days', uid),
    (o_mei, 'Interested', 'Strategy Call Complete', now() - interval '40 days', uid),
    (o_mei, 'Strategy Call Complete', 'Recruitment', now() - interval '36 days', uid),
    (o_mei, 'Recruitment', 'Profiles Sent', now() - interval '24 days', uid),
    (o_mei, 'Profiles Sent', 'Interview Complete', now() - interval '16 days', uid),
    (o_mei, 'Interview Complete', 'Candidate Selected', now() - interval '14 days', uid),
    (o_mei, 'Candidate Selected', 'SOW Signed', now() - interval '7 days', uid),
    (o_mei, 'SOW Signed', 'Client Started', now() - interval '1 day', uid),
    (o_andre, null, 'Interested', now() - interval '21 days', uid),
    (o_andre, 'Interested', 'Strategy Call Complete', now() - interval '14 days', uid),
    (o_andre, 'Strategy Call Complete', 'Requirements Captured', now() - interval '12 days', uid),
    (o_hannah, null, 'Interested', now() - interval '18 days', uid),
    (o_hannah, 'Interested', 'Strategy Call Complete', now() - interval '11 days', uid),
    (o_hannah, 'Strategy Call Complete', 'Recruitment', now() - interval '10 days', uid),
    (o_hannah, 'Recruitment', 'Profiles Sent', now() - interval '4 days', uid);

  insert into public.activities (opportunity_id, lead_id, company_id, contact_id, type, title, occurred_at, actor_id) values
    (o_elena, l_elena, c_northstar, p_elena, 'opportunity_created', 'Opportunity opened from an interested lead', now() - interval '2 days', uid),
    (o_elena, l_elena, c_northstar, p_elena, 'email_received', 'Elena replied that the firm is open to a strategy call', now() - interval '1 day', uid),
    (o_marcus, l_marcus, c_harbor, p_marcus, 'strategy_call_scheduled', 'Strategy call scheduled', now() - interval '2 days', uid),
    (o_priya, l_priya, c_lumen, p_priya, 'profile_sent', '3 profiles sent to Priya Shah', now() - interval '6 days', uid),
    (o_daniel, l_daniel, c_bright, p_daniel, 'sow_sent', 'SOW sent to BrightPath Mortgage', now() - interval '4 days', uid),
    (o_andre, l_andre, c_summit, p_andre, 'recruitment_requested', 'Recruitment request sent', now() - interval '8 days', uid),
    (o_amira, l_amira, c_kinfolk, p_amira, 'email_received', 'Amira asked for a profile of the service', now() - interval '18 days', uid),
    (o_mei, l_mei, c_atlas, p_mei, 'client_started', 'Atlas Logistics started with 2 VAs', current_date::timestamptz, uid),
    (o_jonah, l_jonah, c_bluebird, p_jonah, 'proposal_sent', 'Strategy call times proposed to Jonah', now() - interval '1 day', uid);

  insert into public.follow_ups (opportunity_id, lead_id, owner_id, title, due_on, status, reason, notes) values
    (o_elena, l_elena, uid, 'Send the firm profile and propose a strategy call', current_date, 'open', null, 'She asked for a one-page overview before booking.'),
    (o_owen, l_owen, uid, 'Ask whether the budget opened for a VA', current_date - 2, 'open', 'Budget', 'Budget was the only objection.'),
    (o_claire, l_claire, uid, 'Revisit VA support after the holiday rush', current_date + 80, 'open', 'Timing', 'May need a VA after year-end.');

  insert into public.strategy_calls (
    opportunity_id, call_on, client_name, company_name, headcount_requirement, work_arrangement, schedule,
    preferred_virtual_staff, tools, start_date_target, client_billing_rate, status, tasks, ideal_candidate,
    deal_breakers, current_staffing, reason_for_hiring, main_pain_point, urgency, budget, decision_maker,
    decision_timeline, number_of_positions, employment_type, timezone, special_requirements, notes
  ) values
    (o_marcus, current_date + 1, 'Marcus Hale', 'Harbor & Co. Accounting', 1, 'Remote', 'Weekdays 8:00–16:00 CT', 'Accounting operations VA', 'QuickBooks, Karbon, Outlook', current_date + 30, 1600, 'Scheduled', 'Inbox triage, client document chasing, meeting notes', 'Detail-oriented, comfortable with accounting workflows', 'No experience with client-facing email', 'Two partners, no admin', 'Partners are doing their own scheduling', 'Follow-ups slip during tax prep', 'This month', 'Up to $1,600 per month', 'Marcus Hale', 'Decision on the call', 1, 'Full-time', 'America/Chicago', 'Must be comfortable with confidential client files', 'Call is tomorrow morning.'),
    (o_sofia, current_date - 1, 'Sofia Alvarez', 'Marlowe Wealth', 1, 'Remote', 'Weekdays 9:00–17:00 ET', 'Executive assistant', 'Outlook, Salesforce, Slack', current_date + 21, 2200, 'Complete', 'Calendar control, travel, client meeting prep', 'Calm executive assistant with financial-services discretion', 'Will not manage personal errands that conflict with compliance', 'Partner plus chief of staff', 'Sofia is covering two roles', 'Calendar conflicts and late client prep', 'High — partner travel starts next month', '$2,200 per month approved', 'Sofia Alvarez', 'This week', 1, 'Full-time', 'America/New_York', 'FINRA-sensitive communication', 'Ready to hand to recruitment.'),
    (o_priya, current_date - 22, 'Priya Shah', 'Lumen Dental Group', 2, 'Remote', 'Clinic hours, split shift coverage', 'Patient coordination VA', 'Dentrix, Weave, Google Workspace', current_date + 14, 1700, 'Complete', 'Recall calls, insurance verification, new-patient intake', 'Warm phone presence, healthcare admin experience', 'Cannot be camera-off for patient calls', 'Front desk is one person short', 'Two new chairs opening', 'Recall list is untouched', 'Before the new chairs open', '$1,700 each', 'Priya Shah', 'After profiles', 2, 'Full-time', 'America/Denver', 'HIPAA awareness', 'Profiles are with the client.');

  insert into public.recruitment_requests (
    opportunity_id, status, target_on, urgent, client_name, company_name, headcount, work_arrangement, schedule,
    preferred_staff, tools, start_date, billing_rate, ideal_candidate, deal_breakers, tasks, notes, sent_at
  ) values (
    o_andre, 'Sourcing', current_date - 1, false, 'Andre Williams', 'Summit Property Management', 2, 'Remote', 'Monday–Friday 9:00–17:00 CT',
    'Property admin VA', 'AppFolio, Gmail, Slack', current_date + 20, 1500,
    'Organized, tenant-communication experience preferred', 'No interest in phone coverage',
    'Owner statements, maintenance dispatch follow-up, vendor scheduling',
    'Target slipped. Needs a same-day check with recruitment.', now() - interval '8 days'
  ) returning id into r_summit;

  insert into public.recruitment_requests (
    opportunity_id, status, target_on, urgent, client_name, company_name, headcount, work_arrangement, schedule,
    preferred_staff, tools, start_date, billing_rate, ideal_candidate, deal_breakers, tasks, notes, sent_at
  ) values (
    o_priya, 'Sent to Client', current_date - 6, false, 'Priya Shah', 'Lumen Dental Group', 2, 'Remote', 'Clinic hours',
    'Patient coordination VA', 'Dentrix, Weave', current_date + 14, 1700,
    'Warm phone presence', 'No patient-call experience',
    'Recall, insurance verification, intake', 'Three profiles sent. No client response yet.', now() - interval '20 days'
  ) returning id into r_lumen;

  insert into public.recruitment_requests (
    opportunity_id, status, target_on, urgent, client_name, company_name, headcount, work_arrangement, schedule,
    preferred_staff, tools, billing_rate, ideal_candidate, tasks, notes, sent_at
  ) values (
    o_hannah, 'Interview Requested', current_date + 2, true, 'Hannah Brooks', 'Cedar Ridge Clinics', 1, 'Remote', 'Eastern Time clinic hours',
    'Clinical admin VA', 'Athenahealth, Teams', 1850, 'Healthcare admin who can own referrals',
    'Referral tracking and prior-auth follow-up', 'Interview is tomorrow.', now() - interval '10 days'
  ) returning id into r_cedar;

  insert into public.candidates (recruitment_request_id, name, email, phone, status, date_added, date_sent_to_client, notes) values
    (r_lumen, 'Aisha Rahman', 'aisha.rahman@candidates.example', '+1 303 555 2210', 'Sent', current_date - 10, current_date - 6, 'Dental front-desk background') returning id into cand_a;
  insert into public.candidates (recruitment_request_id, name, email, phone, status, date_added, date_sent_to_client) values
    (r_lumen, 'Colin Meyer', 'colin.meyer@candidates.example', '+1 720 555 2288', 'Sent', current_date - 9, current_date - 6) returning id into cand_b;
  insert into public.candidates (recruitment_request_id, name, email, status, date_added, date_sent_to_client) values
    (r_lumen, 'Grace Tan', 'grace.tan@candidates.example', 'Sent', current_date - 9, current_date - 6) returning id into cand_c;
  insert into public.candidates (recruitment_request_id, name, email, status, date_added, notes) values
    (r_cedar, 'Nora Feldman', 'nora.feldman@candidates.example', 'Interview', current_date - 5, 'Referral coordinator, Athenahealth') returning id into cand_d;
  insert into public.candidates (recruitment_request_id, name, email, status, date_added) values
    (r_summit, 'Luis Ortega', 'luis.ortega@candidates.example', 'Sourcing', current_date - 3);
  insert into public.candidates (recruitment_request_id, name, email, status, date_added) values
    (r_summit, 'Helen Park', 'helen.park@candidates.example', 'Screening', current_date - 2);

  insert into public.profile_batches (opportunity_id, recruitment_request_id, sent_on, profile_count, client_response, follow_up_on, notes, created_by)
  values (o_priya, r_lumen, current_date - 6, 3, null, current_date + 1, 'No response yet. Priya said she would review after clinic hours.', uid)
  returning id into batch_id;

  insert into public.profile_batch_candidates (profile_batch_id, candidate_id) values
    (batch_id, cand_a), (batch_id, cand_b), (batch_id, cand_c);

  insert into public.interviews (opportunity_id, candidate_id, candidate_name, client_name, interview_at, status, next_action, notes)
  values (
    o_hannah, cand_d, 'Nora Feldman', 'Hannah Brooks',
    ((current_date + 1)::timestamp + time '15:00') at time zone 'America/New_York',
    'Scheduled', 'Send Nora the clinic overview tonight', 'Video call. Hannah is the only interviewer.'
  );

  insert into public.contracts (
    opportunity_id, status, candidate_selected_on, sow_preparation_on, sow_sent_on, negotiation_status,
    expected_start_on, billing_rate, headcount, notes
  ) values (
    o_daniel, 'Sent', current_date - 9, current_date - 6, current_date - 4, 'Awaiting client redlines',
    current_date + 21, 2000, 3, 'Three VAs. Daniel asked legal to glance at the SOW.'
  );

  insert into public.contracts (
    opportunity_id, status, candidate_selected_on, sow_sent_on, sow_signed_on, negotiation_status,
    expected_start_on, actual_start_on, billing_rate, headcount
  ) values (
    o_mei, 'Signed', current_date - 14, current_date - 10, current_date - 7, 'Signed without redlines',
    current_date, current_date, 1900, 2
  );

  insert into public.clients (
    company_id, contact_id, opportunity_id, name, start_date, number_of_vas, billing_rate,
    monthly_recurring_revenue, annual_recurring_revenue
  ) values (
    c_atlas, p_mei, o_mei, 'Atlas Logistics', current_date, 2, 1900, 3800, 45600
  );

  insert into public.notes (opportunity_id, body, author_id) values
    (o_sofia, 'Sofia can approve the VA without a second meeting. Do not make her restate the requirements.', uid),
    (o_amira, 'Last touch was the profile email. Nothing came back. This is the stale one to restart today.', uid);

  insert into public.sendpilot_syncs (
    source, filename, status, started_at, completed_at, total_records, new_records, existing_records,
    updated_records, matched_records, possible_duplicates, unmatched_records, review_records, created_by
  ) values (
    'csv', 'sendpilot-september.csv', 'applied', now() - interval '1 day', now() - interval '1 day',
    17, 15, 0, 0, 15, 1, 1, 2, uid
  ) returning id into sync_id;

  insert into public.sendpilot_records (
    sync_id, row_number, raw, full_name, company_name, email, classification, review_required, review_reason, applied
  ) values
    (sync_id, 16, '{"email":"","company":"","name":"Alex"}'::jsonb, 'Alex', null, null, 'unmatched', true, 'Missing email, LinkedIn, or company plus contact name', false),
    (sync_id, 17, '{"email":"elena.voss.alt@northstarlegal.example","company":"Northstar Legal Group","name":"Elena Voss"}'::jsonb, 'Elena Voss', 'Northstar Legal Group', 'elena.voss.alt@northstarlegal.example', 'possible_duplicate', true, 'Same company and name, different email', false);

  update public.app_settings set sample_loaded_at = now(), updated_by = uid where id = 1;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.load_sample_workspace() from public, anon;
grant execute on function public.load_sample_workspace() to authenticated;

revoke all on function private.classify_lead_row(jsonb) from public;
revoke all on function private.normalize_email(text) from public;
revoke all on function private.normalize_linkedin(text) from public;
revoke all on function private.normalize_name(text) from public;
revoke all on function private.normalize_sendpilot_status(text) from public;
grant execute on function private.classify_lead_row(jsonb) to authenticated;
grant execute on function private.normalize_email(text) to authenticated;
grant execute on function private.normalize_linkedin(text) to authenticated;
grant execute on function private.normalize_name(text) to authenticated;
grant execute on function private.normalize_sendpilot_status(text) to authenticated;
