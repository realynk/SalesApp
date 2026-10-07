-- Phase 5.1: separate safe credential presence flags for staged onboarding.
-- Additive. Does not rewrite Phase 1–5 migrations.
-- Does not store plaintext, ciphertext, or encryption keys.
-- Does not change Realynk Main credentials, webhook URL, or tracking mode.

alter table public.sendpilot_integrations
  add column if not exists api_key_configured boolean not null default false,
  add column if not exists webhook_secret_configured boolean not null default false;

comment on column public.sendpilot_integrations.api_key_configured is
  'True after an encrypted API key is stored for this integration. Never holds plaintext, ciphertext, or env secrets.';
comment on column public.sendpilot_integrations.webhook_secret_configured is
  'True after an encrypted webhook signing secret is stored for this integration. Never holds plaintext, ciphertext, or env secrets.';

-- Non-legacy rows that already reported both credentials present keep both flags true.
-- Realynk Main (legacy_env) is left false so the UI continues to show legacy environment, not stored ciphertext.
update public.sendpilot_integrations
set
  api_key_configured = true,
  webhook_secret_configured = true
where credentials_present = true
  and legacy_env = false
  and api_key_configured = false
  and webhook_secret_configured = false;
