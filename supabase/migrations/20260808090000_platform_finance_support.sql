-- APOIS ENTREGAS — cities, pricing, payments, wallets, reviews, notifications and support.

-- -----------------------------------------------------------------------------
-- Geographic configuration
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state text NOT NULL CHECK (char_length(state) = 2),
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT false,
  center_latitude numeric(9,6) CHECK (center_latitude IS NULL OR center_latitude BETWEEN -90 AND 90),
  center_longitude numeric(9,6) CHECK (center_longitude IS NULL OR center_longitude BETWEEN -180 AND 180),
  default_delivery_radius_km numeric(8,2) NOT NULL DEFAULT 10 CHECK (default_delivery_radius_km > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lower(name), state)
);

CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  center_latitude numeric(9,6) CHECK (center_latitude IS NULL OR center_latitude BETWEEN -90 AND 90),
  center_longitude numeric(9,6) CHECK (center_longitude IS NULL OR center_longitude BETWEEN -180 AND 180),
  radius_km numeric(8,2) CHECK (radius_km IS NULL OR radius_km > 0),
  geojson jsonb CHECK (geojson IS NULL OR jsonb_typeof(geojson) = 'object'),
  delivery_fee numeric(10,2) CHECK (delivery_fee IS NULL OR delivery_fee >= 0),
  minimum_order numeric(10,2) CHECK (minimum_order IS NULL OR minimum_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_zones_city_active_idx ON public.delivery_zones(city_id,is_active);

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS merchants_city_active_idx ON public.merchants(city_id,is_active);

-- -----------------------------------------------------------------------------
-- Pricing rules
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid REFERENCES public.cities(id) ON DELETE CASCADE,
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  customer_service_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (customer_service_fee >= 0),
  merchant_commission_percent numeric(6,3) NOT NULL DEFAULT 0 CHECK (merchant_commission_percent BETWEEN 0 AND 100),
  courier_base_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (courier_base_fee >= 0),
  courier_per_km numeric(10,2) NOT NULL DEFAULT 0 CHECK (courier_per_km >= 0),
  courier_minimum_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (courier_minimum_fee >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS fee_rules_lookup_idx ON public.fee_rules(city_id,merchant_id,is_active);

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Promotions / coupons
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value numeric(10,2) NOT NULL CHECK (discount_value > 0),
  minimum_order numeric(10,2) NOT NULL DEFAULT 0 CHECK (minimum_order >= 0),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  menu_category_id uuid REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (discount_type <> 'percent' OR discount_value <= 100)
);
CREATE INDEX IF NOT EXISTS promotions_merchant_active_idx ON public.promotions(merchant_id,is_active,starts_at,ends_at);

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE CASCADE,
  code text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value numeric(10,2) NOT NULL CHECK (discount_value > 0),
  minimum_order numeric(10,2) NOT NULL DEFAULT 0 CHECK (minimum_order >= 0),
  max_discount numeric(10,2) CHECK (max_discount IS NULL OR max_discount >= 0),
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  usage_limit_per_user integer CHECK (usage_limit_per_user IS NULL OR usage_limit_per_user > 0),
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, code),
  CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discount_amount numeric(10,2) NOT NULL CHECK (discount_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coupon_redemptions_user_coupon_idx ON public.coupon_redemptions(user_id,coupon_id);

-- -----------------------------------------------------------------------------
-- Payment records. Provider payloads live only in payment_events.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_charge_id text,
  method text NOT NULL CHECK (method IN ('pix','credit','debit','cash','wallet')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed','cancelled','refunded')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'BRL',
  qr_code_text text,
  qr_code_image_url text,
  expires_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_charge_unique_idx ON public.payments(provider,provider_charge_id) WHERE provider_charge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_order_status_idx ON public.payments(order_id,status);

CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','ignored','failed')),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider,provider_event_id)
);

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  provider_transaction_id text,
  transaction_type text NOT NULL CHECK (transaction_type IN ('charge','fee','refund','chargeback','adjustment')),
  amount numeric(12,2) NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','completed','failed','cancelled')),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id,provider_transaction_id,transaction_type)
);

CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  provider_refund_id text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Wallet / ledger / payout
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('customer','courier','merchant','platform')),
  customer_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  courier_id uuid REFERENCES public.couriers(id) ON DELETE CASCADE,
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE CASCADE,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  available_balance numeric(14,2) NOT NULL DEFAULT 0,
  is_blocked boolean NOT NULL DEFAULT false,
  blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (owner_type='customer' AND customer_user_id IS NOT NULL AND courier_id IS NULL AND merchant_id IS NULL) OR
    (owner_type='courier' AND customer_user_id IS NULL AND courier_id IS NOT NULL AND merchant_id IS NULL) OR
    (owner_type='merchant' AND customer_user_id IS NULL AND courier_id IS NULL AND merchant_id IS NOT NULL) OR
    (owner_type='platform' AND customer_user_id IS NULL AND courier_id IS NULL AND merchant_id IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS wallets_customer_unique_idx ON public.wallets(customer_user_id) WHERE customer_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallets_courier_unique_idx ON public.wallets(courier_id) WHERE courier_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallets_merchant_unique_idx ON public.wallets(merchant_id) WHERE merchant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallets_platform_unique_idx ON public.wallets(owner_type) WHERE owner_type='platform';

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  transaction_type text NOT NULL CHECK (transaction_type IN ('credit','debit','order_earning','platform_fee','refund','payout','payout_hold','payout_release','adjustment')),
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','cancelled')),
  reference_type text,
  reference_id text,
  description text,
  idempotency_key text NOT NULL UNIQUE,
  balance_after numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_transactions_wallet_created_idx ON public.wallet_transactions(wallet_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed','cancelled')),
  provider text,
  provider_payout_id text,
  pix_key_snapshot text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  failure_reason text,
  idempotency_key text NOT NULL UNIQUE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payouts_wallet_status_idx ON public.payouts(wallet_id,status,requested_at DESC);

-- -----------------------------------------------------------------------------
-- Reviews
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  merchant_rating smallint CHECK (merchant_rating IS NULL OR merchant_rating BETWEEN 1 AND 5),
  courier_rating smallint CHECK (courier_rating IS NULL OR courier_rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id,customer_user_id),
  CHECK (merchant_rating IS NOT NULL OR courier_rating IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS reviews_merchant_created_idx ON public.reviews(merchant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_courier_created_idx ON public.reviews(courier_id,created_at DESC) WHERE courier_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data)='object'),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON public.notifications(user_id,created_at DESC) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('android','ios','web')),
  token text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_devices_user_active_idx ON public.push_devices(user_id,is_active);

-- -----------------------------------------------------------------------------
-- Support
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  delivery_job_id uuid REFERENCES public.delivery_jobs(id) ON DELETE SET NULL,
  category text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  assigned_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_status_priority_idx ON public.support_tickets(status,priority,created_at);
CREATE INDEX IF NOT EXISTS support_tickets_requester_idx ON public.support_tickets(requester_user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  attachment_paths jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachment_paths)='array'),
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_ticket_created_idx ON public.support_messages(ticket_id,created_at);

-- -----------------------------------------------------------------------------
-- Order financial snapshots
-- -----------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (service_fee >= 0),
  ADD COLUMN IF NOT EXISTS platform_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  ADD COLUMN IF NOT EXISTS merchant_net numeric(12,2) CHECK (merchant_net IS NULL OR merchant_net >= 0),
  ADD COLUMN IF NOT EXISTS courier_earnings numeric(10,2) CHECK (courier_earnings IS NULL OR courier_earnings >= 0),
  ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL;

-- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cities','delivery_zones','fee_rules','platform_settings','promotions','coupons','payments','refunds','wallets','payouts','reviews','push_devices','support_tickets']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I',t,t);
    EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',t,t);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Review RPC guarantees delivered order ownership and one review per order.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_order_review(
  _order_id uuid,
  _merchant_rating smallint,
  _courier_rating smallint DEFAULT NULL,
  _comment text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE v_order public.orders; v_courier_id uuid; v_review_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders o
  WHERE o.id=_order_id AND o.customer_user_id=(SELECT auth.uid())
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.status<>'delivered' THEN RAISE EXCEPTION 'order is not delivered'; END IF;
  IF _merchant_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'invalid merchant rating'; END IF;
  IF _courier_rating IS NOT NULL AND _courier_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'invalid courier rating'; END IF;
  IF _comment IS NOT NULL AND char_length(_comment)>1000 THEN RAISE EXCEPTION 'comment is too long'; END IF;
  SELECT dj.courier_id INTO v_courier_id FROM public.delivery_jobs dj WHERE dj.order_id=_order_id;
  INSERT INTO public.reviews(order_id,customer_user_id,merchant_id,courier_id,merchant_rating,courier_rating,comment)
  VALUES(_order_id,(SELECT auth.uid()),v_order.merchant_id,v_courier_id,_merchant_rating,CASE WHEN v_courier_id IS NULL THEN NULL ELSE _courier_rating END,NULLIF(btrim(_comment),''))
  ON CONFLICT(order_id,customer_user_id) DO UPDATE SET merchant_rating=EXCLUDED.merchant_rating,courier_rating=EXCLUDED.courier_rating,comment=EXCLUDED.comment
  RETURNING id INTO v_review_id;
  RETURN v_review_id;
