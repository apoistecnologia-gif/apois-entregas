-- Owners must be able to see/edit an application and upload private documents before approval.
DROP POLICY IF EXISTS "Merchant owners view own application" ON public.merchants;
CREATE POLICY "Merchant owners view own application"
ON public.merchants FOR SELECT TO authenticated
USING (public.current_user_is_merchant_owner(id));

DROP POLICY IF EXISTS "Merchant owners edit own application" ON public.merchants;
CREATE POLICY "Merchant owners edit own application"
ON public.merchants FOR UPDATE TO authenticated
USING (
  public.current_user_is_merchant_owner(id)
  AND approval_status IN ('pending','under_review','rejected','approved')
)
WITH CHECK (public.current_user_is_merchant_owner(id));

DROP POLICY IF EXISTS "Merchant owners view application documents" ON public.merchant_documents;
CREATE POLICY "Merchant owners view application documents"
ON public.merchant_documents FOR SELECT TO authenticated
USING (public.current_user_is_merchant_owner(merchant_id) OR public.current_user_is_admin());

DROP POLICY IF EXISTS "Merchant owners insert pending documents" ON public.merchant_documents;
CREATE POLICY "Merchant owners insert pending documents"
ON public.merchant_documents FOR INSERT TO authenticated
WITH CHECK (
  public.current_user_is_merchant_owner(merchant_id)
  AND status='pending'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND rejection_reason IS NULL
);

DROP POLICY IF EXISTS "Merchant owners replace reviewable documents" ON public.merchant_documents;
CREATE POLICY "Merchant owners replace reviewable documents"
ON public.merchant_documents FOR UPDATE TO authenticated
USING (public.current_user_is_merchant_owner(merchant_id) AND status IN ('pending','rejected'))
WITH CHECK (public.current_user_is_merchant_owner(merchant_id) AND status='pending');

DROP POLICY IF EXISTS "Merchant owner reads application documents storage" ON storage.objects;
CREATE POLICY "Merchant owner reads application documents storage"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id='merchant-documents'
  AND (
    public.current_user_is_merchant_owner(public.uuid_or_null((storage.foldername(name))[1]))
    OR public.current_user_is_admin()
  )
);

DROP POLICY IF EXISTS "Merchant owner uploads application documents storage" ON storage.objects;
CREATE POLICY "Merchant owner uploads application documents storage"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='merchant-documents'
  AND public.current_user_is_merchant_owner(public.uuid_or_null((storage.foldername(name))[1]))
);

DROP POLICY IF EXISTS "Merchant owner updates application documents storage" ON storage.objects;
CREATE POLICY "Merchant owner updates application documents storage"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id='merchant-documents'
  AND public.current_user_is_merchant_owner(public.uuid_or_null((storage.foldername(name))[1]))
)
WITH CHECK (
  bucket_id='merchant-documents'
  AND public.current_user_is_merchant_owner(public.uuid_or_null((storage.foldername(name))[1]))
);

DROP POLICY IF EXISTS "Merchant owner deletes application documents storage" ON storage.objects;
CREATE POLICY "Merchant owner deletes application documents storage"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id='merchant-documents'
  AND public.current_user_is_merchant_owner(public.uuid_or_null((storage.foldername(name))[1]))
);
