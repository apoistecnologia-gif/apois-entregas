-- Atomic, server-authoritative order creation.
-- This function is intentionally executable only by service_role and is meant
-- to be called from a trusted backend/Edge Function after authenticating the user.

ALTER TABLE public.orders
ADD COLUMN request_key uuid NOT NULL UNIQUE;

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_customer_user_id uuid,
  p_merchant_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_delivery_address jsonb,
  p_request_key uuid,
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
  v_subtotal numeric := 0;
  v_delivery_fee numeric := 0;
  v_total numeric := 0;
  v_merchant_active boolean;
  v_merchant_open boolean;

  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_product_name text;
  v_product_description text;
  v_product_price numeric;
  v_product_available boolean;
  v_product_merchant_id uuid;

  v_options jsonb;
  v_option jsonb;
  v_option_id uuid;
  v_option_name text;
  v_option_price_delta numeric;
  v_option_available boolean;
  v_option_group_id uuid;
  v_option_group_name text;
  v_option_group_active boolean;
  v_option_group_product_id uuid;

  v_selected_options jsonb;
  v_unit_price numeric;
  v_line_total numeric;
  v_group record;
  v_group_selection_count integer;
  v_validated_items jsonb := '[]'::jsonb;
  v_validated_item jsonb;
BEGIN
  IF p_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'customer_user_id is required';
  END IF;

  IF p_merchant_id IS NULL THEN
    RAISE EXCEPTION 'merchant_id is required';
  END IF;

  IF p_request_key IS NULL THEN
    RAISE EXCEPTION 'request_key is required';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN ('pix', 'credit', 'debit', 'cash', 'wallet') THEN
    RAISE EXCEPTION 'invalid payment method';
  END IF;

  IF p_delivery_address IS NULL OR jsonb_typeof(p_delivery_address) <> 'object' THEN
    RAISE EXCEPTION 'delivery_address must be a JSON object';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items must be a non-empty JSON array';
  END IF;

  -- Fast idempotency path. The INSERT below is still authoritative for races.
  SELECT o.id, o.order_number
    INTO v_order_id, v_order_number
  FROM public.orders AS o
  WHERE o.request_key = p_request_key;

  IF FOUND THEN
    IF (
      SELECT o.customer_user_id
      FROM public.orders AS o
      WHERE o.id = v_order_id
    ) IS DISTINCT FROM p_customer_user_id THEN
      RAISE EXCEPTION 'request_key already belongs to another customer';
    END IF;

    RETURN QUERY SELECT v_order_id, v_order_number;
    RETURN;
  END IF;

  SELECT m.is_active, m.is_open, m.delivery_fee
    INTO v_merchant_active, v_merchant_open, v_delivery_fee
  FROM public.merchants AS m
  WHERE m.id = p_merchant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'merchant not found';
  END IF;

  IF NOT v_merchant_active THEN
    RAISE EXCEPTION 'merchant is inactive';
  END IF;

  IF NOT v_merchant_open THEN
    RAISE EXCEPTION 'merchant is closed';
  END IF;

  -- Validate the complete cart and freeze a server-authoritative snapshot before
  -- writing any order item.
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'each item must be a JSON object';
    END IF;

    IF NULLIF(v_item->>'productId', '') IS NULL THEN
      RAISE EXCEPTION 'productId is required for every item';
    END IF;

    BEGIN
      v_product_id := (v_item->>'productId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid productId';
    END;

    IF jsonb_typeof(v_item->'quantity') <> 'number'
       OR (v_item->>'quantity') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'quantity must be a positive integer';
    END IF;

    v_quantity := (v_item->>'quantity')::integer;
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'quantity must be greater than zero';
    END IF;

    v_options := COALESCE(v_item->'options', '[]'::jsonb);
    IF jsonb_typeof(v_options) <> 'array' THEN
      RAISE EXCEPTION 'options must be a JSON array';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_options) AS opt
      WHERE jsonb_typeof(opt) <> 'object'
         OR NULLIF(opt->>'optionId', '') IS NULL
    ) THEN
      RAISE EXCEPTION 'every option must contain optionId';
    END IF;

    IF (
      SELECT count(*)
      FROM jsonb_array_elements(v_options)
    ) <> (
      SELECT count(DISTINCT opt->>'optionId')
      FROM jsonb_array_elements(v_options) AS opt
    ) THEN
      RAISE EXCEPTION 'duplicate optionId in item';
    END IF;

    SELECT p.name, p.description, p.price, p.is_available, p.merchant_id
      INTO v_product_name, v_product_description, v_product_price,
           v_product_available, v_product_merchant_id
    FROM public.products AS p
    WHERE p.id = v_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product % not found', v_product_id;
    END IF;

    IF v_product_merchant_id IS DISTINCT FROM p_merchant_id THEN
      RAISE EXCEPTION 'product % does not belong to merchant', v_product_id;
    END IF;

    IF NOT v_product_available THEN
      RAISE EXCEPTION 'product % is unavailable', v_product_id;
    END IF;

    v_unit_price := v_product_price;
    v_selected_options := '[]'::jsonb;

    FOR v_option IN
      SELECT value FROM jsonb_array_elements(v_options)
    LOOP
      BEGIN
        v_option_id := (v_option->>'optionId')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'invalid optionId';
      END;

      SELECT po.name,
             po.price_delta,
             po.is_available,
             pog.id,
             pog.name,
             pog.is_active,
             pog.product_id
        INTO v_option_name,
             v_option_price_delta,
             v_option_available,
             v_option_group_id,
             v_option_group_name,
             v_option_group_active,
             v_option_group_product_id
      FROM public.product_options AS po
      JOIN public.product_option_groups AS pog
        ON pog.id = po.option_group_id
      WHERE po.id = v_option_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'option % not found', v_option_id;
      END IF;

      IF NOT v_option_available THEN
        RAISE EXCEPTION 'option % is unavailable', v_option_id;
      END IF;

      IF NOT v_option_group_active
         OR v_option_group_product_id IS DISTINCT FROM v_product_id THEN
        RAISE EXCEPTION 'option % is invalid for product %', v_option_id, v_product_id;
      END IF;

      v_unit_price := v_unit_price + v_option_price_delta;
      v_selected_options := v_selected_options || jsonb_build_array(
        jsonb_build_object(
          'groupId', v_option_group_id,
          'groupName', v_option_group_name,
          'optionId', v_option_id,
          'optionName', v_option_name,
          'priceDelta', v_option_price_delta
        )
      );
    END LOOP;

    -- Validate every active group, including required groups with zero selections.
    FOR v_group IN
      SELECT pog.id, pog.name, pog.min_selections, pog.max_selections
      FROM public.product_option_groups AS pog
      WHERE pog.product_id = v_product_id
        AND pog.is_active = true
    LOOP
      SELECT count(*)
        INTO v_group_selection_count
      FROM jsonb_array_elements(v_selected_options) AS selected
      WHERE (selected->>'groupId')::uuid = v_group.id;

      IF v_group_selection_count < v_group.min_selections THEN
        RAISE EXCEPTION 'group % requires at least % selections',
          v_group.name, v_group.min_selections;
      END IF;

      IF v_group_selection_count > v_group.max_selections THEN
        RAISE EXCEPTION 'group % allows at most % selections',
          v_group.name, v_group.max_selections;
      END IF;
    END LOOP;

    v_line_total := v_unit_price * v_quantity;
    v_subtotal := v_subtotal + v_line_total;

    v_validated_items := v_validated_items || jsonb_build_array(
      jsonb_build_object(
        'productId', v_product_id,
        'productName', v_product_name,
        'productDescription', v_product_description,
        'basePrice', v_product_price,
        'unitPrice', v_unit_price,
        'quantity', v_quantity,
        'lineTotal', v_line_total,
        'selectedOptions', v_selected_options
      )
    );
  END LOOP;

  v_total := v_subtotal + v_delivery_fee;

  -- The unique request_key plus ON CONFLICT makes concurrent retries safe.
  INSERT INTO public.orders (
    customer_user_id,
    merchant_id,
    status,
    payment_method,
    payment_status,
    subtotal,
    delivery_fee,
    discount,
    total,
    delivery_address,
    observation,
    request_key
  )
  VALUES (
    p_customer_user_id,
    p_merchant_id,
    'confirmed',
    p_payment_method,
    'pending',
    v_subtotal,
    v_delivery_fee,
    0,
    v_total,
    p_delivery_address,
    NULLIF(btrim(p_observation), ''),
    p_request_key
  )
  ON CONFLICT (request_key) DO NOTHING
  RETURNING id, public.orders.order_number
    INTO v_order_id, v_order_number;

  IF v_order_id IS NULL THEN
    SELECT o.id, o.order_number
      INTO v_order_id, v_order_number
    FROM public.orders AS o
    WHERE o.request_key = p_request_key;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'could not resolve idempotent order';
    END IF;

    IF (
      SELECT o.customer_user_id
      FROM public.orders AS o
      WHERE o.id = v_order_id
    ) IS DISTINCT FROM p_customer_user_id THEN
      RAISE EXCEPTION 'request_key already belongs to another customer';
    END IF;

    RETURN QUERY SELECT v_order_id, v_order_number;
    RETURN;
  END IF;

  FOR v_validated_item IN
    SELECT value FROM jsonb_array_elements(v_validated_items)
  LOOP
    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_name,
      product_description,
      base_price,
      unit_price,
      quantity,
      line_total,
      selected_options
    )
    VALUES (
      v_order_id,
      (v_validated_item->>'productId')::uuid,
      v_validated_item->>'productName',
      NULLIF(v_validated_item->>'productDescription', ''),
      (v_validated_item->>'basePrice')::numeric,
      (v_validated_item->>'unitPrice')::numeric,
      (v_validated_item->>'quantity')::integer,
      (v_validated_item->>'lineTotal')::numeric,
      v_validated_item->'selectedOptions'
    );
  END LOOP;

  INSERT INTO public.order_status_history (
    order_id,
    status,
    changed_by_user_id
  )
  VALUES (
    v_order_id,
    'confirmed',
    p_customer_user_id
  );

  RETURN QUERY SELECT v_order_id, v_order_number;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic(uuid, uuid, jsonb, text, jsonb, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_atomic(uuid, uuid, jsonb, text, jsonb, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_order_atomic(uuid, uuid, jsonb, text, jsonb, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, uuid, jsonb, text, jsonb, uuid, text) TO service_role;