END; $$;

-- Wallet ownership helper.
CREATE OR REPLACE FUNCTION public.current_user_owns_wallet(_wallet_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wallets w
    LEFT JOIN public.couriers c ON c.id=w.courier_id
    WHERE w.id=_wallet_id AND (
      w.customer_user_id=(SELECT auth.uid()) OR
      c.user_id=(SELECT auth.uid()) OR
      (w.merchant_id IS NOT NULL AND public.current_user_is_merchant_manager(w.merchant_id)) OR
      public.current_user_is_admin()
    )
  );
$$;

-- Trusted idempotent ledger posting. Only service_role may execute.
CREATE OR REPLACE FUNCTION public.post_wallet_transaction(
  _wallet_id uuid,
  _transaction_type text,
  _amount numeric,
  _idempotency_key text,
  _reference_type text DEFAULT NULL,
  _reference_id text DEFAULT NULL,
  _description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_existing uuid; v_balance numeric; v_tx uuid;
BEGIN
  IF _amount=0 THEN RAISE EXCEPTION 'amount cannot be zero'; END IF;
  SELECT wt.id INTO v_existing FROM public.wallet_transactions wt WHERE wt.idempotency_key=_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  SELECT w.balance INTO v_balance FROM public.wallets w WHERE w.id=_wallet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet not found'; END IF;
  v_balance:=v_balance+_amount;
  INSERT INTO public.wallet_transactions(wallet_id,transaction_type,amount,status,reference_type,reference_id,description,idempotency_key,balance_after)
  VALUES(_wallet_id,_transaction_type,_amount,'completed',_reference_type,_reference_id,_description,_idempotency_key,v_balance)
  RETURNING id INTO v_tx;
  UPDATE public.wallets SET balance=v_balance,available_balance=available_balance+_amount WHERE id=_wallet_id;
  RETURN v_tx;
END; $$;

-- Payout request reserves available funds atomically; provider processing occurs server-side.
CREATE OR REPLACE FUNCTION public.request_payout(_wallet_id uuid,_amount numeric,_idempotency_key text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_wallet public.wallets; v_id uuid; v_pix text;
BEGIN
  IF NOT public.current_user_owns_wallet(_wallet_id) THEN RAISE EXCEPTION 'wallet access required'; END IF;
  IF _amount<=0 THEN RAISE EXCEPTION 'invalid payout amount'; END IF;
  SELECT * INTO v_wallet FROM public.wallets w WHERE w.id=_wallet_id FOR UPDATE;
  IF v_wallet.is_blocked THEN RAISE EXCEPTION 'wallet is blocked'; END IF;
  SELECT p.id INTO v_id FROM public.payouts p WHERE p.idempotency_key=_idempotency_key;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  IF v_wallet.available_balance<_amount THEN RAISE EXCEPTION 'insufficient available balance'; END IF;
  IF v_wallet.owner_type='courier' THEN SELECT c.pix_key INTO v_pix FROM public.couriers c WHERE c.id=v_wallet.courier_id; END IF;
  IF NULLIF(btrim(v_pix),'') IS NULL AND v_wallet.owner_type='courier' THEN RAISE EXCEPTION 'PIX key required'; END IF;
  INSERT INTO public.payouts(wallet_id,amount,status,pix_key_snapshot,requested_by,idempotency_key)
  VALUES(_wallet_id,_amount,'pending',v_pix,(SELECT auth.uid()),_idempotency_key) RETURNING id INTO v_id;
  UPDATE public.wallets SET available_balance=available_balance-_amount WHERE id=_wallet_id;
  INSERT INTO public.wallet_transactions(wallet_id,transaction_type,amount,status,reference_type,reference_id,description,idempotency_key,balance_after)
  VALUES(_wallet_id,'payout_hold',-_amount,'pending','payout',v_id::text,'Reserva para saque','payout-hold:'||v_id::text,v_wallet.balance);
  RETURN v_id;
END; $$;

-- Notification read helper keeps clients from altering notification content.
CREATE OR REPLACE FUNCTION public.mark_notification_read(_notification_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  UPDATE public.notifications SET read_at=COALESCE(read_at,now())
  WHERE id=_notification_id AND user_id=(SELECT auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Function permissions
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.submit_order_review(uuid,smallint,smallint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.current_user_owns_wallet(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_wallet_transaction(uuid,text,numeric,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.request_payout(uuid,numeric,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_order_review(uuid,smallint,smallint,text),public.current_user_owns_wallet(uuid),public.request_payout(uuid,numeric,text),public.mark_notification_read(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.post_wallet_transaction(uuid,text,numeric,text,text,text,text) TO service_role;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cities','delivery_zones','fee_rules','platform_settings','promotions','coupons','coupon_redemptions','payments','payment_events','payment_transactions','refunds','wallets','wallet_transactions','payouts','reviews','notifications','push_devices','support_tickets','support_messages']
  LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); END LOOP;
END $$;

-- Public regional/catalog offers.
CREATE POLICY "Public can view active cities" ON public.cities FOR SELECT TO anon,authenticated USING(is_active=true);
CREATE POLICY "Admins manage cities" ON public.cities FOR ALL TO authenticated USING(public.current_user_is_admin()) WITH CHECK(public.current_user_is_admin());
CREATE POLICY "Public can view active delivery zones" ON public.delivery_zones FOR SELECT TO anon,authenticated USING(is_active=true AND EXISTS(SELECT 1 FROM public.cities c WHERE c.id=city_id AND c.is_active=true));
CREATE POLICY "Admins manage delivery zones" ON public.delivery_zones FOR ALL TO authenticated USING(public.current_user_is_admin()) WITH CHECK(public.current_user_is_admin());
CREATE POLICY "Admins view fee rules" ON public.fee_rules FOR SELECT TO authenticated USING(public.current_user_is_admin());
CREATE POLICY "Merchant managers view applicable fee rules" ON public.fee_rules FOR SELECT TO authenticated USING(merchant_id IS NOT NULL AND public.current_user_is_merchant_manager(merchant_id));
CREATE POLICY "Admins manage fee rules" ON public.fee_rules FOR ALL TO authenticated USING(public.current_user_is_admin()) WITH CHECK(public.current_user_is_admin());
CREATE POLICY "Admins manage platform settings" ON public.platform_settings FOR ALL TO authenticated USING(public.current_user_is_admin()) WITH CHECK(public.current_user_is_admin());

-- Promotions/coupons.
CREATE POLICY "Public views active promotions" ON public.promotions FOR SELECT TO anon,authenticated USING(is_active=true AND now() BETWEEN starts_at AND ends_at);
CREATE POLICY "Merchant managers manage promotions" ON public.promotions FOR ALL TO authenticated USING(public.current_user_is_merchant_manager(merchant_id) OR public.current_user_is_admin()) WITH CHECK(public.current_user_is_merchant_manager(merchant_id) OR public.current_user_is_admin());
CREATE POLICY "Authenticated users view usable coupons" ON public.coupons FOR SELECT TO authenticated USING(is_active=true AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now()));
CREATE POLICY "Merchant managers manage coupons" ON public.coupons FOR ALL TO authenticated USING((merchant_id IS NOT NULL AND public.current_user_is_merchant_manager(merchant_id)) OR public.current_user_is_admin()) WITH CHECK((merchant_id IS NOT NULL AND public.current_user_is_merchant_manager(merchant_id)) OR public.current_user_is_admin());
CREATE POLICY "Customers view own coupon redemptions" ON public.coupon_redemptions FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR public.current_user_is_admin());

-- Payments are read-only to actors; writes are service/webhook operations.
CREATE POLICY "Customers view own payments" ON public.payments FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.orders o WHERE o.id=payments.order_id AND o.customer_user_id=(SELECT auth.uid())));
CREATE POLICY "Merchants view order payments" ON public.payments FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.orders o WHERE o.id=payments.order_id AND public.current_user_is_merchant_member(o.merchant_id)));
CREATE POLICY "Admins view payments" ON public.payments FOR SELECT TO authenticated USING(public.current_user_is_admin());
CREATE POLICY "Admins view payment events" ON public.payment_events FOR SELECT TO authenticated USING(public.current_user_is_admin());
CREATE POLICY "Admins view payment transactions" ON public.payment_transactions FOR SELECT TO authenticated USING(public.current_user_is_admin());
CREATE POLICY "Customers view own refunds" ON public.refunds FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.orders o WHERE o.id=refunds.order_id AND o.customer_user_id=(SELECT auth.uid())));
CREATE POLICY "Admins view refunds" ON public.refunds FOR SELECT TO authenticated USING(public.current_user_is_admin());

