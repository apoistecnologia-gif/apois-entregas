-- APOIS ENTREGAS — indexes aligned with production query paths.

CREATE INDEX IF NOT EXISTS orders_customer_created_idx
  ON public.orders(customer_user_id, created_at DESC)
  WHERE customer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_merchant_created_idx
  ON public.orders(merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_merchant_status_created_idx
  ON public.orders(merchant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_payment_status_created_idx
  ON public.orders(payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS order_status_history_order_created_idx
  ON public.order_status_history(order_id, created_at);

CREATE INDEX IF NOT EXISTS delivery_jobs_courier_status_created_idx
  ON public.delivery_jobs(courier_id, status, created_at DESC)
  WHERE courier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS delivery_jobs_unassigned_status_created_idx
  ON public.delivery_jobs(status, created_at)
  WHERE courier_id IS NULL;

CREATE INDEX IF NOT EXISTS delivery_offers_courier_status_expiry_idx
  ON public.delivery_offers(courier_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS delivery_offers_job_status_expiry_idx
  ON public.delivery_offers(delivery_job_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS courier_availability_online_seen_idx
  ON public.courier_availability(is_online, last_seen_at DESC)
  WHERE is_online=true;

CREATE INDEX IF NOT EXISTS courier_locations_recorded_idx
  ON public.courier_locations(recorded_at DESC);

CREATE INDEX IF NOT EXISTS reviews_customer_created_idx
  ON public.reviews(customer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payments_status_created_idx
  ON public.payments(status, created_at DESC);

CREATE INDEX IF NOT EXISTS support_tickets_assigned_status_idx
  ON public.support_tickets(assigned_admin_id, status, created_at DESC)
  WHERE assigned_admin_id IS NOT NULL;
