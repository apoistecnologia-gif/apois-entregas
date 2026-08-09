-- Remove only byte-for-byte equivalent permissive RLS policies.
-- Each retained policy has the same role, command and predicates as the removed duplicate.
drop policy if exists "Admins can read audit logs" on public.admin_audit_logs;
drop policy if exists "Admins can view delivery events" on public.delivery_events;
drop policy if exists "Admins can view delivery jobs" on public.delivery_jobs;
drop policy if exists "Admins can view delivery offers" on public.delivery_offers;
drop policy if exists "Merchant managers can update own merchant" on public.merchants;
drop policy if exists "Admins can view profiles" on public.profiles;
