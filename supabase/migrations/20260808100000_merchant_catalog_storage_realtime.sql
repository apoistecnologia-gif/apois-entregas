-- APOIS ENTREGAS — merchant catalog write access, storage policies and realtime publication.

-- -----------------------------------------------------------------------------
-- Merchant catalog CRUD: only active managers of the owning merchant.
-- -----------------------------------------------------------------------------
CREATE POLICY "Merchant managers insert categories"
ON public.menu_categories FOR INSERT TO authenticated
WITH CHECK (public.current_user_is_merchant_manager(merchant_id));
CREATE POLICY "Merchant managers update categories"
ON public.menu_categories FOR UPDATE TO authenticated
USING (public.current_user_is_merchant_manager(merchant_id))
WITH CHECK (public.current_user_is_merchant_manager(merchant_id));
CREATE POLICY "Merchant managers delete categories"
ON public.menu_categories FOR DELETE TO authenticated
USING (public.current_user_is_merchant_manager(merchant_id));

CREATE POLICY "Merchant managers insert products"
ON public.products FOR INSERT TO authenticated
WITH CHECK (public.current_user_is_merchant_manager(merchant_id));
CREATE POLICY "Merchant managers update products"
ON public.products FOR UPDATE TO authenticated
USING (public.current_user_is_merchant_manager(merchant_id))
WITH CHECK (public.current_user_is_merchant_manager(merchant_id));
CREATE POLICY "Merchant managers delete products"
ON public.products FOR DELETE TO authenticated
USING (public.current_user_is_merchant_manager(merchant_id));

CREATE POLICY "Merchant managers insert option groups"
ON public.product_option_groups FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id=product_option_groups.product_id
    AND public.current_user_is_merchant_manager(p.merchant_id)
));
CREATE POLICY "Merchant managers update option groups"
ON public.product_option_groups FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id=product_option_groups.product_id
    AND public.current_user_is_merchant_manager(p.merchant_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id=product_option_groups.product_id
    AND public.current_user_is_merchant_manager(p.merchant_id)
));
CREATE POLICY "Merchant managers delete option groups"
ON public.product_option_groups FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id=product_option_groups.product_id
    AND public.current_user_is_merchant_manager(p.merchant_id)
));

CREATE POLICY "Merchant managers insert options"
ON public.product_options FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1
  FROM public.product_option_groups pog
  JOIN public.products p ON p.id=pog.product_id
  WHERE pog.id=product_options.option_group_id
    AND public.current_user_is_merchant_manager(p.merchant_id)
));
CREATE POLICY "Merchant managers update options"
ON public.product_options FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.product_option_groups pog
  JOIN public.products p ON p.id=pog.product_id
  WHERE pog.id=product_options.option_group_id
    AND public.current_user_is_merchant_manager(p.merchant_id)
))
WITH CHECK (EXISTS (
  SELECT 1
  FROM public.product_option_groups pog
  JOIN public.products p ON p.id=pog.product_id
  WHERE pog.id=product_options.option_group_id
    AND public.current_user_is_merchant_manager(p.merchant_id)
));
CREATE POLICY "Merchant managers delete options"
ON public.product_options FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.product_option_groups pog
  JOIN public.products p ON p.id=pog.product_id
  WHERE pog.id=product_options.option_group_id
    AND public.current_user_is_merchant_manager(p.merchant_id)
));

CREATE POLICY "Merchant managers insert hours"
ON public.merchant_hours FOR INSERT TO authenticated
WITH CHECK (public.current_user_is_merchant_manager(merchant_id));
CREATE POLICY "Merchant managers update hours"
ON public.merchant_hours FOR UPDATE TO authenticated
USING (public.current_user_is_merchant_manager(merchant_id))
WITH CHECK (public.current_user_is_merchant_manager(merchant_id));
CREATE POLICY "Merchant managers delete hours"
ON public.merchant_hours FOR DELETE TO authenticated
USING (public.current_user_is_merchant_manager(merchant_id));

GRANT INSERT,UPDATE,DELETE ON public.menu_categories,public.products,
  public.product_option_groups,public.product_options,public.merchant_hours TO authenticated;

