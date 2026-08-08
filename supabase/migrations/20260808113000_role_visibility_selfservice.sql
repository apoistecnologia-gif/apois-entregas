-- APOIS ENTREGAS — explicit least-privilege visibility for each application.

-- Admin read access required by the administrative console.
CREATE POLICY "Admins read all profiles" ON public.profiles FOR SELECT TO authenticated
USING (public.current_user_is_admin());
CREATE POLICY "Admins read all merchants" ON public.merchants FOR SELECT TO authenticated
USING (public.current_user_is_admin());
CREATE POLICY "Admins read all merchant members" ON public.merchant_members FOR SELECT TO authenticated
USING (public.current_user_is_admin());
CREATE POLICY "Admins read all merchant documents" ON public.merchant_documents FOR SELECT TO authenticated
USING (public.current_user_is_admin());
CREATE POLICY "Admins read all couriers" ON public.couriers FOR SELECT TO authenticated
USING (public.current_user_is_admin());
CREATE POLICY "Admins read all courier documents" ON public.courier_documents FOR SELECT TO authenticated
USING (public.current_user_is_admin());
CREATE POLICY "Admins read all courier availability" ON public.courier_availability FOR SELECT TO authenticated
USING (public.current_user_is_admin());
CREATE POLICY "Admins read all courier locations" ON public.courier_locations FOR SELECT TO authenticated
USING (public.current_user_is_admin());
CREATE POLICY "Admins read all orders" ON public.orders FOR SELECT TO authenticated
USING (public.current_user_is_admin());
CREATE POLICY "Admins read all order items" ON public.order_items FOR SELECT TO authenticated
USING (public.current_user_is_admin());
CREATE POLICY "Admins read all order history" ON public.order_status_history FOR SELECT TO authenticated
USING (public.current_user_is_admin());
CREATE POLICY "Admins read all delivery jobs" ON public.delivery_jobs FOR SELECT TO authenticated
USING (public.current_user_is_admin());
CREATE POLICY "Admins read all delivery offers" ON public.delivery_offers FOR SELECT TO authenticated
USING (public.current_user_is_admin());
CREATE POLICY "Admins read all delivery events" ON public.delivery_events FOR SELECT TO authenticated
USING (public.current_user_is_admin());
CREATE POLICY "Admins read audit log" ON public.admin_audit_logs FOR SELECT TO authenticated
USING (public.current_user_is_admin());

-- Merchant members can load their own membership and merchant; managers can update
-- non-approval business settings on their own merchant. RLS still prevents cross-store access.
CREATE POLICY "Users read own merchant memberships" ON public.merchant_members FOR SELECT TO authenticated
USING (user_id=(SELECT auth.uid()));
CREATE POLICY "Merchant members read own merchant" ON public.merchants FOR SELECT TO authenticated
USING (public.current_user_is_merchant_member(id));
CREATE POLICY "Merchant managers update own merchant" ON public.merchants FOR UPDATE TO authenticated
USING (public.current_user_is_merchant_manager(id))
WITH CHECK (public.current_user_is_merchant_manager(id));

-- Courier application lifecycle: create own application once, read/update only own row.
CREATE POLICY "Users create own courier application" ON public.couriers FOR INSERT TO authenticated
WITH CHECK (user_id=(SELECT auth.uid()) AND status='pending' AND is_active=true);
CREATE POLICY "Couriers read own courier row" ON public.couriers FOR SELECT TO authenticated
USING (user_id=(SELECT auth.uid()));
CREATE POLICY "Couriers update own non approval row" ON public.couriers FOR UPDATE TO authenticated
USING (user_id=(SELECT auth.uid()))
WITH CHECK (user_id=(SELECT auth.uid()));

CREATE POLICY "Couriers read own document rows" ON public.courier_documents FOR SELECT TO authenticated
USING (courier_id=public.current_user_courier_id());
CREATE POLICY "Couriers create own document rows" ON public.courier_documents FOR INSERT TO authenticated
WITH CHECK (courier_id=public.current_user_courier_id() AND status='pending');
CREATE POLICY "Couriers update own pending documents" ON public.courier_documents FOR UPDATE TO authenticated
USING (courier_id=public.current_user_courier_id() AND status IN ('pending','rejected'))
WITH CHECK (courier_id=public.current_user_courier_id() AND status='pending');

-- Merchant payment/review views are already RLS-filtered; these grants make the policies usable.
GRANT SELECT ON public.profiles,public.merchant_members,public.merchant_documents,public.couriers,
  public.courier_documents,public.courier_availability,public.courier_locations,public.delivery_jobs,
  public.delivery_offers,public.delivery_events,public.admin_audit_logs TO authenticated;
GRANT UPDATE ON public.merchants TO authenticated;
GRANT INSERT,UPDATE ON public.couriers TO authenticated;
GRANT INSERT,UPDATE ON public.courier_documents TO authenticated;

-- Prevent self-service updates from mutating approval/security columns through ordinary UPDATE.
REVOKE UPDATE ON public.couriers FROM authenticated;
GRANT UPDATE (cpf,birth_date,address,vehicle_type,vehicle_model,vehicle_plate,cnh_number,pix_key,photo_url,updated_at)
  ON public.couriers TO authenticated;
REVOKE UPDATE ON public.merchants FROM authenticated;
GRANT UPDATE (name,legal_name,document,contact_email,contact_phone,description,logo_url,cover_url,
  delivery_fee,delivery_min_minutes,delivery_max_minutes,address_line,neighborhood,city,state,latitude,longitude,
  minimum_order,pickup_enabled,delivery_enabled,is_open,closes_at,temporarily_closed,updated_at)
  ON public.merchants TO authenticated;
REVOKE UPDATE ON public.courier_documents FROM authenticated;
GRANT UPDATE (storage_path,status,rejection_reason,updated_at) ON public.courier_documents TO authenticated;
