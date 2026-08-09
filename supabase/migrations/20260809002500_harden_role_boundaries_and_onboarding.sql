-- Prevent users from mutating administrative/security fields through broad table UPDATE grants.
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone, avatar_url, birth_date) ON TABLE public.profiles TO authenticated;

REVOKE UPDATE ON TABLE public.merchants FROM authenticated;
GRANT UPDATE (
  category_id, name, slug, description, logo_url, cover_url, tags,
  delivery_fee, delivery_min_minutes, delivery_max_minutes,
  address_line, neighborhood, city, state, latitude, longitude,
  legal_name, document, contact_phone, contact_email, minimum_order,
  pickup_enabled, delivery_enabled, temporarily_closed, city_id
) ON TABLE public.merchants TO authenticated;

REVOKE UPDATE ON TABLE public.couriers FROM authenticated;
GRANT UPDATE (
  cpf, birth_date, address, vehicle_type, vehicle_model, vehicle_plate,
  cnh_number, pix_key, photo_url
) ON TABLE public.couriers TO authenticated;

DROP POLICY IF EXISTS "Couriers update own non approval row" ON public.couriers;
DROP POLICY IF EXISTS "Couriers can update pending application" ON public.couriers;
DROP POLICY IF EXISTS "Users create own courier application" ON public.couriers;
DROP POLICY IF EXISTS "Users can create own courier application" ON public.couriers;

CREATE POLICY "Users create secure courier application"
ON public.couriers FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND status = 'pending'
  AND is_active = true
  AND approved_by IS NULL
  AND approved_at IS NULL
  AND rejection_reason IS NULL
);

CREATE POLICY "Couriers update own editable profile"
ON public.couriers FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()) AND status IN ('pending','under_review','rejected','approved'))
WITH CHECK (user_id = (SELECT auth.uid()) AND status IN ('pending','under_review','rejected','approved'));

REVOKE INSERT, UPDATE ON TABLE public.courier_documents FROM authenticated;
GRANT INSERT (courier_id, document_type, storage_path, status) ON TABLE public.courier_documents TO authenticated;
GRANT UPDATE (document_type, storage_path, status) ON TABLE public.courier_documents TO authenticated;

DROP POLICY IF EXISTS "Couriers create own document rows" ON public.courier_documents;
DROP POLICY IF EXISTS "Couriers can add own documents" ON public.courier_documents;
DROP POLICY IF EXISTS "Couriers can replace pending documents" ON public.courier_documents;
DROP POLICY IF EXISTS "Couriers update own pending documents" ON public.courier_documents;

CREATE POLICY "Couriers insert own pending documents"
ON public.courier_documents FOR INSERT TO authenticated
WITH CHECK (
  courier_id = public.current_user_courier_id()
  AND status = 'pending'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND rejection_reason IS NULL
);

CREATE POLICY "Couriers replace own reviewable documents"
ON public.courier_documents FOR UPDATE TO authenticated
USING (courier_id = public.current_user_courier_id() AND status IN ('pending','rejected'))
WITH CHECK (courier_id = public.current_user_courier_id() AND status = 'pending');

REVOKE INSERT, UPDATE ON TABLE public.merchant_documents FROM authenticated;
GRANT INSERT (merchant_id, document_type, storage_path, status) ON TABLE public.merchant_documents TO authenticated;
GRANT UPDATE (document_type, storage_path, status) ON TABLE public.merchant_documents TO authenticated;

DROP POLICY IF EXISTS "Merchant managers can add documents" ON public.merchant_documents;
DROP POLICY IF EXISTS "Merchant managers can replace pending documents" ON public.merchant_documents;

CREATE POLICY "Merchant managers insert pending documents"
ON public.merchant_documents FOR INSERT TO authenticated
WITH CHECK (
  public.current_user_is_merchant_manager(merchant_id)
  AND status = 'pending'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND rejection_reason IS NULL
);

CREATE POLICY "Merchant managers replace reviewable documents"
ON public.merchant_documents FOR UPDATE TO authenticated
USING (public.current_user_is_merchant_manager(merchant_id) AND status IN ('pending','rejected'))
WITH CHECK (public.current_user_is_merchant_manager(merchant_id) AND status = 'pending');

