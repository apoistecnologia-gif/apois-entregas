-- APOIS ENTREGAS — partner identity and authorization foundation.
-- Additive migration: preserves existing customer/catalog data.

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- -----------------------------------------------------------------------------
-- Merchant operational identity
-- -----------------------------------------------------------------------------
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS document text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS minimum_order numeric(10,2) NOT NULL DEFAULT 0 CHECK (minimum_order >= 0),
  ADD COLUMN IF NOT EXISTS pickup_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending','under_review','approved','rejected','blocked')),
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS temporarily_closed boolean NOT NULL DEFAULT false;

-- Existing active merchants predate the approval workflow and remain operational.
UPDATE public.merchants
SET approval_status = 'approved'
WHERE is_active = true
  AND approval_status = 'pending';

ALTER TABLE public.merchants ALTER COLUMN is_active SET DEFAULT false;

CREATE TABLE IF NOT EXISTS public.merchant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','manager','staff')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, user_id)
);

CREATE INDEX IF NOT EXISTS merchant_members_user_id_idx
  ON public.merchant_members(user_id);
CREATE INDEX IF NOT EXISTS merchant_members_merchant_status_idx
  ON public.merchant_members(merchant_id, status);

CREATE TABLE IF NOT EXISTS public.merchant_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, document_type)
);

-- -----------------------------------------------------------------------------
-- Couriers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.couriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  cpf text UNIQUE,
  birth_date date,
  address jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(address) = 'object'),
  vehicle_type text,
  vehicle_model text,
  vehicle_plate text,
  cnh_number text,
  pix_key text,
  photo_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','under_review','approved','rejected','blocked')),
  is_active boolean NOT NULL DEFAULT true,
  rejection_reason text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS couriers_status_idx ON public.couriers(status, is_active);

CREATE TABLE IF NOT EXISTS public.courier_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (courier_id, document_type)
);

CREATE INDEX IF NOT EXISTS courier_documents_courier_status_idx
  ON public.courier_documents(courier_id, status);

