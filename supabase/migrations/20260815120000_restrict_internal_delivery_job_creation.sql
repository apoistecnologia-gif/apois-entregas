-- ensure_delivery_job mutates order state and stores delivery secrets. It is an
-- internal primitive called by merchant_request_courier and trusted server-side
-- flows, never a client-facing RPC.
revoke all on function public.ensure_delivery_job(uuid) from public, anon, authenticated;
grant execute on function public.ensure_delivery_job(uuid) to service_role;