REVOKE INSERT, UPDATE, DELETE ON TABLE public.merchant_members FROM authenticated;
DROP POLICY IF EXISTS "Merchant managers can manage memberships" ON public.merchant_members;

CREATE OR REPLACE FUNCTION public.current_user_is_merchant_owner(_merchant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.merchants m
    LEFT JOIN public.merchant_members mm
      ON mm.merchant_id = m.id
     AND mm.user_id = (SELECT auth.uid())
     AND mm.status = 'active'
     AND mm.role = 'owner'
    WHERE m.id = _merchant_id
      AND (m.owner_user_id = (SELECT auth.uid()) OR mm.id IS NOT NULL)
  );
$$;

CREATE OR REPLACE FUNCTION public.manage_merchant_member(
  _merchant_id uuid,
  _user_id uuid,
  _role text,
  _status text DEFAULT 'active'
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
  IF NOT (public.current_user_is_admin() OR public.current_user_is_merchant_owner(_merchant_id)) THEN
    RAISE EXCEPTION 'merchant owner access required';
  END IF;
  IF _role NOT IN ('owner','manager','staff') THEN RAISE EXCEPTION 'invalid member role'; END IF;
  IF _status NOT IN ('active','inactive') THEN RAISE EXCEPTION 'invalid member status'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id) THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = _merchant_id) THEN RAISE EXCEPTION 'merchant not found'; END IF;

  SELECT to_jsonb(mm) INTO v_before
  FROM public.merchant_members mm
  WHERE mm.merchant_id = _merchant_id AND mm.user_id = _user_id;

  INSERT INTO public.merchant_members(merchant_id,user_id,role,status)
  VALUES(_merchant_id,_user_id,_role,_status)
  ON CONFLICT(merchant_id,user_id) DO UPDATE
  SET role=EXCLUDED.role,status=EXCLUDED.status,updated_at=now();

  SELECT to_jsonb(mm) INTO v_after
  FROM public.merchant_members mm
  WHERE mm.merchant_id = _merchant_id AND mm.user_id = _user_id;

  IF public.current_user_is_admin() THEN
    INSERT INTO public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
    VALUES((SELECT auth.uid()),'manage_merchant_member','merchant_member',_merchant_id::text||':'||_user_id::text,v_before,v_after);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_merchant_application(
  _category_id uuid,
  _name text,
  _legal_name text,
  _document text,
  _contact_phone text,
  _contact_email text,
  _address_line text,
  _neighborhood text,
  _city text,
  _state text,
  _latitude numeric DEFAULT NULL,
  _longitude numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_id uuid;
  v_slug text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=v_user_id AND p.is_active=true) THEN
    RAISE EXCEPTION 'active profile required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.merchant_members mm
    JOIN public.merchants m ON m.id=mm.merchant_id
    WHERE mm.user_id=v_user_id AND mm.role='owner' AND mm.status='active'
      AND m.approval_status NOT IN ('rejected','blocked')
  ) THEN
    RAISE EXCEPTION 'active merchant application already exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.merchant_categories c WHERE c.id=_category_id AND c.is_active=true) THEN
    RAISE EXCEPTION 'invalid merchant category';
  END IF;
  IF NULLIF(btrim(_name),'') IS NULL THEN RAISE EXCEPTION 'merchant name is required'; END IF;
  IF NULLIF(regexp_replace(COALESCE(_document,''),'\D','','g'),'') IS NULL THEN RAISE EXCEPTION 'merchant document is required'; END IF;

  v_slug := trim(both '-' from regexp_replace(lower(unaccent(btrim(_name))), '[^a-z0-9]+', '-', 'g'));
  IF v_slug = '' THEN v_slug := 'estabelecimento'; END IF;
  v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

  INSERT INTO public.merchants(
    owner_user_id,category_id,name,slug,legal_name,document,contact_phone,contact_email,
    address_line,neighborhood,city,state,latitude,longitude,approval_status,is_active,temporarily_closed
  ) VALUES (
    v_user_id,_category_id,btrim(_name),v_slug,NULLIF(btrim(_legal_name),''),regexp_replace(COALESCE(_document,''),'\D','','g'),
    NULLIF(btrim(_contact_phone),''),NULLIF(btrim(_contact_email),''),NULLIF(btrim(_address_line),''),
    NULLIF(btrim(_neighborhood),''),NULLIF(btrim(_city),''),upper(NULLIF(btrim(_state),'')),_latitude,_longitude,
    'under_review',false,false
  ) RETURNING id INTO v_id;

  INSERT INTO public.merchant_members(merchant_id,user_id,role,status)
  VALUES(v_id,v_user_id,'owner','active');
  INSERT INTO public.user_roles(user_id,role)
  VALUES(v_user_id,'merchant'::public.app_role)
  ON CONFLICT(user_id,role) DO NOTHING;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resubmit_merchant_application(_merchant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.current_user_is_merchant_owner(_merchant_id) THEN RAISE EXCEPTION 'merchant owner access required'; END IF;
  UPDATE public.merchants
  SET approval_status='under_review', rejection_reason=NULL
  WHERE id=_merchant_id AND approval_status IN ('pending','rejected');
  IF NOT FOUND THEN RAISE EXCEPTION 'merchant cannot be resubmitted'; END IF;
  UPDATE public.merchant_documents SET status='pending',rejection_reason=NULL,reviewed_by=NULL,reviewed_at=NULL
  WHERE merchant_id=_merchant_id AND status='rejected';
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_courier_application(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_existing public.couriers;
  v_id uuid;
  v_cpf text := regexp_replace(COALESCE(_payload->>'cpf',''),'\D','','g');
  v_vehicle_type text := lower(NULLIF(btrim(_payload->>'vehicle_type'),''));
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=v_user_id AND p.is_active=true) THEN
    RAISE EXCEPTION 'active profile required';
  END IF;
  IF length(v_cpf) <> 11 THEN RAISE EXCEPTION 'invalid cpf'; END IF;
  IF v_vehicle_type NOT IN ('moto','carro','bicicleta') THEN RAISE EXCEPTION 'invalid vehicle type'; END IF;

  SELECT * INTO v_existing FROM public.couriers c WHERE c.user_id=v_user_id FOR UPDATE;
  IF FOUND AND v_existing.status IN ('approved','blocked') THEN RAISE EXCEPTION 'courier application cannot be changed'; END IF;

  IF FOUND THEN
    UPDATE public.couriers SET
      cpf=v_cpf,
      birth_date=NULLIF(_payload->>'birth_date','')::date,
      address=COALESCE(_payload->'address','{}'::jsonb),
      vehicle_type=v_vehicle_type,
      vehicle_model=NULLIF(btrim(_payload->>'vehicle_model'),''),
      vehicle_plate=upper(NULLIF(btrim(_payload->>'vehicle_plate'),'')),
      cnh_number=NULLIF(regexp_replace(COALESCE(_payload->>'cnh_number',''),'\D','','g'),''),
      pix_key=NULLIF(btrim(_payload->>'pix_key'),''),
      photo_url=NULLIF(btrim(_payload->>'photo_url'),''),
      status='under_review',
      rejection_reason=NULL,
      approved_by=NULL,
      approved_at=NULL,
      is_active=true
    WHERE id=v_existing.id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.couriers(
      user_id,cpf,birth_date,address,vehicle_type,vehicle_model,vehicle_plate,cnh_number,pix_key,photo_url,
      status,is_active,rejection_reason,approved_by,approved_at
    ) VALUES (
      v_user_id,v_cpf,NULLIF(_payload->>'birth_date','')::date,COALESCE(_payload->'address','{}'::jsonb),v_vehicle_type,
      NULLIF(btrim(_payload->>'vehicle_model'),''),upper(NULLIF(btrim(_payload->>'vehicle_plate'),'')),
      NULLIF(regexp_replace(COALESCE(_payload->>'cnh_number',''),'\D','','g'),''),NULLIF(btrim(_payload->>'pix_key'),''),
      NULLIF(btrim(_payload->>'photo_url'),''),'under_review',true,NULL,NULL,NULL
    ) RETURNING id INTO v_id;
  END IF;

  UPDATE public.courier_documents
  SET status='pending',rejection_reason=NULL,reviewed_by=NULL,reviewed_at=NULL
  WHERE courier_id=v_id AND status='rejected';
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_merchant_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_merchant_application(uuid,text,text,text,text,text,text,text,text,text,numeric,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resubmit_merchant_application(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_courier_application(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_merchant_member(uuid,uuid,text,text) TO authenticated;