CREATE TABLE IF NOT EXISTS public.courier_availability (
  courier_id uuid PRIMARY KEY REFERENCES public.couriers(id) ON DELETE CASCADE,
  is_online boolean NOT NULL DEFAULT false,
  online_since timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS courier_availability_online_idx
  ON public.courier_availability(is_online, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.courier_locations (
  courier_id uuid PRIMARY KEY REFERENCES public.couriers(id) ON DELETE CASCADE,
  latitude numeric(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters numeric(8,2) CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
  heading numeric(6,2) CHECK (heading IS NULL OR (heading >= 0 AND heading < 360)),
  speed_mps numeric(8,2) CHECK (speed_mps IS NULL OR speed_mps >= 0),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS courier_locations_recorded_at_idx
  ON public.courier_locations(recorded_at DESC);

-- -----------------------------------------------------------------------------
-- Administrative audit
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_entity_idx
  ON public.admin_audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_idx
  ON public.admin_audit_logs(admin_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Shared updated_at trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS merchant_members_set_updated_at ON public.merchant_members;
CREATE TRIGGER merchant_members_set_updated_at
BEFORE UPDATE ON public.merchant_members
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS merchant_documents_set_updated_at ON public.merchant_documents;
CREATE TRIGGER merchant_documents_set_updated_at
BEFORE UPDATE ON public.merchant_documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS couriers_set_updated_at ON public.couriers;
CREATE TRIGGER couriers_set_updated_at
BEFORE UPDATE ON public.couriers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS courier_documents_set_updated_at ON public.courier_documents;
CREATE TRIGGER courier_documents_set_updated_at
BEFORE UPDATE ON public.courier_documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS courier_availability_set_updated_at ON public.courier_availability;
CREATE TRIGGER courier_availability_set_updated_at
BEFORE UPDATE ON public.courier_availability
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS courier_locations_set_updated_at ON public.courier_locations;
CREATE TRIGGER courier_locations_set_updated_at
BEFORE UPDATE ON public.courier_locations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Authorization helpers. SECURITY DEFINER is intentional: these helpers bypass
-- table RLS only to answer authorization questions and expose no row data.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = 'admin'::public.app_role
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_merchant_member(_merchant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.merchant_members mm
    WHERE mm.user_id = (SELECT auth.uid())
      AND mm.merchant_id = _merchant_id
      AND mm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_merchant_manager(_merchant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.merchant_members mm
    WHERE mm.user_id = (SELECT auth.uid())
      AND mm.merchant_id = _merchant_id
      AND mm.status = 'active'
      AND mm.role IN ('owner','manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_courier_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id
  FROM public.couriers c
  WHERE c.user_id = (SELECT auth.uid())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_is_merchant_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_is_merchant_manager(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_courier_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_merchant_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_is_merchant_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_courier_id() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Courier self-service RPCs: approval/online requirements enforced server-side.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_courier_online(_is_online boolean)
RETURNS public.courier_availability
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier public.couriers;
  v_result public.courier_availability;
BEGIN
  SELECT * INTO v_courier
  FROM public.couriers c
  WHERE c.user_id = (SELECT auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'courier profile not found';
  END IF;

  IF _is_online AND (v_courier.status <> 'approved' OR NOT v_courier.is_active) THEN
    RAISE EXCEPTION 'courier is not allowed to go online';
  END IF;

  INSERT INTO public.courier_availability (courier_id, is_online, online_since, last_seen_at)
  VALUES (
    v_courier.id,
    _is_online,
    CASE WHEN _is_online THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (courier_id) DO UPDATE
  SET is_online = EXCLUDED.is_online,
      online_since = CASE
        WHEN EXCLUDED.is_online AND NOT public.courier_availability.is_online THEN now()
        WHEN EXCLUDED.is_online THEN public.courier_availability.online_since
        ELSE NULL
      END,
      last_seen_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_courier_location(
  _latitude numeric,
  _longitude numeric,
  _accuracy_meters numeric DEFAULT NULL,
  _heading numeric DEFAULT NULL,
  _speed_mps numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_courier_id uuid;
BEGIN
  SELECT c.id INTO v_courier_id
  FROM public.couriers c
  JOIN public.courier_availability a ON a.courier_id = c.id
  WHERE c.user_id = (SELECT auth.uid())
    AND c.status = 'approved'
    AND c.is_active = true
    AND a.is_online = true;

  IF v_courier_id IS NULL THEN
    RAISE EXCEPTION 'courier must be approved and online';
  END IF;

  IF _latitude NOT BETWEEN -90 AND 90 OR _longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'invalid coordinates';
  END IF;

  INSERT INTO public.courier_locations (
    courier_id, latitude, longitude, accuracy_meters, heading, speed_mps, recorded_at
  ) VALUES (
    v_courier_id, _latitude, _longitude, _accuracy_meters, _heading, _speed_mps, now()
  )
  ON CONFLICT (courier_id) DO UPDATE
  SET latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      accuracy_meters = EXCLUDED.accuracy_meters,
      heading = EXCLUDED.heading,
      speed_mps = EXCLUDED.speed_mps,
      recorded_at = now();

  UPDATE public.courier_availability
  SET last_seen_at = now()
  WHERE courier_id = v_courier_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_courier_online(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_courier_location(numeric,numeric,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_courier_online(boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_courier_location(numeric,numeric,numeric,numeric,numeric) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Admin review RPCs with audit logging.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_courier(
  _courier_id uuid,
  _status text,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_user_id uuid;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'admin access required';
  END IF;

  IF _status NOT IN ('under_review','approved','rejected','blocked') THEN
    RAISE EXCEPTION 'invalid courier review status';
  END IF;

  SELECT to_jsonb(c), c.user_id INTO v_before, v_user_id
  FROM public.couriers c WHERE c.id = _courier_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'courier not found'; END IF;

  UPDATE public.couriers
  SET status = _status,
      rejection_reason = CASE WHEN _status IN ('rejected','blocked') THEN NULLIF(btrim(_reason), '') ELSE NULL END,
      approved_at = CASE WHEN _status = 'approved' THEN now() ELSE approved_at END,
      approved_by = CASE WHEN _status = 'approved' THEN (SELECT auth.uid()) ELSE approved_by END,
      is_active = CASE WHEN _status = 'blocked' THEN false ELSE is_active END
  WHERE id = _courier_id
  RETURNING to_jsonb(public.couriers) INTO v_after;

  IF _status = 'approved' THEN
    INSERT INTO public.user_roles(user_id, role)
    VALUES (v_user_id, 'driver'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  IF _status = 'blocked' THEN
    UPDATE public.courier_availability
    SET is_online = false, online_since = NULL
    WHERE courier_id = _courier_id;
  END IF;

  INSERT INTO public.admin_audit_logs(admin_id, action, entity_type, entity_id, before_data, after_data)
  VALUES ((SELECT auth.uid()), 'review_courier', 'courier', _courier_id::text, v_before, v_after);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_merchant(
  _merchant_id uuid,
  _status text,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'admin access required';
  END IF;

  IF _status NOT IN ('under_review','approved','rejected','blocked') THEN
    RAISE EXCEPTION 'invalid merchant review status';
  END IF;

  SELECT to_jsonb(m) INTO v_before FROM public.merchants m WHERE m.id = _merchant_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'merchant not found'; END IF;

  UPDATE public.merchants
  SET approval_status = _status,
      rejection_reason = CASE WHEN _status IN ('rejected','blocked') THEN NULLIF(btrim(_reason), '') ELSE NULL END,
      approved_at = CASE WHEN _status = 'approved' THEN now() ELSE approved_at END,
      approved_by = CASE WHEN _status = 'approved' THEN (SELECT auth.uid()) ELSE approved_by END,
      is_active = CASE WHEN _status = 'approved' THEN true WHEN _status IN ('rejected','blocked') THEN false ELSE is_active END
  WHERE id = _merchant_id
  RETURNING to_jsonb(public.merchants) INTO v_after;

  INSERT INTO public.admin_audit_logs(admin_id, action, entity_type, entity_id, before_data, after_data)
  VALUES ((SELECT auth.uid()), 'review_merchant', 'merchant', _merchant_id::text, v_before, v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_courier(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_merchant(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_courier(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_merchant(uuid,text,text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.merchant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: preserve own access and add explicit admin visibility.
DROP POLICY IF EXISTS "Admins can view profiles" ON public.profiles;
CREATE POLICY "Admins can view profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.current_user_is_admin());

DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (public.current_user_is_admin())
WITH CHECK (public.current_user_is_admin());

-- Merchants: members can read their own merchant even if pending/blocked and can
-- update operational data only while their membership is active.
DROP POLICY IF EXISTS "Merchant members can view own merchant" ON public.merchants;
CREATE POLICY "Merchant members can view own merchant"
ON public.merchants FOR SELECT TO authenticated
USING (public.current_user_is_merchant_member(id) OR public.current_user_is_admin());

DROP POLICY IF EXISTS "Merchant managers can update own merchant" ON public.merchants;
CREATE POLICY "Merchant managers can update own merchant"
ON public.merchants FOR UPDATE TO authenticated
USING (public.current_user_is_merchant_manager(id))
WITH CHECK (public.current_user_is_merchant_manager(id));

DROP POLICY IF EXISTS "Admins can manage merchants" ON public.merchants;
CREATE POLICY "Admins can manage merchants"
ON public.merchants FOR ALL TO authenticated
USING (public.current_user_is_admin())
WITH CHECK (public.current_user_is_admin());

-- Memberships.
CREATE POLICY "Members can view own memberships"
ON public.merchant_members FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR public.current_user_is_merchant_manager(merchant_id) OR public.current_user_is_admin());

CREATE POLICY "Merchant managers can manage memberships"
ON public.merchant_members FOR ALL TO authenticated
USING (public.current_user_is_merchant_manager(merchant_id) OR public.current_user_is_admin())
WITH CHECK (public.current_user_is_merchant_manager(merchant_id) OR public.current_user_is_admin());

-- Merchant documents.
CREATE POLICY "Merchant members can view documents"
ON public.merchant_documents FOR SELECT TO authenticated
USING (public.current_user_is_merchant_member(merchant_id) OR public.current_user_is_admin());

CREATE POLICY "Merchant managers can add documents"
ON public.merchant_documents FOR INSERT TO authenticated
WITH CHECK (public.current_user_is_merchant_manager(merchant_id));

CREATE POLICY "Merchant managers can replace pending documents"
ON public.merchant_documents FOR UPDATE TO authenticated
USING (public.current_user_is_merchant_manager(merchant_id) AND status = 'pending')
WITH CHECK (public.current_user_is_merchant_manager(merchant_id) AND status = 'pending');

CREATE POLICY "Admins can manage merchant documents"
ON public.merchant_documents FOR ALL TO authenticated
USING (public.current_user_is_admin())
WITH CHECK (public.current_user_is_admin());

-- Courier profile.
CREATE POLICY "Couriers can view own profile"
ON public.couriers FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR public.current_user_is_admin());

CREATE POLICY "Users can create own courier application"
ON public.couriers FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'pending');

CREATE POLICY "Couriers can update pending application"
ON public.couriers FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()) AND status IN ('pending','rejected'))
WITH CHECK (user_id = (SELECT auth.uid()) AND status IN ('pending','rejected'));

CREATE POLICY "Admins can manage couriers"
ON public.couriers FOR ALL TO authenticated
USING (public.current_user_is_admin())
WITH CHECK (public.current_user_is_admin());

-- Courier documents.
CREATE POLICY "Couriers can view own documents"
ON public.courier_documents FOR SELECT TO authenticated
USING (courier_id = public.current_user_courier_id() OR public.current_user_is_admin());

CREATE POLICY "Couriers can add own documents"
ON public.courier_documents FOR INSERT TO authenticated
WITH CHECK (courier_id = public.current_user_courier_id());

CREATE POLICY "Couriers can replace pending documents"
ON public.courier_documents FOR UPDATE TO authenticated
USING (courier_id = public.current_user_courier_id() AND status = 'pending')
WITH CHECK (courier_id = public.current_user_courier_id() AND status = 'pending');

CREATE POLICY "Admins can manage courier documents"
ON public.courier_documents FOR ALL TO authenticated
USING (public.current_user_is_admin())
WITH CHECK (public.current_user_is_admin());

-- Availability and location are private to courier/admin. Writes use RPCs.
CREATE POLICY "Couriers can view own availability"
ON public.courier_availability FOR SELECT TO authenticated
USING (courier_id = public.current_user_courier_id() OR public.current_user_is_admin());

CREATE POLICY "Couriers can view own location"
ON public.courier_locations FOR SELECT TO authenticated
USING (courier_id = public.current_user_courier_id() OR public.current_user_is_admin());

-- Administrative audit is visible only to admins; inserts are performed by
-- privileged RPCs/service_role.
CREATE POLICY "Admins can read audit logs"
ON public.admin_audit_logs FOR SELECT TO authenticated
USING (public.current_user_is_admin());

-- service_role remains the trusted backend principal.
GRANT ALL ON public.merchant_members, public.merchant_documents, public.couriers,
  public.courier_documents, public.courier_availability, public.courier_locations,
  public.admin_audit_logs TO service_role;