-- -----------------------------------------------------------------------------
-- Storage
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES
  ('avatars','avatars',true,5242880,ARRAY['image/jpeg','image/png','image/webp']),
  ('product-images','product-images',true,10485760,ARRAY['image/jpeg','image/png','image/webp']),
  ('merchant-assets','merchant-assets',true,10485760,ARRAY['image/jpeg','image/png','image/webp']),
  ('courier-documents','courier-documents',false,15728640,ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('merchant-documents','merchant-documents',false,15728640,ARRAY['image/jpeg','image/png','image/webp','application/pdf']),
  ('support-attachments','support-attachments',false,15728640,ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT(id) DO UPDATE SET
  public=EXCLUDED.public,
  file_size_limit=EXCLUDED.file_size_limit,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

-- Safe UUID parser for path policies.
CREATE OR REPLACE FUNCTION public.uuid_or_null(_value text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path=''
AS $$
BEGIN
  RETURN _value::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.uuid_or_null(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uuid_or_null(text) TO authenticated,service_role;

-- Avatars: user-owned folder <auth.uid>/file, public read.
CREATE POLICY "Public read avatars" ON storage.objects FOR SELECT TO public
USING (bucket_id='avatars');
CREATE POLICY "Users upload own avatar" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
CREATE POLICY "Users update own avatar" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id='avatars' AND owner_id=(SELECT auth.uid()::text))
WITH CHECK (bucket_id='avatars' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
CREATE POLICY "Users delete own avatar" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='avatars' AND owner_id=(SELECT auth.uid()::text));

-- Product images: <merchant_id>/...; public read, manager write.
CREATE POLICY "Public read product images" ON storage.objects FOR SELECT TO public
USING (bucket_id='product-images');
CREATE POLICY "Merchant managers upload product images" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='product-images' AND public.current_user_is_merchant_manager(public.uuid_or_null((storage.foldername(name))[1])));
CREATE POLICY "Merchant managers update product images" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id='product-images' AND public.current_user_is_merchant_manager(public.uuid_or_null((storage.foldername(name))[1])))
WITH CHECK (bucket_id='product-images' AND public.current_user_is_merchant_manager(public.uuid_or_null((storage.foldername(name))[1])));
CREATE POLICY "Merchant managers delete product images" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='product-images' AND public.current_user_is_merchant_manager(public.uuid_or_null((storage.foldername(name))[1])));

-- Merchant logo/cover: <merchant_id>/...
CREATE POLICY "Public read merchant assets" ON storage.objects FOR SELECT TO public
USING (bucket_id='merchant-assets');
CREATE POLICY "Merchant managers upload assets" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='merchant-assets' AND public.current_user_is_merchant_manager(public.uuid_or_null((storage.foldername(name))[1])));
CREATE POLICY "Merchant managers update assets" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id='merchant-assets' AND public.current_user_is_merchant_manager(public.uuid_or_null((storage.foldername(name))[1])))
WITH CHECK (bucket_id='merchant-assets' AND public.current_user_is_merchant_manager(public.uuid_or_null((storage.foldername(name))[1])));
CREATE POLICY "Merchant managers delete assets" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='merchant-assets' AND public.current_user_is_merchant_manager(public.uuid_or_null((storage.foldername(name))[1])));

-- Courier docs: <user_id>/... private.
CREATE POLICY "Courier reads own documents" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='courier-documents' AND ((storage.foldername(name))[1]=(SELECT auth.uid())::text OR public.current_user_is_admin()));
CREATE POLICY "Courier uploads own documents" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='courier-documents' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
CREATE POLICY "Courier updates own documents" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id='courier-documents' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text)
WITH CHECK (bucket_id='courier-documents' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);
CREATE POLICY "Courier deletes own documents" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='courier-documents' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);

-- Merchant docs: <merchant_id>/... private.
CREATE POLICY "Merchant reads own documents storage" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='merchant-documents' AND (public.current_user_is_merchant_member(public.uuid_or_null((storage.foldername(name))[1])) OR public.current_user_is_admin()));
CREATE POLICY "Merchant manager uploads documents" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='merchant-documents' AND public.current_user_is_merchant_manager(public.uuid_or_null((storage.foldername(name))[1])));
CREATE POLICY "Merchant manager updates documents" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id='merchant-documents' AND public.current_user_is_merchant_manager(public.uuid_or_null((storage.foldername(name))[1])))
WITH CHECK (bucket_id='merchant-documents' AND public.current_user_is_merchant_manager(public.uuid_or_null((storage.foldername(name))[1])));
CREATE POLICY "Merchant manager deletes documents" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='merchant-documents' AND public.current_user_is_merchant_manager(public.uuid_or_null((storage.foldername(name))[1])));

-- Support attachments: <user_id>/<ticket_id>/...; admin can read all.
CREATE POLICY "Support participants read attachments" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id='support-attachments' AND (
    public.current_user_is_admin() OR
    ((storage.foldername(name))[1]=(SELECT auth.uid())::text AND EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id=public.uuid_or_null((storage.foldername(name))[2])
        AND st.requester_user_id=(SELECT auth.uid())
    ))
  )
);
CREATE POLICY "Users upload support attachments" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='support-attachments'
  AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
  AND EXISTS (
    SELECT 1 FROM public.support_tickets st
    WHERE st.id=public.uuid_or_null((storage.foldername(name))[2])
      AND st.requester_user_id=(SELECT auth.uid())
      AND st.status IN ('open','in_progress')
  )
);
CREATE POLICY "Users delete own support attachments" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='support-attachments' AND (storage.foldername(name))[1]=(SELECT auth.uid())::text);

-- -----------------------------------------------------------------------------
-- Realtime publication, idempotently.
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orders','order_status_history','delivery_jobs','delivery_offers','delivery_events',
    'notifications','support_tickets','support_messages','courier_availability','courier_locations'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
