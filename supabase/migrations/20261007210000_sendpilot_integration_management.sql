-- Phase 4: SendPilot Integrations management.
-- Additive only. Does not rewrite Phase 1 or Phase 3 migrations.
-- Does not hard-delete integrations, credentials, campaigns, identities, or webhook history.
-- Does not grant credential RPCs to authenticated clients.
-- Webhook apply continues to use the service role, which bypasses RLS.

alter table public.sendpilot_integrations
  add column if not exists last_campaign_sync_at timestamptz,
  add column if not exists credentials_present boolean not null default false;

comment on column public.sendpilot_integrations.last_campaign_sync_at is
  'Set when campaign discovery succeeds for this integration. Unused while campaign-list sync is unavailable.';
comment on column public.sendpilot_integrations.credentials_present is
  'True after encrypted credentials are stored. Never holds plaintext, ciphertext, or env secrets.';

-- Replace Phase 1 is_internal() mutation policies with is_sendpilot_admin()
-- (profiles.role = sales_lead). SELECT stays is_internal() so authenticated
-- workspace users can still see safe integration metadata.

-- sendpilot_integrations: drop internal insert/update; admin-only mutations.
drop policy if exists sendpilot_integrations_insert on public.sendpilot_integrations;
drop policy if exists sendpilot_integrations_update on public.sendpilot_integrations;
create policy sendpilot_integrations_insert on public.sendpilot_integrations
  for insert to authenticated
  with check ((select private.is_sendpilot_admin()));
create policy sendpilot_integrations_update on public.sendpilot_integrations
  for update to authenticated
  using ((select private.is_sendpilot_admin()))
  with check ((select private.is_sendpilot_admin()));

-- sendpilot_campaigns: same tightening. Service-role webhook/sync writes still work.
drop policy if exists sendpilot_campaigns_insert on public.sendpilot_campaigns;
drop policy if exists sendpilot_campaigns_update on public.sendpilot_campaigns;
create policy sendpilot_campaigns_insert on public.sendpilot_campaigns
  for insert to authenticated
  with check ((select private.is_sendpilot_admin()));
create policy sendpilot_campaigns_update on public.sendpilot_campaigns
  for update to authenticated
  using ((select private.is_sendpilot_admin()))
  with check ((select private.is_sendpilot_admin()));

-- sendpilot_campaign_tracking: admin-only campaign selection changes.
drop policy if exists sendpilot_campaign_tracking_insert on public.sendpilot_campaign_tracking;
drop policy if exists sendpilot_campaign_tracking_update on public.sendpilot_campaign_tracking;
create policy sendpilot_campaign_tracking_insert on public.sendpilot_campaign_tracking
  for insert to authenticated
  with check ((select private.is_sendpilot_admin()));
create policy sendpilot_campaign_tracking_update on public.sendpilot_campaign_tracking
  for update to authenticated
  using ((select private.is_sendpilot_admin()))
  with check ((select private.is_sendpilot_admin()));

-- sendpilot_lead_identities: stop non-admin authenticated writes.
-- Webhook dual-write uses service role and is unchanged.
drop policy if exists sendpilot_lead_identities_insert on public.sendpilot_lead_identities;
drop policy if exists sendpilot_lead_identities_update on public.sendpilot_lead_identities;
create policy sendpilot_lead_identities_insert on public.sendpilot_lead_identities
  for insert to authenticated
  with check ((select private.is_sendpilot_admin()));
create policy sendpilot_lead_identities_update on public.sendpilot_lead_identities
  for update to authenticated
  using ((select private.is_sendpilot_admin()))
  with check ((select private.is_sendpilot_admin()));

-- sendpilot_integration_audit: admin insert only. Drop authenticated update so
-- audit rows cannot be rewritten from the browser. Service role is unaffected.
drop policy if exists sendpilot_integration_audit_insert on public.sendpilot_integration_audit;
drop policy if exists sendpilot_integration_audit_update on public.sendpilot_integration_audit;
create policy sendpilot_integration_audit_insert on public.sendpilot_integration_audit
  for insert to authenticated
  with check ((select private.is_sendpilot_admin()));

-- No DELETE policies. Permanent delete remains unavailable.

-- Credential ciphertext stays private + service-role RPCs from Phase 3.
revoke all on table private.sendpilot_integration_credentials from public, anon, authenticated;
