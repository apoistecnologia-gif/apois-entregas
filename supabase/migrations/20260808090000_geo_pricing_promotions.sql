-- APOIS ENTREGAS — cities, delivery zones, pricing rules and promotions.

CREATE TABLE public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state text NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT false,
  center_latitude numeric(9,6) CHECK (center_latitude IS NULL OR center_latitude BETWEEN -90 AND 90),
  center_longitude numeric(9,6) CHECK (center_longitude IS NULL OR center_longitude BETWEEN -180 AND 180),
  default_delivery_radius_km numeric(8,2) NOT NULL DEFAULT 10 CHECK (default_delivery_radius_km > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cities_name_state_unique_idx ON public.cities(lower(name), state);

CREATE TABLE public.delivery_zones (
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
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (radius_km IS NOT NULL OR geojson IS NOT NULL)
);
CREATE INDEX delivery_zones_city_active_idx ON public.delivery_zones(city_id, is_active);

ALTER TABLE public.merchants
  ADD COLUMN city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL;
CREATE INDEX merchants_city_active_idx ON public.merchants(city_id, is_active);

CREATE TABLE public.fee_rules (
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
  CHECK (city_id IS NOT NULL OR merchant_id IS NOT NULL),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX fee_rules_lookup_idx ON public.fee_rules(city_id, merchant_id, is_active);

CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.promotions (
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
  CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CHECK (product_id IS NULL OR menu_category_id IS NULL)
);
CREATE INDEX promotions_merchant_active_idx ON public.promotions(merchant_id, is_active, starts_at, ends_at);

CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (btrim(code) <> ''),
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
  CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE UNIQUE INDEX coupons_scope_code_unique_idx
  ON public.coupons(COALESCE(merchant_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(code));

CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discount_amount numeric(10,2) NOT NULL CHECK (discount_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coupon_redemptions_user_coupon_idx ON public.coupon_redemptions(user_id, coupon_id);

-- updated_at
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cities','delivery_zones','fee_rules','platform_settings','promotions','coupons']
  LOOP
    EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

-- RLS
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active cities" ON public.cities FOR SELECT TO anon, authenticated
USING (is_active = true);
CREATE POLICY "Admins manage cities" ON public.cities FOR ALL TO authenticated
USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Public can view active delivery zones" ON public.delivery_zones FOR SELECT TO anon, authenticated
USING (is_active = true AND EXISTS (
  SELECT 1 FROM public.cities c WHERE c.id = delivery_zones.city_id AND c.is_active = true
));
CREATE POLICY "Admins manage delivery zones" ON public.delivery_zones FOR ALL TO authenticated
USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Admins view fee rules" ON public.fee_rules FOR SELECT TO authenticated
USING (public.current_user_is_admin());
CREATE POLICY "Merchant managers view applicable fee rules" ON public.fee_rules FOR SELECT TO authenticated
USING (merchant_id IS NOT NULL AND public.current_user_is_merchant_manager(merchant_id));
CREATE POLICY "Admins manage fee rules" ON public.fee_rules FOR ALL TO authenticated
USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Admins manage platform settings" ON public.platform_settings FOR ALL TO authenticated
USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Public views active promotions" ON public.promotions FOR SELECT TO anon, authenticated
USING (is_active = true AND now() BETWEEN starts_at AND ends_at);
CREATE POLICY "Merchant managers manage promotions" ON public.promotions FOR ALL TO authenticated
USING (public.current_user_is_merchant_manager(merchant_id) OR public.current_user_is_admin())
WITH CHECK (public.current_user_is_merchant_manager(merchant_id) OR public.current_user_is_admin());

CREATE POLICY "Authenticated users view usable coupons" ON public.coupons FOR SELECT TO authenticated
USING (is_active = true AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()));
CREATE POLICY "Merchant managers manage coupons" ON public.coupons FOR ALL TO authenticated
USING ((merchant_id IS NOT NULL AND public.current_user_is_merchant_manager(merchant_id)) OR public.current_user_is_admin())
WITH CHECK ((merchant_id IS NOT NULL AND public.current_user_is_merchant_manager(merchant_id)) OR public.current_user_is_admin());

CREATE POLICY "Customers view own coupon redemptions" ON public.coupon_redemptions FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR public.current_user_is_admin());

-- Privileges: policies remain authoritative but broad write grants are avoided.
REVOKE ALL ON public.cities, public.delivery_zones, public.fee_rules, public.platform_settings,
  public.promotions, public.coupons, public.coupon_redemptions FROM anon, authenticated;
GRANT SELECT ON public.cities, public.delivery_zones, public.promotions TO anon, authenticated;
GRANT SELECT ON public.fee_rules, public.platform_settings, public.coupons, public.coupon_redemptions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cities, public.delivery_zones, public.fee_rules, public.platform_settings,
  public.promotions, public.coupons TO authenticated;
GRANT ALL ON public.cities, public.delivery_zones, public.fee_rules, public.platform_settings,
  public.promotions, public.coupons, public.coupon_redemptions TO service_role;
