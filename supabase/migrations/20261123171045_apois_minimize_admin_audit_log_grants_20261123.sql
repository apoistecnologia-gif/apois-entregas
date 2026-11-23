-- Applied in production; synchronized from actual Supabase migration history.
-- Q19: least-privilege on Entregas administrative audit trails.
-- Retains SELECT for authenticated users under the existing
-- RLS policy public.current_user_is_admin(), which requires AAL2.
-- Service role retains its explicit permissions for secure server logging.
revoke select,insert,update,delete,truncate on table public.admin_audit_logs from anon;
revoke insert,update,delete,truncate on table public.admin_audit_logs from authenticated;
alter table public.admin_audit_logs enable row level security;
