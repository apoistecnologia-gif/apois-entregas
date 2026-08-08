-- APOIS ENTREGAS — payment persistence, balanced ledgers and idempotent payouts.

ALTER TABLE public.orders
  ADD COLUMN service_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (service_fee >= 0),
  ADD COLUMN platform_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  ADD COLUMN merchant_net numeric(12,2) CHECK (merchant_net IS NULL OR merchant_net >= 0),
  ADD COLUMN courier_earnings numeric(10,2) CHECK (courier_earnings IS NULL OR courier_earnings >= 0),
  ADD COLUMN coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL;

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (btrim(provider) <> ''),
  provider_charge_id text,
  method text NOT NULL CHECK (method IN ('pix','credit','debit','cash','wallet')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','paid','failed','cancelled','refunded')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency ~ '^[A-Z]{3}$'),
  qr_code_text text,
  qr_code_image_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  idempotency_key text NOT NULL UNIQUE CHECK (btrim(idempotency_key) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payments_provider_charge_unique_idx
  ON public.payments(provider, provider_charge_id) WHERE provider_charge_id IS NOT NULL;
CREATE INDEX payments_order_status_idx ON public.payments(order_id, status);

CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (btrim(provider) <> ''),
  provider_event_id text NOT NULL CHECK (btrim(provider_event_id) <> ''),
  event_type text,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','processed','ignored','failed')),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  provider_transaction_id text,
  transaction_type text NOT NULL
    CHECK (transaction_type IN ('charge','fee','refund','chargeback','adjustment')),
  amount numeric(12,2) NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','completed','failed','cancelled')),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_transactions_provider_unique_idx
  ON public.payment_transactions(payment_id, provider_transaction_id, transaction_type)
  WHERE provider_transaction_id IS NOT NULL;

CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  provider_refund_id text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Wallet balance = settled funds still owned by the wallet.
-- available_balance + reserved_balance can never exceed balance.
CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('customer','courier','merchant','platform')),
  customer_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  courier_id uuid REFERENCES public.couriers(id) ON DELETE CASCADE,
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE CASCADE,
  balance numeric(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  available_balance numeric(14,2) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  reserved_balance numeric(14,2) NOT NULL DEFAULT 0 CHECK (reserved_balance >= 0),
  is_blocked boolean NOT NULL DEFAULT false,
  blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (available_balance + reserved_balance <= balance),
  CHECK (
    (owner_type='customer' AND customer_user_id IS NOT NULL AND courier_id IS NULL AND merchant_id IS NULL) OR
    (owner_type='courier' AND customer_user_id IS NULL AND courier_id IS NOT NULL AND merchant_id IS NULL) OR
    (owner_type='merchant' AND customer_user_id IS NULL AND courier_id IS NULL AND merchant_id IS NOT NULL) OR
    (owner_type='platform' AND customer_user_id IS NULL AND courier_id IS NULL AND merchant_id IS NULL)
  )
);
CREATE UNIQUE INDEX wallets_customer_unique_idx ON public.wallets(customer_user_id) WHERE customer_user_id IS NOT NULL;
CREATE UNIQUE INDEX wallets_courier_unique_idx ON public.wallets(courier_id) WHERE courier_id IS NOT NULL;
CREATE UNIQUE INDEX wallets_merchant_unique_idx ON public.wallets(merchant_id) WHERE merchant_id IS NOT NULL;
CREATE UNIQUE INDEX wallets_platform_unique_idx ON public.wallets(owner_type) WHERE owner_type='platform';

CREATE TABLE public.payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL UNIQUE REFERENCES public.wallets(id) ON DELETE CASCADE,
  account_type text NOT NULL DEFAULT 'pix' CHECK (account_type='pix'),
  pix_key text NOT NULL CHECK (btrim(pix_key) <> ''),
  holder_name text,
  document text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  transaction_type text NOT NULL CHECK (
    transaction_type IN ('credit','debit','order_earning','platform_fee','refund','payout_hold','payout','payout_release','adjustment')
  ),
  balance_delta numeric(14,2) NOT NULL DEFAULT 0,
  available_delta numeric(14,2) NOT NULL DEFAULT 0,
  reserved_delta numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending','completed','failed','cancelled')),
  reference_type text,
  reference_id text,
  description text,
  idempotency_key text NOT NULL UNIQUE CHECK (btrim(idempotency_key) <> ''),
  balance_after numeric(14,2) NOT NULL,
  available_after numeric(14,2) NOT NULL,
  reserved_after numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (balance_delta <> 0 OR available_delta <> 0 OR reserved_delta <> 0)
);
CREATE INDEX wallet_transactions_wallet_created_idx
  ON public.wallet_transactions(wallet_id, created_at DESC);