-- Wallet ownership.
CREATE POLICY "Owners view wallets" ON public.wallets FOR SELECT TO authenticated USING(public.current_user_owns_wallet(id));
CREATE POLICY "Owners view wallet transactions" ON public.wallet_transactions FOR SELECT TO authenticated USING(public.current_user_owns_wallet(wallet_id));
CREATE POLICY "Owners view payouts" ON public.payouts FOR SELECT TO authenticated USING(public.current_user_owns_wallet(wallet_id));

-- Reviews.
CREATE POLICY "Customers view own reviews" ON public.reviews FOR SELECT TO authenticated USING(customer_user_id=(SELECT auth.uid()) OR public.current_user_is_admin());
CREATE POLICY "Merchants view their reviews" ON public.reviews FOR SELECT TO authenticated USING(public.current_user_is_merchant_member(merchant_id));
CREATE POLICY "Couriers view their reviews" ON public.reviews FOR SELECT TO authenticated USING(courier_id=public.current_user_courier_id());

-- Notifications/devices.
CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR public.current_user_is_admin());
CREATE POLICY "Users view own push devices" ON public.push_devices FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR public.current_user_is_admin());
CREATE POLICY "Users register own push devices" ON public.push_devices FOR INSERT TO authenticated WITH CHECK(user_id=(SELECT auth.uid()));
CREATE POLICY "Users update own push devices" ON public.push_devices FOR UPDATE TO authenticated USING(user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));
CREATE POLICY "Users delete own push devices" ON public.push_devices FOR DELETE TO authenticated USING(user_id=(SELECT auth.uid()));

