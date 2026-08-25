-- Fixes for Supabase security-advisor findings (bomb-proofing pass 2).
--
-- Postgres grants EXECUTE to PUBLIC on new functions by default, which made
-- our SECURITY DEFINER helpers callable via /rest/v1/rpc by anon and
-- authenticated. Lock function execution down to exactly who needs it:
--   * my_role / mfa_satisfied / unit_status_counts — called from RLS policies
--     and the app, so `authenticated` keeps EXECUTE. anon gets nothing.
--   * trigger functions — fired internally by Postgres; NO caller ever needs
--     EXECUTE. Revoked from everyone.
--   * rls_auto_enable — Supabase's event trigger that auto-enables RLS on new
--     public tables (kept: it backstops forgotten-RLS mistakes). Internal only.

alter function public.touch_updated_at() set search_path = public;

revoke all on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

revoke all on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;

revoke all on function public.unit_status_counts() from public, anon;
grant execute on function public.unit_status_counts() to authenticated;

revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.units_attach_to_sales_order() from public, anon, authenticated;
revoke all on function public.units_log_status_change() from public, anon, authenticated;
revoke all on function public.units_assign_dispatch() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- Future functions: no default PUBLIC execute. Each new function must grant
-- its callers explicitly.
alter default privileges in schema public revoke execute on functions from public;
