-- Migration: create_order_atomic
-- Created at: 2026-08-08 06:00:00

-- 1. Add request_key to orders for idempotency
ALTER TABLE public.orders 
ADD COLUMN request_key uuid NOT NULL UNIQUE;

-- 2. Create the atomic order creation function
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_customer_user_id uuid,
    p_merchant_id uuid,
    p_delivery_address jsonb,
    p_payment_method text,
    p_observation text,
    p_request_key uuid,
    p_items jsonb -- Array of {product_id, quantity, selected_option_ids: []}
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_order_id uuid;
    v_order_number bigint;
    v_merchant_active boolean;
    v_merchant_delivery_fee numeric(10,2);
    v_subtotal numeric(10,2) := 0;
    v_total numeric(10,2);
    v_item RECORD;
    v_product RECORD;
    v_option RECORD;
    v_item_unit_price numeric(10,2);
    v_item_line_total numeric(10,2);
    v_group RECORD;
    v_group_selections_count integer;
BEGIN
    -- 1. Check for idempotency
    SELECT id, order_number INTO v_order_id, v_order_number
    FROM public.orders
    WHERE request_key = p_request_key;

    IF v_order_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'order_id', v_order_id,
            'order_number', v_order_number,
            'is_duplicate', true
        );
    END IF;

    -- 2. Validate Merchant
    SELECT is_active, delivery_fee INTO v_merchant_active, v_merchant_delivery_fee
    FROM public.merchants
    WHERE id = p_merchant_id;

    IF v_merchant_active IS NULL OR NOT v_merchant_active THEN
        RAISE EXCEPTION 'Merchant is not active or does not exist';
    END IF;

    -- 3. Create Order placeholder
    INSERT INTO public.orders (
        customer_user_id,
        merchant_id,
        delivery_address,
        payment_method,
        observation,
        request_key,
        subtotal,
        total,
        delivery_fee
    ) VALUES (
        p_customer_user_id,
        p_merchant_id,
        p_delivery_address,
        p_payment_method,
        p_observation,
        p_request_key,
        0, -- temporary
        0, -- temporary
        v_merchant_delivery_fee
    ) RETURNING id, order_number INTO v_order_id, v_order_number;

    -- 4. Process Items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer, selected_option_ids uuid[])
    LOOP
        -- Validate Product
        SELECT name, description, price, is_available INTO v_product
        FROM public.products
        WHERE id = v_item.product_id AND merchant_id = p_merchant_id;

        IF v_product IS NULL THEN
            RAISE EXCEPTION 'Product % does not exist for this merchant', v_item.product_id;
        END IF;

        IF NOT v_product.is_available THEN
            RAISE EXCEPTION 'Product % is not available', v_product.name;
        END IF;

        v_item_unit_price := v_product.price;

        -- Validate Options
        IF v_item.selected_option_ids IS NOT NULL AND array_length(v_item.selected_option_ids, 1) > 0 THEN
            -- Check each option belongs to the product and calculate price
            FOR v_option IN 
                SELECT po.id, po.name, po.price_delta, po.group_id, pog.min_selections, pog.max_selections
                FROM public.product_options po
                JOIN public.product_option_groups pog ON po.group_id = pog.id
                WHERE po.id = ANY(v_item.selected_option_ids)
                AND pog.product_id = v_item.product_id
                AND po.is_active = true
            LOOP
                v_item_unit_price := v_item_unit_price + COALESCE(v_option.price_delta, 0);
            END LOOP;

            -- Validate group limits (min/max)
            FOR v_group IN 
                SELECT pog.id, pog.min_selections, pog.max_selections
                FROM public.product_option_groups pog
                WHERE pog.product_id = v_item.product_id AND pog.is_active = true
            LOOP
                SELECT count(*) INTO v_group_selections_count
                FROM public.product_options po
                WHERE po.group_id = v_group.id AND po.id = ANY(v_item.selected_option_ids);

                IF v_group_selections_count < v_group.min_selections OR (v_group.max_selections IS NOT NULL AND v_group_selections_count > v_group.max_selections) THEN
                    RAISE EXCEPTION 'Invalid number of selections for group % (got %, min %, max %)', v_group.id, v_group_selections_count, v_group.min_selections, v_group.max_selections;
                END IF;
            END LOOP;
        END IF;

        v_item_line_total := v_item_unit_price * v_item.quantity;
        v_subtotal := v_subtotal + v_item_line_total;

        -- Insert Order Item
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
        ) VALUES (
            v_order_id,
            v_item.product_id,
            v_product.name,
            v_product.description,
            v_product.price,
            v_item_unit_price,
            v_item.quantity,
            v_item_line_total,
            (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', po.id, 'name', po.name, 'price_delta', po.price_delta)), '[]'::jsonb)
             FROM public.product_options po WHERE po.id = ANY(v_item.selected_option_ids))
        );
    END LOOP;

    -- 5. Finalize Order totals
    v_total := v_subtotal + v_merchant_delivery_fee;
    
    UPDATE public.orders 
    SET subtotal = v_subtotal,
        total = v_total
    WHERE id = v_order_id;

    -- 6. Insert initial status history
    INSERT INTO public.order_status_history (order_id, status)
    VALUES (v_order_id, 'confirmed');

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'is_duplicate', false
    );
END;
$$;

-- 3. Security
REVOKE ALL ON FUNCTION public.create_order_atomic(uuid, uuid, jsonb, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, uuid, jsonb, text, text, uuid, jsonb) TO service_role;
