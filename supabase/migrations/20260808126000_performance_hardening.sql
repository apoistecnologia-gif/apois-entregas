-- APOIS ENTREGAS — safe performance hardening from Supabase advisor findings.
-- Additive indexes only; no business rules are changed.

CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_id_idx ON public.coupon_redemptions(coupon_id);
CREATE INDEX IF NOT EXISTS coupons_merchant_id_idx ON public.coupons(merchant_id);
CREATE INDEX IF NOT EXISTS courier_documents_reviewed_by_idx ON public.courier_documents(reviewed_by);
CREATE INDEX IF NOT EXISTS couriers_approved_by_idx ON public.couriers(approved_by);
CREATE INDEX IF NOT EXISTS delivery_events_actor_user_id_idx ON public.delivery_events(actor_user_id);
CREATE INDEX IF NOT EXISTS fee_rules_merchant_id_idx ON public.fee_rules(merchant_id);
CREATE INDEX IF NOT EXISTS merchant_documents_reviewed_by_idx ON public.merchant_documents(reviewed_by);
CREATE INDEX IF NOT EXISTS merchants_approved_by_idx ON public.merchants(approved_by);
CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS order_status_history_changed_by_idx ON public.order_status_history(changed_by_user_id);
CREATE INDEX IF NOT EXISTS orders_coupon_id_idx ON public.orders(coupon_id);
CREATE INDEX IF NOT EXISTS payment_events_payment_id_idx ON public.payment_events(payment_id);
CREATE INDEX IF NOT EXISTS payouts_payout_account_id_idx ON public.payouts(payout_account_id);
CREATE INDEX IF NOT EXISTS payouts_requested_by_idx ON public.payouts(requested_by);
CREATE INDEX IF NOT EXISTS platform_settings_updated_by_idx ON public.platform_settings(updated_by);
CREATE INDEX IF NOT EXISTS promotions_menu_category_id_idx ON public.promotions(menu_category_id);
CREATE INDEX IF NOT EXISTS promotions_product_id_idx ON public.promotions(product_id);
CREATE INDEX IF NOT EXISTS refunds_order_id_idx ON public.refunds(order_id);
CREATE INDEX IF NOT EXISTS refunds_payment_id_idx ON public.refunds(payment_id);
CREATE INDEX IF NOT EXISTS refunds_requested_by_idx ON public.refunds(requested_by);
CREATE INDEX IF NOT EXISTS reviews_customer_user_id_idx ON public.reviews(customer_user_id);
CREATE INDEX IF NOT EXISTS support_messages_sender_user_id_idx ON public.support_messages(sender_user_id);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_admin_id_idx ON public.support_tickets(assigned_admin_id);
CREATE INDEX IF NOT EXISTS support_tickets_delivery_job_id_idx ON public.support_tickets(delivery_job_id);
CREATE INDEX IF NOT EXISTS support_tickets_order_id_idx ON public.support_tickets(order_id);

-- Optimize the three original customer read policies so auth.uid() is evaluated
-- once per statement instead of once per row.
DROP POLICY IF EXISTS "Customers can view their own orders" ON public.orders;
CREATE POLICY "Customers can view their own orders"
ON public.orders FOR SELECT TO authenticated
USING (customer_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Customers can view items of their own orders" ON public.order_items;
CREATE POLICY "Customers can view items of their own orders"
ON public.order_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.customer_user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Customers can view history of their own orders" ON public.order_status_history;
CREATE POLICY "Customers can view history of their own orders"
ON public.order_status_history FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_status_history.order_id
      AND o.customer_user_id = (SELECT auth.uid())
  )
);
