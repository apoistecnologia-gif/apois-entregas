-- The rate-limit ledger is an internal implementation detail. It already has all
-- direct grants revoked; this explicit restrictive policy keeps the deny-by-default
-- intent visible to database tooling as well.
drop policy if exists "API rate limits deny direct client access" on public.api_rate_limits;
create policy "API rate limits deny direct client access"
on public.api_rate_limits
as restrictive
for all
to authenticated
using (false)
with check (false);
