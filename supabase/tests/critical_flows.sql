-- APOIS ENTREGAS — critical database smoke tests.
-- Run against a disposable/dev database or wrap in BEGIN/ROLLBACK as below.
-- Production validation performed by the engineering workflow must never leave these rows committed.

BEGIN;

-- 1. Wallet ledger cannot overdraw and an idempotency key cannot post twice.
DO $$
DECLARE
  v_user uuid;
  v_wallet uuid;
  v_first uuid;
  v_retry uuid;
  v_rejected boolean := false;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    RAISE NOTICE 'wallet smoke skipped: no auth user';
    RETURN;
  END IF;

  INSERT INTO public.wallets(owner_type,customer_user_id)
  VALUES('customer',v_user)
  ON CONFLICT (customer_user_id) WHERE customer_user_id IS NOT NULL DO UPDATE
  SET customer_user_id=EXCLUDED.customer_user_id
  RETURNING id INTO v_wallet;

  v_first := public.post_wallet_transaction(v_wallet,'credit',100,100,0,'sql-smoke-credit',NULL,NULL,'smoke','completed');
  v_retry := public.post_wallet_transaction(v_wallet,'credit',100,100,0,'sql-smoke-credit',NULL,NULL,'smoke','completed');
  IF v_first IS DISTINCT FROM v_retry THEN RAISE EXCEPTION 'ledger idempotency failed'; END IF;

  BEGIN
    PERFORM public.post_wallet_transaction(v_wallet,'debit',-999999,-999999,0,'sql-smoke-overdraw',NULL,NULL,'must fail','completed');
  EXCEPTION WHEN OTHERS THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'wallet overdraw was accepted'; END IF;
END $$;

-- 2. All sensitive public tables expected by the ecosystem must have RLS enabled.
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(c.relname, ', ')
  INTO v_missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relkind='r'
    AND c.relname IN (
      'profiles','merchant_members','merchant_documents','couriers','courier_documents',
      'courier_availability','courier_locations','orders','order_items','order_status_history',
      'delivery_jobs','delivery_offers','delivery_events','delivery_confirmation_secrets',
      'payments','payment_events','payment_transactions','refunds','wallets','wallet_transactions',
      'payout_accounts','payouts','reviews','notifications','push_devices','support_tickets',
      'support_messages','admin_audit_logs'
    )
    AND NOT c.relrowsecurity;
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'RLS missing: %',v_missing; END IF;
END $$;

-- 3. Browser roles must never hold EXECUTE on service-only functions.
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(p.proname, ', ')
  INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN (
      'create_order_atomic','post_wallet_transaction','settle_payout',
      'settle_delivered_order_financials','dispatch_delivery_job_offers','enqueue_notification'
    )
    AND (
      has_function_privilege('anon',p.oid,'EXECUTE') OR
      has_function_privilege('authenticated',p.oid,'EXECUTE')
    );
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'service-only RPC exposed: %',v_bad; END IF;
END $$;

ROLLBACK;
