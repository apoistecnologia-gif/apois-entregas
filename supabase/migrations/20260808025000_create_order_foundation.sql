-- Migration: create_order_foundation
-- Created at: 2026-08-08 02:50:00

-- 1. Create public.orders
CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')),
    payment_method text NOT NULL CHECK (payment_method IN ('pix', 'credit', 'debit', 'cash', 'wallet')),
    payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
    subtotal numeric(10,2) NOT NULL CHECK (subtotal >= 0),
    delivery_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    discount numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    total numeric(10,2) NOT NULL CHECK (total >= 0),
    delivery_address jsonb NOT NULL,
    observation text,
    cancellation_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create public.order_items
CREATE TABLE public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
    product_name text NOT NULL,
    product_description text,
    base_price numeric(10,2) NOT NULL CHECK (base_price >= 0),
    unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
    quantity integer NOT NULL CHECK (quantity > 0),
    line_total numeric(10,2) NOT NULL CHECK (line_total >= 0),
    selected_options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(selected_options) = 'array'),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create public.order_status_history
CREATE TABLE public.order_status_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')),
    changed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Create updated_at trigger for orders
CREATE OR REPLACE FUNCTION public.handle_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_orders_updated
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_orders_updated_at();

-- 5. Create useful indices
CREATE INDEX idx_orders_customer_user_id ON public.orders(customer_user_id);
CREATE INDEX idx_orders_merchant_id ON public.orders(merchant_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX idx_order_status_history_order_id ON public.order_status_history(order_id);
CREATE INDEX idx_order_status_history_created_at ON public.order_status_history(created_at DESC);

-- 6. Grants
-- Endurecer privilégios antes dos GRANTs
REVOKE ALL PRIVILEGES ON TABLE public.orders FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.order_items FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.order_status_history FROM anon, authenticated;

GRANT SELECT ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;
GRANT SELECT ON TABLE public.order_items TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;
GRANT SELECT ON TABLE public.order_status_history TO authenticated;
GRANT ALL ON TABLE public.order_status_history TO service_role;

-- 7. RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

-- orders policies
CREATE POLICY "Customers can view their own orders"
    ON public.orders
    FOR SELECT
    TO authenticated
    USING (customer_user_id = auth.uid());

-- order_items policies
CREATE POLICY "Customers can view items of their own orders"
    ON public.order_items
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
            AND orders.customer_user_id = auth.uid()
        )
    );

-- order_status_history policies
CREATE POLICY "Customers can view history of their own orders"
    ON public.order_status_history
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_status_history.order_id
            AND orders.customer_user_id = auth.uid()
        )
    );
