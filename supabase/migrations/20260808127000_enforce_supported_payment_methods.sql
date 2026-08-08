-- APOIS ENTREGAS — server-side payment capability guard.
-- Until card acquiring and cash reconciliation are implemented, production
-- orders may only be created with PIX. The UI is not trusted for this rule.

CREATE OR REPLACE FUNCTION public.enforce_supported_order_payment_method()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.payment_method <> 'pix' THEN
    RAISE EXCEPTION 'payment method is not enabled in production';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_supported_payment_method_guard ON public.orders;
CREATE TRIGGER orders_supported_payment_method_guard
BEFORE INSERT OR UPDATE OF payment_method ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_supported_order_payment_method();

REVOKE ALL ON FUNCTION public.enforce_supported_order_payment_method() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_supported_order_payment_method() TO service_role;
