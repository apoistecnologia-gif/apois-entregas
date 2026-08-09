ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS checkout_intent_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS orders_active_checkout_intent_key_uniq
ON public.orders (customer_user_id, checkout_intent_key)
WHERE customer_user_id IS NOT NULL
  AND checkout_intent_key IS NOT NULL
  AND payment_status IN ('pending', 'processing', 'failed')
  AND status NOT IN ('cancelled', 'refunded', 'delivered');

CREATE OR REPLACE FUNCTION public.create_order_for_checkout_intent(
  p_customer_user_id uuid,
  p_merchant_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_delivery_address jsonb,
  p_request_key uuid,
  p_checkout_intent_key uuid,
  p_observation text DEFAULT NULL
)
RETURNS TABLE (
  order_id uuid,
  order_number bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_order_id uuid;
  v_order_number bigint;
  v_existing_customer uuid;
  v_existing_status text;
  v_existing_payment_status text;
  v_effective_request_key uuid := p_request_key;
BEGIN
  IF p_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'customer_user_id is required';
  END IF;
  IF p_request_key IS NULL THEN
    RAISE EXCEPTION 'request_key is required';
  END IF;
  IF p_checkout_intent_key IS NULL THEN
    RAISE EXCEPTION 'checkout_intent_key is required';
  END IF;

  -- Reuse the current unpaid checkout intent independently of browser TTL/reloads.
  SELECT o.id, o.order_number
    INTO v_order_id, v_order_number
  FROM public.orders AS o
  WHERE o.customer_user_id = p_customer_user_id
    AND o.checkout_intent_key = p_checkout_intent_key
    AND o.payment_status IN ('pending', 'processing', 'failed')
    AND o.status NOT IN ('cancelled', 'refunded', 'delivered')
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_order_id, v_order_number;
    RETURN;
  END IF;

  -- A stale browser request key may point to a completed purchase. Never reuse it
  -- for a new checkout; rotate server-side while preserving active retry recovery.
  SELECT o.customer_user_id, o.status, o.payment_status, o.id, o.order_number
    INTO v_existing_customer, v_existing_status, v_existing_payment_status,
         v_order_id, v_order_number
  FROM public.orders AS o
  WHERE o.request_key = p_request_key;

  IF FOUND THEN
    IF v_existing_customer IS DISTINCT FROM p_customer_user_id THEN
      RAISE EXCEPTION 'request_key already belongs to another customer';
    END IF;

    IF v_existing_payment_status IN ('pending', 'processing', 'failed')
       AND v_existing_status NOT IN ('cancelled', 'refunded', 'delivered') THEN
      BEGIN
        UPDATE public.orders
        SET checkout_intent_key = p_checkout_intent_key
        WHERE id = v_order_id
          AND checkout_intent_key IS DISTINCT FROM p_checkout_intent_key;
      EXCEPTION WHEN unique_violation THEN
        SELECT o.id, o.order_number
          INTO v_order_id, v_order_number
        FROM public.orders AS o
        WHERE o.customer_user_id = p_customer_user_id
          AND o.checkout_intent_key = p_checkout_intent_key
          AND o.payment_status IN ('pending', 'processing', 'failed')
          AND o.status NOT IN ('cancelled', 'refunded', 'delivered')
        ORDER BY o.created_at DESC
        LIMIT 1;
        IF NOT FOUND THEN
          RAISE;
        END IF;
      END;

      RETURN QUERY SELECT v_order_id, v_order_number;
      RETURN;
    END IF;

    v_effective_request_key := gen_random_uuid();
  END IF;

  -- Concurrent calls with different browser request keys but the same checkout
  -- intent are serialized by the partial unique index. A losing subtransaction is
  -- rolled back completely, so no orphan duplicate order survives the race.
  BEGIN
    SELECT created.order_id, created.order_number
      INTO v_order_id, v_order_number
    FROM public.create_order_atomic(
      p_customer_user_id,
      p_merchant_id,
      p_items,
      p_payment_method,
      p_delivery_address,
      v_effective_request_key,
      p_observation
    ) AS created;

    UPDATE public.orders
    SET checkout_intent_key = p_checkout_intent_key
    WHERE id = v_order_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT o.id, o.order_number
      INTO v_order_id, v_order_number
    FROM public.orders AS o
    WHERE o.customer_user_id = p_customer_user_id
      AND o.checkout_intent_key = p_checkout_intent_key
      AND o.payment_status IN ('pending', 'processing', 'failed')
      AND o.status NOT IN ('cancelled', 'refunded', 'delivered')
    ORDER BY o.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE;
    END IF;
  END;

  RETURN QUERY SELECT v_order_id, v_order_number;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_for_checkout_intent(uuid, uuid, jsonb, text, jsonb, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_for_checkout_intent(uuid, uuid, jsonb, text, jsonb, uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_order_for_checkout_intent(uuid, uuid, jsonb, text, jsonb, uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_for_checkout_intent(uuid, uuid, jsonb, text, jsonb, uuid, uuid, text) TO service_role;

COMMENT ON COLUMN public.orders.checkout_intent_key IS
  'Server-derived fingerprint for recovering one active unpaid checkout intent across reloads/retries.';
COMMENT ON FUNCTION public.create_order_for_checkout_intent(uuid, uuid, jsonb, text, jsonb, uuid, uuid, text) IS
  'Creates or reuses one active unpaid order for a canonical checkout intent; completed/terminal purchases are never reused.';
