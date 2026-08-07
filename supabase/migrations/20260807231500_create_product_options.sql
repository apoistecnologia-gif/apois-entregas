-- Migration: create_product_options
-- Created at: 2026-08-07 23:15:00 UTC

-- 1. Create product_option_groups table
CREATE TABLE public.product_option_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text NULL,
    min_selections integer NOT NULL DEFAULT 0,
    max_selections integer NOT NULL DEFAULT 1,
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_option_groups_min_selections_check CHECK (min_selections >= 0),
    CONSTRAINT product_option_groups_max_selections_check CHECK (max_selections >= 1),
    CONSTRAINT product_option_groups_selection_logic_check CHECK (max_selections >= min_selections)
);

-- 2. Create product_options table
CREATE TABLE public.product_options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    option_group_id uuid NOT NULL REFERENCES public.product_option_groups(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text NULL,
    price_delta numeric(10,2) NOT NULL DEFAULT 0,
    sort_order integer NOT NULL DEFAULT 0,
    is_available boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Indices
CREATE INDEX idx_product_option_groups_product_id ON public.product_option_groups(product_id);
CREATE INDEX idx_product_option_groups_is_active ON public.product_option_groups(is_active);
CREATE INDEX idx_product_options_option_group_id ON public.product_options(option_group_id);
CREATE INDEX idx_product_options_is_available ON public.product_options(is_available);

-- 4. Security
ALTER TABLE public.product_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;

-- Revoke all privileges from anon and authenticated first
REVOKE ALL ON TABLE public.product_option_groups FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_options FROM anon, authenticated;

-- Grant specific access
GRANT SELECT ON public.product_option_groups TO authenticated;
GRANT ALL ON public.product_option_groups TO service_role;

GRANT SELECT ON public.product_options TO authenticated;
GRANT ALL ON public.product_options TO service_role;

-- 5. Policies
-- Policies for product_option_groups
CREATE POLICY "authenticated_can_view_active_groups" ON public.product_option_groups
FOR SELECT
TO authenticated
USING (
    is_active = true
    AND EXISTS (
        SELECT 1 FROM public.products p
        JOIN public.merchants m ON p.merchant_id = m.id
        WHERE p.id = product_option_groups.product_id
        AND p.is_available = true
        AND m.is_active = true
    )
);

-- Policies for product_options
CREATE POLICY "authenticated_can_view_available_options" ON public.product_options
FOR SELECT
TO authenticated
USING (
    is_available = true
    AND EXISTS (
        SELECT 1 FROM public.product_option_groups pog
        JOIN public.products p ON pog.product_id = p.id
        JOIN public.merchants m ON p.merchant_id = m.id
        WHERE pog.id = product_options.option_group_id
        AND pog.is_active = true
        AND p.is_available = true
        AND m.is_active = true
    )
);
