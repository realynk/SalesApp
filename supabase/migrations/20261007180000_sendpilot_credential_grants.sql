-- Phase 3: service-role RPCs to load/upsert encrypted SendPilot credentials.
-- Ciphertext stays in private.sendpilot_integration_credentials.
-- anon/authenticated cannot execute these functions.
-- Does not copy env secrets into the database.

create or replace function public.sendpilot_load_integration_credentials(p_integration_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'api_key_ciphertext', c.api_key_ciphertext,
    'webhook_secret_ciphertext', c.webhook_secret_ciphertext,
    'key_version', c.key_version
  )
  into result
  from private.sendpilot_integration_credentials c
  where c.integration_id = p_integration_id;
  return result;
end;
$$;

create or replace function public.sendpilot_upsert_integration_credentials(
  p_integration_id uuid,
  p_api_key_ciphertext text,
  p_webhook_secret_ciphertext text,
  p_key_version integer default 1
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.sendpilot_integration_credentials (
    integration_id,
    api_key_ciphertext,
    webhook_secret_ciphertext,
    key_version,
    rotated_at,
    updated_at
  )
  values (
    p_integration_id,
    p_api_key_ciphertext,
    p_webhook_secret_ciphertext,
    coalesce(p_key_version, 1),
    now(),
    now()
  )
  on conflict (integration_id) do update
    set
      api_key_ciphertext = excluded.api_key_ciphertext,
      webhook_secret_ciphertext = excluded.webhook_secret_ciphertext,
      key_version = excluded.key_version,
      rotated_at = now(),
      updated_at = now();
end;
$$;

revoke all on function public.sendpilot_load_integration_credentials(uuid) from public, anon, authenticated;
revoke all on function public.sendpilot_upsert_integration_credentials(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.sendpilot_load_integration_credentials(uuid) to service_role;
grant execute on function public.sendpilot_upsert_integration_credentials(uuid, text, text, integer) to service_role;
