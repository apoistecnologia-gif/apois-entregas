-- APOIS ENTREGAS — honor user notification preferences at the database boundary.
-- Critical security/support/financial alerts are intentionally never suppressed.

CREATE OR REPLACE FUNCTION public.enforce_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_preferences public.notification_preferences;
  v_type text := lower(COALESCE(NEW.notification_type, ''));
BEGIN
  SELECT * INTO v_preferences
  FROM public.notification_preferences p
  WHERE p.user_id = NEW.user_id;

  -- No saved row means the documented defaults apply.
  IF NOT FOUND THEN
    IF v_type LIKE 'promotion%' OR v_type LIKE 'coupon%' OR v_type LIKE 'marketing%' THEN
      RETURN NULL;
    END IF;
    IF v_type LIKE 'product_news%' OR v_type LIKE 'merchant_news%' OR v_type LIKE 'news%' THEN
      RETURN NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF (v_type LIKE 'order%' OR v_type LIKE 'delivery%')
     AND NOT v_preferences.order_updates THEN
    RETURN NULL;
  END IF;

  IF (v_type LIKE 'promotion%' OR v_type LIKE 'coupon%' OR v_type LIKE 'marketing%')
     AND NOT v_preferences.promotions THEN
    RETURN NULL;
  END IF;

  IF (v_type LIKE 'product_news%' OR v_type LIKE 'merchant_news%' OR v_type LIKE 'news%')
     AND NOT v_preferences.product_news THEN
    RETURN NULL;
  END IF;

  -- account_alerts is advisory for non-critical future channels. Existing
  -- security, payment and support alerts are deliberately not suppressed.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_preferences_guard ON public.notifications;
CREATE TRIGGER notifications_preferences_guard
BEFORE INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.enforce_notification_preferences();

REVOKE ALL ON FUNCTION public.enforce_notification_preferences() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_notification_preferences() TO service_role;