-- Support.
CREATE POLICY "Users view own support tickets" ON public.support_tickets FOR SELECT TO authenticated USING(requester_user_id=(SELECT auth.uid()) OR public.current_user_is_admin());
CREATE POLICY "Users create support tickets" ON public.support_tickets FOR INSERT TO authenticated WITH CHECK(requester_user_id=(SELECT auth.uid()) AND status='open' AND assigned_admin_id IS NULL);
CREATE POLICY "Admins manage support tickets" ON public.support_tickets FOR ALL TO authenticated USING(public.current_user_is_admin()) WITH CHECK(public.current_user_is_admin());
CREATE POLICY "Ticket participants view messages" ON public.support_messages FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.support_tickets t WHERE t.id=support_messages.ticket_id AND (t.requester_user_id=(SELECT auth.uid()) OR public.current_user_is_admin()) AND (NOT support_messages.is_internal OR public.current_user_is_admin())));
CREATE POLICY "Users add messages to own open tickets" ON public.support_messages FOR INSERT TO authenticated WITH CHECK(sender_user_id=(SELECT auth.uid()) AND is_internal=false AND EXISTS(SELECT 1 FROM public.support_tickets t WHERE t.id=ticket_id AND t.requester_user_id=(SELECT auth.uid()) AND t.status IN ('open','in_progress')));
CREATE POLICY "Admins add support messages" ON public.support_messages FOR INSERT TO authenticated WITH CHECK(public.current_user_is_admin());

-- -----------------------------------------------------------------------------
-- Table privileges
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.cities,public.delivery_zones,public.fee_rules,public.platform_settings,public.promotions,public.coupons,public.coupon_redemptions,public.payments,public.payment_events,public.payment_transactions,public.refunds,public.wallets,public.wallet_transactions,public.payouts,public.reviews,public.notifications,public.push_devices,public.support_tickets,public.support_messages FROM anon,authenticated;
GRANT SELECT ON public.cities,public.delivery_zones,public.promotions TO anon,authenticated;
GRANT SELECT ON public.fee_rules,public.platform_settings,public.coupons,public.coupon_redemptions,public.payments,public.payment_events,public.payment_transactions,public.refunds,public.wallets,public.wallet_transactions,public.payouts,public.reviews,public.notifications,public.push_devices,public.support_tickets,public.support_messages TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.promotions,public.coupons TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.push_devices TO authenticated;
GRANT INSERT ON public.support_tickets,public.support_messages TO authenticated;
GRANT ALL ON public.cities,public.delivery_zones,public.fee_rules,public.platform_settings,public.promotions,public.coupons,public.coupon_redemptions,public.payments,public.payment_events,public.payment_transactions,public.refunds,public.wallets,public.wallet_transactions,public.payouts,public.reviews,public.notifications,public.push_devices,public.support_tickets,public.support_messages TO service_role;
