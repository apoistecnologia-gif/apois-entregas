-- 1. Merchant Categories
CREATE TABLE public.merchant_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    image_url text,
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Merchants
CREATE TABLE public.merchants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    category_id uuid NOT NULL REFERENCES public.merchant_categories(id),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text,
    logo_url text,
    cover_url text,
    tags text[] NOT NULL DEFAULT '{}',
    delivery_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    delivery_min_minutes integer CHECK (delivery_min_minutes >= 0),
    delivery_max_minutes integer CHECK (delivery_max_minutes >= 0),
    rating numeric(3,2) NOT NULL DEFAULT 0,
    review_count integer NOT NULL DEFAULT 0,
    is_open boolean NOT NULL DEFAULT false,
    closes_at time,
    is_active boolean NOT NULL DEFAULT true,
    address_line text,
    neighborhood text,
    city text,
    state text,
    latitude numeric(9,6),
    longitude numeric(9,6),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Menu Categories
CREATE TABLE public.menu_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    name text NOT NULL,
    slug text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, slug)
);

-- 4. Products
CREATE TABLE public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    menu_category_id uuid REFERENCES public.menu_categories(id) ON DELETE SET NULL,
    name text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL CHECK (price >= 0),
    image_url text,
    is_available boolean NOT NULL DEFAULT true,
    is_featured boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_merchants_category_id ON public.merchants(category_id);
CREATE INDEX idx_merchants_owner_user_id ON public.merchants(owner_user_id);
CREATE INDEX idx_merchants_is_active ON public.merchants(is_active);
CREATE INDEX idx_menu_categories_merchant_id ON public.menu_categories(merchant_id);
CREATE INDEX idx_products_merchant_id ON public.products(merchant_id);
CREATE INDEX idx_products_menu_category_id ON public.products(menu_category_id);
CREATE INDEX idx_products_is_available ON public.products(is_available);

-- RLS Enablement
ALTER TABLE public.merchant_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT ON public.merchant_categories TO authenticated;
GRANT SELECT ON public.merchants TO authenticated;
GRANT SELECT ON public.menu_categories TO authenticated;
GRANT SELECT ON public.products TO authenticated;

GRANT ALL ON public.merchant_categories TO service_role;
GRANT ALL ON public.merchants TO service_role;
GRANT ALL ON public.menu_categories TO service_role;
GRANT ALL ON public.products TO service_role;

-- Policies
CREATE POLICY "Allow authenticated to select active categories"
ON public.merchant_categories
FOR SELECT
TO authenticated
USING (is_active = true);

CREATE POLICY "Allow authenticated to select active merchants"
ON public.merchants
FOR SELECT
TO authenticated
USING (is_active = true);

CREATE POLICY "Allow authenticated to select active menu categories"
ON public.menu_categories
FOR SELECT
TO authenticated
USING (
    is_active = true AND 
    EXISTS (
        SELECT 1 FROM public.merchants 
        WHERE id = merchant_id AND is_active = true
    )
);

CREATE POLICY "Allow authenticated to select available products"
ON public.products
FOR SELECT
TO authenticated
USING (
    is_available = true AND 
    EXISTS (
        SELECT 1 FROM public.merchants 
        WHERE id = merchant_id AND is_active = true
    )
);