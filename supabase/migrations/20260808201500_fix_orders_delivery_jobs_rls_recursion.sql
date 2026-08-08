-- Corrige recursão RLS entre orders e delivery_jobs.
-- orders consultava delivery_jobs para autorizar o entregador; delivery_jobs, por sua vez,
-- consulta orders para autorizar o cliente. O ciclo causava HTTP 500 e quebrava o Realtime.

CREATE OR REPLACE FUNCTION public.current_user_is_assigned_courier(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.delivery_jobs dj
    WHERE dj.order_id = _order_id
      AND dj.courier_id = public.current_user_courier_id()
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_assigned_courier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_assigned_courier(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Assigned courier can view assigned orders" ON public.orders;
CREATE POLICY "Assigned courier can view assigned orders"
ON public.orders
FOR SELECT
TO authenticated
USING (public.current_user_is_assigned_courier(id));
