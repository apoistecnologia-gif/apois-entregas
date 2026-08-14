alter table public.payouts
  add column if not exists pix_key_type_snapshot text;

alter table public.payouts
  drop constraint if exists payouts_pix_key_type_snapshot_check;

alter table public.payouts
  add constraint payouts_pix_key_type_snapshot_check
  check (
    pix_key_type_snapshot is null
    or pix_key_type_snapshot in ('CPF','CNPJ','EMAIL','PHONE','EVP')
  );

create or replace function public.request_payout(
  _wallet_id uuid,
  _amount numeric,
  _idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallets;
  v_account public.payout_accounts;
  v_existing public.payouts;
  v_payout_id uuid;
  v_pix_key_type text;
  v_pix_digits text;
  v_document_digits text;
begin
  if not public.current_user_owns_wallet(_wallet_id) then
    raise exception 'wallet access required';
  end if;
  if _amount <= 0 then
    raise exception 'invalid payout amount';
  end if;
  if nullif(btrim(_idempotency_key),'') is null then
    raise exception 'idempotency key is required';
  end if;

  select * into v_wallet
  from public.wallets w
  where w.id = _wallet_id
  for update;
  if not found then
    raise exception 'wallet not found';
  end if;
  if v_wallet.is_blocked then
    raise exception 'wallet is blocked';
  end if;

  select * into v_existing
  from public.payouts p
  where p.idempotency_key = _idempotency_key;
  if found then
    if v_existing.wallet_id is distinct from _wallet_id
       or v_existing.amount is distinct from _amount then
      raise exception 'idempotency key already used for another payout';
    end if;
    return v_existing.id;
  end if;

  select * into v_account
  from public.payout_accounts pa
  where pa.wallet_id = _wallet_id
    and pa.is_active = true;
  if not found then
    raise exception 'active payout account required';
  end if;

  v_pix_key_type := upper(nullif(btrim(v_account.pix_key_type),''));
  if v_pix_key_type is null then
    v_pix_digits := regexp_replace(v_account.pix_key, '\D', '', 'g');
    v_document_digits := regexp_replace(coalesce(v_account.document,''), '\D', '', 'g');

    if position('@' in v_account.pix_key) > 0 then
      v_pix_key_type := 'EMAIL';
    elsif length(v_pix_digits) = 14 then
      v_pix_key_type := 'CNPJ';
    elsif length(v_pix_digits) = 11 and v_pix_digits = v_document_digits then
      v_pix_key_type := 'CPF';
    elsif length(v_pix_digits) in (10,11,12,13) then
      v_pix_key_type := 'PHONE';
    elsif v_account.pix_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_pix_key_type := 'EVP';
    end if;
  end if;

  if v_pix_key_type is null
     or v_pix_key_type not in ('CPF','CNPJ','EMAIL','PHONE','EVP') then
    raise exception 'valid pix key type required';
  end if;

  if v_wallet.available_balance < _amount then
    raise exception 'insufficient available balance';
  end if;

  insert into public.payouts(
    wallet_id,
    payout_account_id,
    amount,
    status,
    pix_key_snapshot,
    pix_key_type_snapshot,
    requested_by,
    idempotency_key
  )
  values(
    _wallet_id,
    v_account.id,
    _amount,
    'pending',
    v_account.pix_key,
    v_pix_key_type,
    (select auth.uid()),
    _idempotency_key
  )
  returning id into v_payout_id;

  perform public.post_wallet_transaction(
    _wallet_id,
    'payout_hold',
    0,
    -_amount,
    _amount,
    'payout-hold:' || v_payout_id::text,
    'payout',
    v_payout_id::text,
    'Reserva para saque',
    'pending'
  );

  return v_payout_id;
end;
$$;

revoke all on function public.request_payout(uuid,numeric,text) from public, anon;
grant execute on function public.request_payout(uuid,numeric,text) to authenticated, service_role;
