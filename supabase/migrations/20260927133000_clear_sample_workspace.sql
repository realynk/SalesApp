-- Remove the bundled demo workspace without touching real SendPilot leads,
-- except contacts that used the known demo emails (including the sample CSV).

create or replace function public.load_sample_workspace()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'The demo workspace is no longer available. Import a SendPilot file instead.';
end;
$$;

create or replace function public.clear_sample_workspace()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  sample_emails text[] := array[
    'elena.voss@northstarlegal.example',
    'elena.voss.alt@northstarlegal.example',
    'marcus.hale@harborandco.example',
    'priya.shah@lumendental.example',
    'daniel.cho@brightpath.example',
    'claire.dubois@oakandpine.example',
    'andre.williams@summitpm.example',
    'hannah.brooks@cedarridge.example',
    'sofia.alvarez@marlowewealth.example',
    'owen.blake@fieldnote.example',
    'mei.chen@atlaslogistics.example',
    'patrick.nguyen@redbird.example',
    'amira.hassan@kinfolk.example',
    'jonah.ellis@bluebirdpeds.example',
    'leah.okonkwo@westline.example',
    'samir.haddad@plover.studio',
    'jordan.hale@northwind.example',
    'riley.chen@paperplane.example'
  ];
  sample_candidate_emails text[] := array[
    'aisha.rahman@candidates.example',
    'colin.meyer@candidates.example',
    'grace.tan@candidates.example',
    'nora.feldman@candidates.example',
    'luis.ortega@candidates.example',
    'helen.park@candidates.example'
  ];
  sample_company_names text[] := array[
    'Northstar Legal Group',
    'Harbor & Co. Accounting',
    'Lumen Dental Group',
    'BrightPath Mortgage',
    'Oak & Pine Interiors',
    'Summit Property Management',
    'Cedar Ridge Clinics',
    'Marlowe Wealth',
    'Fieldnote Marketing',
    'Atlas Logistics',
    'Redbird Insurance',
    'Kinfolk Hospitality',
    'Bluebird Pediatrics',
    'Westline Architects',
    'Plover Studio',
    'Northwind Clinics',
    'Paperplane Books'
  ];
  contact_ids uuid[];
  opportunity_ids uuid[];
  lead_ids uuid[];
  company_ids uuid[];
  removed_contacts integer := 0;
  removed_companies integer := 0;
  removed_opportunities integer := 0;
begin
  if uid is null or not private.is_internal() then
    raise exception 'Not authorized';
  end if;

  select coalesce(array_agg(c.id), '{}'::uuid[])
  into contact_ids
  from public.contacts c
  where c.email_key = any(sample_emails) or lower(c.email) = any(sample_emails);

  select coalesce(array_agg(l.id), '{}'::uuid[])
  into lead_ids
  from public.leads l
  where l.contact_id = any(contact_ids);

  select coalesce(array_agg(o.id), '{}'::uuid[])
  into opportunity_ids
  from public.opportunities o
  where o.contact_id = any(contact_ids) or o.lead_id = any(lead_ids);

  select coalesce(array_agg(co.id), '{}'::uuid[])
  into company_ids
  from public.companies co
  where co.name = any(sample_company_names);

  perform set_config('realynk.allow_history_delete', 'on', true);

  delete from public.sendpilot_records r
  where lower(coalesce(r.email, '')) = any(sample_emails)
     or (
       r.full_name = 'Alex'
       and coalesce(r.email, '') = ''
       and exists (
         select 1
         from public.sendpilot_syncs s
         where s.id = r.sync_id
           and s.filename in ('sendpilot-september.csv', 'sendpilot-export.csv')
       )
     );

  delete from public.sendpilot_syncs s
  where s.filename in ('sendpilot-september.csv', 'sendpilot-export.csv')
    and not exists (select 1 from public.sendpilot_records r where r.sync_id = s.id);

  delete from public.candidates
  where lower(coalesce(email, '')) = any(sample_candidate_emails);

  delete from public.opportunities
  where id = any(opportunity_ids);
  get diagnostics removed_opportunities = row_count;

  delete from public.leads
  where id = any(lead_ids);

  delete from public.contacts
  where id = any(contact_ids);
  get diagnostics removed_contacts = row_count;

  delete from public.companies co
  where co.id = any(company_ids)
    and not exists (select 1 from public.contacts c where c.company_id = co.id)
    and not exists (select 1 from public.leads l where l.company_id = co.id)
    and not exists (select 1 from public.clients cl where cl.company_id = co.id);
  get diagnostics removed_companies = row_count;

  update public.app_settings
  set sample_loaded_at = null, updated_at = now(), updated_by = uid
  where id = 1;

  perform set_config('realynk.allow_history_delete', '', true);

  return jsonb_build_object(
    'ok', true,
    'contacts', removed_contacts,
    'companies', removed_companies,
    'opportunities', removed_opportunities
  );
end;
$$;

revoke all on function public.load_sample_workspace() from public, anon, authenticated;
revoke all on function public.clear_sample_workspace() from public, anon;
grant execute on function public.clear_sample_workspace() to authenticated;
