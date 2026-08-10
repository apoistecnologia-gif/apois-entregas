create unique index if not exists payouts_provider_reference_unique
  on public.payouts(provider, provider_payout_id)
  where provider is not null and provider_payout_id is not null;

create or replace function public.admin_settle_payout(
  _payout_id uuid,
  _new_status text,
  _provider text default null,
  _provider_payout_id text default null,
  _failure_reason text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_payout public.payouts;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.current_user_is_admin() then raise exception 'admin access required'; end if;
  if _new_status not in ('processing','paid','failed','cancelled') then raise exception 'invalid payout status'; end if;

  select * into v_payout from public.payouts p where p.id=_payout_id for update;
  if not found then raise exception 'payout not found'; end if;
  if v_payout.status=_new_status then return; end if;
  if v_payout.status in ('paid','failed','cancelled') then raise exception 'payout already finalized'; end if;
  if v_payout.status='processing' and _new_status not in ('paid','failed','cancelled') then raise exception 'invalid payout transition'; end if;

  if _new_status='paid' then
    if nullif(btrim(_provider),'') is null then raise exception 'payout provider is required'; end if;
    if nullif(btrim(_provider_payout_id),'') is null then raise exception 'provider payout reference is required'; end if;
  end if;
  if _new_status='failed' and nullif(btrim(_failure_reason),'') is null then
    raise exception 'failure reason is required';
  end if;

  v_before := to_jsonb(v_payout);

  if _new_status='paid' then
    perform public.post_wallet_transaction(
      v_payout.wallet_id,'payout',-v_payout.amount,0,-v_payout.amount,
      'payout-paid:'||v_payout.id::text,'payout',v_payout.id::text,'Saque pago','completed'
    );
  elsif _new_status in ('failed','cancelled') then
    perform public.post_wallet_transaction(
      v_payout.wallet_id,'payout_release',0,v_payout.amount,-v_payout.amount,
      'payout-release:'||v_payout.id::text,'payout',v_payout.id::text,'Reserva de saque liberada','completed'
    );
  end if;

  update public.payouts
  set status=_new_status,
      provider=case when _new_status='paid' then btrim(_provider) else coalesce(nullif(btrim(_provider),''),provider) end,
      provider_payout_id=case when _new_status='paid' then btrim(_provider_payout_id) else coalesce(nullif(btrim(_provider_payout_id),''),provider_payout_id) end,
      failure_reason=case when _new_status='failed' then btrim(_failure_reason) else failure_reason end,
      processed_at=case when _new_status in ('paid','failed','cancelled') then now() else processed_at end
  where id=_payout_id
  returning to_jsonb(public.payouts) into v_after;

  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
  values((select auth.uid()),'settle_payout','payout',_payout_id::text,v_before,v_after);
end;
$function$;