CREATE TABLE public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  payout_account_id uuid NOT NULL REFERENCES public.payout_accounts(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','paid','failed','cancelled')),
  provider text,
  provider_payout_id text,
  pix_key_snapshot text NOT NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  failure_reason text,
  idempotency_key text NOT NULL UNIQUE CHECK (btrim(idempotency_key) <> ''),
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payouts_wallet_status_idx ON public.payouts(wallet_id, status, requested_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payments','refunds','wallets','payout_accounts','payouts']
  LOOP
    EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.current_user_owns_wallet(_wallet_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.wallets w
    LEFT JOIN public.couriers c ON c.id = w.courier_id
    WHERE w.id = _wallet_id
      AND (
        w.customer_user_id = (SELECT auth.uid()) OR
        c.user_id = (SELECT auth.uid()) OR
        (w.merchant_id IS NOT NULL AND public.current_user_is_merchant_manager(w.merchant_id)) OR
        public.current_user_is_admin()
      )
  );
$$;

-- Service-only balanced ledger mutation. The wallet row lock serializes concurrent
-- postings, and idempotency is verified against the full mutation signature.
CREATE OR REPLACE FUNCTION public.post_wallet_transaction(
  _wallet_id uuid,
  _transaction_type text,
  _balance_delta numeric,
  _available_delta numeric,
  _reserved_delta numeric,
  _idempotency_key text,
  _reference_type text DEFAULT NULL,
  _reference_id text DEFAULT NULL,
  _description text DEFAULT NULL,
  _status text DEFAULT 'completed'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_wallet public.wallets;
  v_existing public.wallet_transactions;
  v_new_balance numeric;
  v_new_available numeric;
  v_new_reserved numeric;
  v_tx_id uuid;
BEGIN
  IF NULLIF(btrim(_idempotency_key),'') IS NULL THEN RAISE EXCEPTION 'idempotency key is required'; END IF;
  IF _balance_delta=0 AND _available_delta=0 AND _reserved_delta=0 THEN RAISE EXCEPTION 'ledger mutation cannot be zero'; END IF;
  IF _status NOT IN ('pending','completed','failed','cancelled') THEN RAISE EXCEPTION 'invalid transaction status'; END IF;

  SELECT * INTO v_wallet FROM public.wallets w WHERE w.id=_wallet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet not found'; END IF;

  SELECT * INTO v_existing FROM public.wallet_transactions wt WHERE wt.idempotency_key=_idempotency_key;
  IF FOUND THEN
    IF v_existing.wallet_id IS DISTINCT FROM _wallet_id
      OR v_existing.transaction_type IS DISTINCT FROM _transaction_type
      OR v_existing.balance_delta IS DISTINCT FROM _balance_delta
      OR v_existing.available_delta IS DISTINCT FROM _available_delta
      OR v_existing.reserved_delta IS DISTINCT FROM _reserved_delta THEN
      RAISE EXCEPTION 'idempotency key already used for another ledger mutation';
    END IF;
    RETURN v_existing.id;
  END IF;

  v_new_balance := v_wallet.balance + _balance_delta;
  v_new_available := v_wallet.available_balance + _available_delta;
  v_new_reserved := v_wallet.reserved_balance + _reserved_delta;

  IF v_new_balance < 0 OR v_new_available < 0 OR v_new_reserved < 0
     OR v_new_available + v_new_reserved > v_new_balance THEN
    RAISE EXCEPTION 'wallet mutation violates balance constraints';
  END IF;

  INSERT INTO public.wallet_transactions(
    wallet_id,transaction_type,balance_delta,available_delta,reserved_delta,status,
    reference_type,reference_id,description,idempotency_key,
    balance_after,available_after,reserved_after
  ) VALUES (
    _wallet_id,_transaction_type,_balance_delta,_available_delta,_reserved_delta,_status,
    _reference_type,_reference_id,_description,_idempotency_key,
    v_new_balance,v_new_available,v_new_reserved
  ) RETURNING id INTO v_tx_id;

  UPDATE public.wallets
  SET balance=v_new_balance,available_balance=v_new_available,reserved_balance=v_new_reserved
  WHERE id=_wallet_id;

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_payout(
  _wallet_id uuid,
  _amount numeric,
  _idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_wallet public.wallets;
  v_account public.payout_accounts;
  v_existing public.payouts;
  v_payout_id uuid;
BEGIN
  IF NOT public.current_user_owns_wallet(_wallet_id) THEN RAISE EXCEPTION 'wallet access required'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid payout amount'; END IF;
  IF NULLIF(btrim(_idempotency_key),'') IS NULL THEN RAISE EXCEPTION 'idempotency key is required'; END IF;

  SELECT * INTO v_wallet FROM public.wallets w WHERE w.id=_wallet_id FOR UPDATE;
  IF v_wallet.is_blocked THEN RAISE EXCEPTION 'wallet is blocked'; END IF;

  SELECT * INTO v_existing FROM public.payouts p WHERE p.idempotency_key=_idempotency_key;
  IF FOUND THEN
    IF v_existing.wallet_id IS DISTINCT FROM _wallet_id OR v_existing.amount IS DISTINCT FROM _amount THEN
      RAISE EXCEPTION 'idempotency key already used for another payout';
    END IF;
    RETURN v_existing.id;
  END IF;

  SELECT * INTO v_account FROM public.payout_accounts pa
  WHERE pa.wallet_id=_wallet_id AND pa.is_active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'active payout account required'; END IF;
  IF v_wallet.available_balance < _amount THEN RAISE EXCEPTION 'insufficient available balance'; END IF;

  INSERT INTO public.payouts(
    wallet_id,payout_account_id,amount,status,pix_key_snapshot,requested_by,idempotency_key
  ) VALUES (
    _wallet_id,v_account.id,_amount,'pending',v_account.pix_key,(SELECT auth.uid()),_idempotency_key
  ) RETURNING id INTO v_payout_id;

  PERFORM public.post_wallet_transaction(
    _wallet_id,'payout_hold',0,-_amount,_amount,
    'payout-hold:'||v_payout_id::text,'payout',v_payout_id::text,'Reserva para saque','pending'
  );

  RETURN v_payout_id;
END;
$$;

-- Provider/webhook-only settlement. Safe to retry.
CREATE OR REPLACE FUNCTION public.settle_payout(
  _payout_id uuid,
  _new_status text,
  _provider text DEFAULT NULL,
  _provider_payout_id text DEFAULT NULL,
  _failure_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_payout public.payouts;
BEGIN
  IF _new_status NOT IN ('processing','paid','failed','cancelled') THEN RAISE EXCEPTION 'invalid payout status'; END IF;
  SELECT * INTO v_payout FROM public.payouts p WHERE p.id=_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payout not found'; END IF;

  IF v_payout.status = _new_status THEN RETURN; END IF;
  IF v_payout.status IN ('paid','failed','cancelled') THEN RAISE EXCEPTION 'payout already finalized'; END IF;
  IF v_payout.status='pending' AND _new_status NOT IN ('processing','paid','failed','cancelled') THEN RAISE EXCEPTION 'invalid payout transition'; END IF;
  IF v_payout.status='processing' AND _new_status NOT IN ('paid','failed','cancelled') THEN RAISE EXCEPTION 'invalid payout transition'; END IF;

  IF _new_status='paid' THEN
    PERFORM public.post_wallet_transaction(
      v_payout.wallet_id,'payout',-v_payout.amount,0,-v_payout.amount,
      'payout-paid:'||v_payout.id::text,'payout',v_payout.id::text,'Saque pago','completed'
    );
  ELSIF _new_status IN ('failed','cancelled') THEN
    PERFORM public.post_wallet_transaction(
      v_payout.wallet_id,'payout_release',0,v_payout.amount,-v_payout.amount,
      'payout-release:'||v_payout.id::text,'payout',v_payout.id::text,'Reserva de saque liberada','completed'
    );
  END IF;

  UPDATE public.payouts
  SET status=_new_status,
      provider=COALESCE(_provider,provider),
      provider_payout_id=COALESCE(_provider_payout_id,provider_payout_id),
      failure_reason=CASE WHEN _new_status='failed' THEN _failure_reason ELSE failure_reason END,
      processed_at=CASE WHEN _new_status IN ('paid','failed','cancelled') THEN now() ELSE processed_at END
  WHERE id=_payout_id;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_owns_wallet(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_wallet_transaction(uuid,text,numeric,numeric,numeric,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.request_payout(uuid,numeric,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.settle_payout(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_owns_wallet(uuid),public.request_payout(uuid,numeric,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.post_wallet_transaction(uuid,text,numeric,numeric,numeric,text,text,text,text,text),public.settle_payout(uuid,text,text,text,text) TO service_role;

-- RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers view own payments" ON public.payments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=payments.order_id AND o.customer_user_id=(SELECT auth.uid())));
CREATE POLICY "Merchants view order payments" ON public.payments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=payments.order_id AND public.current_user_is_merchant_member(o.merchant_id)));
CREATE POLICY "Admins view payments" ON public.payments FOR SELECT TO authenticated USING(public.current_user_is_admin());
CREATE POLICY "Admins view payment events" ON public.payment_events FOR SELECT TO authenticated USING(public.current_user_is_admin());
CREATE POLICY "Admins view payment transactions" ON public.payment_transactions FOR SELECT TO authenticated USING(public.current_user_is_admin());
CREATE POLICY "Customers view own refunds" ON public.refunds FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=refunds.order_id AND o.customer_user_id=(SELECT auth.uid())));
CREATE POLICY "Admins view refunds" ON public.refunds FOR SELECT TO authenticated USING(public.current_user_is_admin());

CREATE POLICY "Owners view wallets" ON public.wallets FOR SELECT TO authenticated
USING (public.current_user_owns_wallet(id));
CREATE POLICY "Owners view payout accounts" ON public.payout_accounts FOR SELECT TO authenticated
USING (public.current_user_owns_wallet(wallet_id));
CREATE POLICY "Owners create payout accounts" ON public.payout_accounts FOR INSERT TO authenticated
WITH CHECK (public.current_user_owns_wallet(wallet_id));
CREATE POLICY "Owners update payout accounts" ON public.payout_accounts FOR UPDATE TO authenticated
USING (public.current_user_owns_wallet(wallet_id)) WITH CHECK (public.current_user_owns_wallet(wallet_id));
CREATE POLICY "Owners view wallet transactions" ON public.wallet_transactions FOR SELECT TO authenticated
USING (public.current_user_owns_wallet(wallet_id));
CREATE POLICY "Owners view payouts" ON public.payouts FOR SELECT TO authenticated
USING (public.current_user_owns_wallet(wallet_id));

REVOKE ALL ON public.payments,public.payment_events,public.payment_transactions,public.refunds,
  public.wallets,public.payout_accounts,public.wallet_transactions,public.payouts FROM anon,authenticated;
GRANT SELECT ON public.payments,public.payment_events,public.payment_transactions,public.refunds,
  public.wallets,public.payout_accounts,public.wallet_transactions,public.payouts TO authenticated;
GRANT INSERT ON public.payout_accounts TO authenticated;
GRANT UPDATE (pix_key,holder_name,document,is_active) ON public.payout_accounts TO authenticated;
GRANT ALL ON public.payments,public.payment_events,public.payment_transactions,public.refunds,
  public.wallets,public.payout_accounts,public.wallet_transactions,public.payouts TO service_role;
