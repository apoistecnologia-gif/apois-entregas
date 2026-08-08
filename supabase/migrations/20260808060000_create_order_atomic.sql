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
    v_item_record jsonb;
    v_product_id uuid;
    v_quantity integer;
    v_product_name text;
    v_product_description text;
    v_product_price numeric;
    v_product_available boolean;
    v_product_merchant_id uuid;
    v_options jsonb;
    v_option_record jsonb;
    v_option_id uuid;
    v_option_price_delta numeric;
    v_option_available boolean;
    v_option_name text;
    v_option_group_id uuid;
    v_option_group_name text;
    v_option_group_active boolean;
    v_option_group_min integer;
    v_option_group_max integer;
    v_line_unit_price numeric;
    v_line_total numeric;
    v_group_selection_count integer;
    v_active_group_record record;
    v_snapshot_selected_options jsonb;
    v_seen_option_ids uuid[];
BEGIN
    -- Verificar se o pedido já existe por request_key (Idempotência)
    SELECT id, public.orders.order_number INTO v_order_id, v_order_number
    FROM public.orders
    WHERE request_key = p_request_key;

    IF FOUND THEN
        -- Se houver conflito, busque o pedido existente e só retorne se customer_user_id for o mesmo
        IF (SELECT customer_user_id FROM public.orders WHERE id = v_order_id) IS DISTINCT FROM p_customer_user_id THEN
            RAISE EXCEPTION 'Request key already exists for another user';
        END IF;
        RETURN QUERY SELECT v_order_id, v_order_number;
        RETURN;
    END IF;

    -- Validar p_items como array JSON não vazio
    IF p_items IS NULL OR jsonb_typeof(p_items) != 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Items array must be a non-empty array';
    END IF;

    -- Validar merchant (usar merchants.is_active, merchants.is_open e merchants.delivery_fee diretamente)
    SELECT is_active, is_open, COALESCE(delivery_fee, 0)
    INTO v_merchant_active, v_merchant_open, v_delivery_fee
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
        v_options := v_item_record->'options'; -- Deve ser array

        -- Validar quantidade > 0
        IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
        
        -- Valide options como array
        IF v_options IS NOT NULL AND jsonb_typeof(v_options) != 'array' THEN
            RAISE EXCEPTION 'Options must be an array';
        END IF;

        -- Validar produto disponível e pertencente ao merchant (o preço real é products.price)
        SELECT name, description, price, is_available, merchant_id 
        INTO v_product_name, v_product_description, v_product_price, v_product_available, v_product_merchant_id
        FROM public.products
        WHERE id = v_product_id;

        IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', v_product_id; END IF;
        IF NOT v_product_available THEN RAISE EXCEPTION 'Product % is unavailable', v_product_id; END IF;
        IF v_product_merchant_id != p_merchant_id THEN RAISE EXCEPTION 'Product % does not belong to merchant', v_product_id; END IF;

        v_line_unit_price := v_product_price;
        v_snapshot_selected_options := '[]'::jsonb;
        v_seen_option_ids := ARRAY[]::uuid[];

        -- Validar opções selecionadas (se houver) e construir o snapshot
        IF v_options IS NOT NULL AND jsonb_array_length(v_options) > 0 THEN
            FOR v_option_record IN SELECT * FROM jsonb_array_elements(v_options) LOOP
                v_option_id := (v_option_record->>'optionId')::uuid;
                
                -- Rejeite optionId duplicado dentro do mesmo item
                IF v_option_id = ANY(v_seen_option_ids) THEN
                    RAISE EXCEPTION 'Duplicate option % in product %', v_option_id, v_product_id;
                END IF;
                v_seen_option_ids := array_append(v_seen_option_ids, v_option_id);

                -- Valide cada opção disponível e pertencente a grupo ativo daquele produto
                -- Usar price_delta exclusivamente do banco
                SELECT po.name, po.price_delta, po.is_available, pog.id, pog.name, pog.is_active
                INTO v_option_name, v_option_price_delta, v_option_available, v_option_group_id, v_option_group_name, v_option_group_active
                FROM public.product_options po
                JOIN public.product_option_groups pog ON po.option_group_id = pog.id
                WHERE po.id = v_option_id AND pog.product_id = v_product_id;

                IF NOT FOUND THEN RAISE EXCEPTION 'Option % not found or does not belong to product %', v_option_id, v_product_id; END IF;
                IF NOT v_option_available THEN RAISE EXCEPTION 'Option % is unavailable', v_option_id; END IF;
                IF NOT v_option_group_active THEN RAISE EXCEPTION 'Option % belongs to an inactive group', v_option_id; END IF;

                v_line_unit_price := v_line_unit_price + v_option_price_delta;
                
                -- Preservar groupId, groupName, optionId, optionName e priceDelta
                v_snapshot_selected_options := v_snapshot_selected_options || jsonb_build_object(
                    'groupId', v_option_group_id,
                    'groupName', v_option_group_name,
                    'optionId', v_option_id,
                    'optionName', v_option_name,
                    'priceDelta', v_option_price_delta
                );
            END LOOP;
        END IF;

        -- Validar min/max de TODOS os grupos ativos do produto (inclusive com zero seleções)
        FOR v_active_group_record IN 
            SELECT id, name, min_selections, max_selections 
            FROM public.product_option_groups 
            WHERE product_id = v_product_id AND is_active = true
        LOOP
            -- Contar seleções para este grupo no snapshot que acabamos de construir
            SELECT count(*) INTO v_group_selection_count
            FROM jsonb_array_elements(v_snapshot_selected_options) s
            WHERE (s->>'groupId')::uuid = v_active_group_record.id;

            IF v_group_selection_count < v_active_group_record.min_selections THEN
                RAISE EXCEPTION 'Group % (%) requires at least % selections', v_active_group_record.name, v_active_group_record.id, v_active_group_record.min_selections;
            END IF;
            IF v_group_selection_count > v_active_group_record.max_selections THEN
                RAISE EXCEPTION 'Group % (%) allows at most % selections', v_active_group_record.name, v_active_group_record.id, v_active_group_record.min_selections;
            END IF;
        END LOOP;

        v_line_total := v_line_unit_price * v_quantity;
        
        -- Inserir o item no banco (NÃO existem product_snapshot nem total em order_items)
        INSERT INTO public.order_items (
            order_id, product_id, product_name, product_description, 
            base_price, unit_price, quantity, line_total, selected_options
        ) VALUES (
            v_order_id, v_product_id, v_product_name, v_product_description,
            v_product_price, v_line_unit_price, v_quantity, v_line_total, v_snapshot_selected_options
        );

        v_subtotal := v_subtotal + v_line_total;
    END LOOP;

    v_total := v_subtotal + v_delivery_fee;

    -- Criar o pedido (status inicial 'confirmed', payment_status 'pending')
    -- A request_key é validada pela constraint UNIQUE.
    INSERT INTO public.orders (
        id, customer_user_id, merchant_id, status, payment_method, 
        payment_status, subtotal, delivery_fee, total, 
        delivery_address, observation, request_key
    ) VALUES (
        v_order_id, p_customer_user_id, p_merchant_id, 'confirmed', p_payment_method,
        'pending', v_subtotal, v_delivery_fee, v_total,
        p_delivery_address, p_observation, p_request_key
    ) RETURNING public.orders.order_number INTO v_order_number;

    -- Criar histórico inicial (status inicial 'confirmed', changed_by_user_id deve ser p_customer_user_id)
    INSERT INTO public.order_status_history (
        order_id, status, changed_by_user_id
    ) VALUES (
        v_order_id, 'confirmed', p_customer_user_id
    );

    RETURN QUERY SELECT v_order_id, v_order_number;
EXCEPTION WHEN OTHERS THEN
    -- Toda a criação deve ser revertida pela mesma transação
    RAISE;
END;
$$;

-- Restrições de privilégios
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, uuid, jsonb, text, jsonb, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, uuid, jsonb, text, jsonb, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, uuid, jsonb, text, jsonb, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, uuid, jsonb, text, jsonb, uuid, text) TO service_role;
