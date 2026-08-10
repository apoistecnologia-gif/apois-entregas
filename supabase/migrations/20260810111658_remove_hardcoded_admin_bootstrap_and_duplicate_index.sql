-- The initial admin already exists in user_roles. Do not keep an email-triggered
-- privilege escalation path in production; future admin grants must be explicit and audited.
drop trigger if exists bootstrap_confirmed_apois_admin_trigger on auth.users;
drop function if exists public.bootstrap_confirmed_apois_admin();

-- Keep the tracked partial unique index created by
-- 20260810100204_make_customer_default_address_atomic.sql and remove the legacy duplicate.
drop index if exists public.ux_customer_addresses_one_default_per_user;
