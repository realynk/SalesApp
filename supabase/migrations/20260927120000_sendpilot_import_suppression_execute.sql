-- preview_sendpilot_import / apply_sendpilot_import run as the signed-in user
-- (SECURITY INVOKER) and call private.classify_lead_row, which calls
-- private.active_suppression_id. The archive migration revoked PUBLIC execute
-- on that helper and never granted it to authenticated, which returns Postgres
-- 42501 (insufficient_privilege) on Review Import.

revoke all on function private.active_suppression_id(text, text, text) from public, anon;
grant execute on function private.active_suppression_id(text, text, text) to authenticated;

-- classify_lead_row reads suppressions as the invoker; table privilege is
-- separate from RLS. Import only needs SELECT. Writes stay on the
-- SECURITY DEFINER permanent-delete helper.
grant select on table public.sendpilot_suppressions to authenticated;
