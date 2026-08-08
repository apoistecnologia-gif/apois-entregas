-- APOIS ENTREGAS — an online payment must be confirmed by the backend before preparation.

CREATE OR REPLACE FUNCTION public.enforce_order_payment_before_fulfillment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('accepted','preparing','ready','ready_for_pickup','searching_driver','driver_assigned','driver_arriving_store','picked_up','out_for_delivery','on_the_way','delivered')
     AND NEW.payment_method <> 'cash'
     AND NEW.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'payment must be confirmed before fulfillment';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_require_payment_before_fulfillment ON public.orders;
CREATE TRIGGER orders_require_payment_before_fulfillment
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_payment_before_fulfillment();
