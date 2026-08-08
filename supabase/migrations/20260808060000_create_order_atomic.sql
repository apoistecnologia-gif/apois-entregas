-- Adiciona request_key para idempotência
ALTER TABLE public.orders ADD COLUMN request_key uuid NOT NULL UNIQUE;

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
AS $$
DECLARE
    v_order_id uuid;
    v_order_number bigint;
    v_subtotal numeric := 0;
    v_delivery_fee numeric := 0;
    v_total numeric := 0;
    v_merchant_active boolean;
    v_merchant_open boolean;
    v_item_record jsonb;
    v_product_id uuid;
    v_quantity integer;
    v_product_base_price numeric;
    v_product_available boolean;
    v_product_merchant_id uuid;
    v_options jsonb;
    v_option_record jsonb;
    v_option_id uuid;
    v_option_price_delta numeric;
    v_option_available boolean;
    v_option_group_id uuid;
    v_option_group_active boolean;
    v_option_group_min integer;
    v_option_group_max integer;
    v_line_unit_price numeric;
    v_line_total numeric;
    v_group_selection_count integer;
    v_active_group_record record;
BEGIN
    -- Verificar se o pedido já existe por request_key (Idempotência)
    SELECT id, public.orders.order_number INTO v_order_id, v_order_number
    FROM public.orders
    WHERE request_key = p_request_key;

    IF FOUND THEN
        -- Verificar se pertence ao mesmo usuário
        IF (SELECT customer_user_id FROM public.orders WHERE id = v_order_id) != p_customer_user_id THEN
            RAISE EXCEPTION 'Request key already exists for another user';
        END IF;
        RETURN QUERY SELECT v_order_id, v_order_number;
        RETURN;
    END IF;

    -- Validar array de itens não vazio
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Items array cannot be empty';
    END IF;

    -- Validar merchant
    SELECT is_active, 
           (EXISTS (SELECT 1 FROM public.merchant_hours WHERE merchant_id = p_merchant_id AND is_open = true))
    INTO v_merchant_active, v_merchant_open
    FROM public.merchants
    WHERE id = p_merchant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Merchant not found'; END IF;
    IF NOT v_merchant_active THEN RAISE EXCEPTION 'Merchant is inactive'; END IF;
    IF NOT v_merchant_open THEN RAISE EXCEPTION 'Merchant is closed'; END IF;

    -- Criar o ID do pedido
    v_order_id := gen_random_uuid();

    -- Loop para validar itens e calcular subtotal
    FOR v_item_record IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_product_id := (v_item_record->>'productId')::uuid;
        v_quantity := (v_item_record->>'quantity')::integer;
        v_options := v_item_record->'options';

        IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;

        -- Validar produto
        SELECT base_price, is_available, merchant_id INTO v_product_base_price, v_product_available, v_product_merchant_id
        FROM public.products
        WHERE id = v_product_id;

        IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', v_product_id; END IF;
        IF NOT v_product_available THEN RAISE EXCEPTION 'Product % is unavailable', v_product_id; END IF;
        IF v_product_merchant_id != p_merchant_id THEN RAISE EXCEPTION 'Product % does not belong to merchant', v_product_id; END IF;

        v_line_unit_price := v_product_base_price;

        -- Validar min/max de TODOS os grupos ativos do produto
        FOR v_active_group_record IN 
            SELECT id, name, min_selections, max_selections 
            FROM public.product_option_groups 
            WHERE product_id = v_product_id AND is_active = true
        LOOP
            -- Contar seleções para este grupo
            v_group_selection_count := 0;
            IF v_options IS NOT NULL AND jsonb_array_length(v_options) > 0 THEN
                SELECT count(*) INTO v_group_selection_count
                FROM jsonb_array_elements(v_options) opt
                JOIN public.product_options po ON (opt->>'optionId')::uuid = po.id
                WHERE po.option_group_id = v_active_group_record.id;
            END IF;

            IF v_group_selection_count < v_active_group_record.min_selections THEN
                RAISE EXCEPTION 'Group % (%) requires at least % selections', v_active_group_record.name, v_active_group_record.id, v_active_group_record.min_selections;
            END IF;
            IF v_group_selection_count > v_active_group_record.max_selections THEN
                RAISE EXCEPTION 'Group % (%) allows at most % selections', v_active_group_record.name, v_active_group_record.id, v_active_group_record.max_selections;
            END IF;
        END LOOP;

        -- Validar opções selecionadas e somar deltas
        IF v_options IS NOT NULL AND jsonb_array_length(v_options) > 0 THEN
            FOR v_option_record IN SELECT * FROM jsonb_array_elements(v_options) LOOP
                v_option_id := (v_option_record->>'optionId')::uuid;
                
                SELECT price_delta, is_available, option_group_id INTO v_option_price_delta, v_option_available, v_option_group_id
                FROM public.product_options
                WHERE id = v_option_id;

                IF NOT FOUND THEN RAISE EXCEPTION 'Option % not found', v_option_id; END IF;
                IF NOT v_option_available THEN RAISE EXCEPTION 'Option % is unavailable', v_option_id; END IF;
                
                -- Validar se o grupo pertence ao produto e está ativo
                SELECT is_active INTO v_option_group_active
                FROM public.product_option_groups
                WHERE id = v_option_group_id AND product_id = v_product_id;
                
                IF NOT FOUND OR NOT v_option_group_active THEN 
                    RAISE EXCEPTION 'Option % belongs to an invalid or inactive group for product %', v_option_id, v_product_id; 
                END IF;

                v_line_unit_price := v_line_unit_price + v_option_price_delta;
            END LOOP;
        END IF;

        v_line_total := v_line_unit_price * v_quantity;
        v_subtotal := v_subtotal + v_line_total;
    END LOOP;

    -- Taxa de entrega (Recalcular pelo banco)
    SELECT COALESCE(delivery_fee, 0) INTO v_delivery_fee FROM public.merchants WHERE id = p_merchant_id;
    
    v_total := v_subtotal + v_delivery_fee;

    -- Criar o pedido
    INSERT INTO public.orders (
        id, customer_user_id, merchant_id, status, payment_method, 
        payment_status, subtotal, delivery_fee, total, 
        delivery_address, observation, request_key
    ) VALUES (
        v_order_id, p_customer_user_id, p_merchant_id, 'pending', p_payment_method,
        'pending', v_subtotal, v_delivery_fee, v_total,
        p_delivery_address, p_observation, p_request_key
    ) RETURNING public.orders.order_number INTO v_order_number;

    -- Criar os itens (com snapshot)
    INSERT INTO public.order_items (
        order_id, product_id, product_snapshot, quantity, unit_price, total, selected_options
    )
    SELECT 
        v_order_id,
        (item->>'productId')::uuid,
        (SELECT jsonb_build_object('name', name, 'description', description, 'image_url', image_url) FROM public.products WHERE id = (item->>'productId')::uuid),
        (item->>'quantity')::integer,
        (
            (SELECT base_price FROM public.products WHERE id = (item->>'productId')::uuid) +
            COALESCE((
                SELECT SUM(po.price_delta)
                FROM jsonb_array_elements(COALESCE(item->'options', '[]'::jsonb)) opt
                JOIN public.product_options po ON (opt->>'optionId')::uuid = po.id
            ), 0)
        ),
        (
            ((SELECT base_price FROM public.products WHERE id = (item->>'productId')::uuid) +
            COALESCE((
                SELECT SUM(po.price_delta)
                FROM jsonb_array_elements(COALESCE(item->'options', '[]'::jsonb)) opt
                JOIN public.product_options po ON (opt->>'optionId')::uuid = po.id
            ), 0)) * (item->>'quantity')::integer
        ),
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'groupId', pog.id,
                    'groupName', pog.name,
                    'optionId', po.id,
                    'optionName', po.name,
                    'priceDelta', po.price_delta
                )
            )
            FROM jsonb_array_elements(COALESCE(item->'options', '[]'::jsonb)) opt
            JOIN public.product_options po ON (opt->>'optionId')::uuid = po.id
            JOIN public.product_option_groups pog ON po.option_group_id = pog.id
        ), '[]'::jsonb)
    FROM jsonb_array_elements(p_items) item;

    -- Criar histórico inicial
    INSERT INTO public.order_status_history (
        order_id, status, changed_by_user_id
    ) VALUES (
        v_order_id, 'pending', p_customer_user_id
    );

    RETURN QUERY SELECT v_order_id, v_order_number;
END;
$$;

-- Restrições de privilégios
REVOKE ALL ON FUNCTION public.create_order_atomic(uuid, uuid, jsonb, text, jsonb, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_atomic(uuid, uuid, jsonb, text, jsonb, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_order_atomic(uuid, uuid, jsonb, text, jsonb, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, uuid, jsonb, text, jsonb, uuid, text) TO service_role;
