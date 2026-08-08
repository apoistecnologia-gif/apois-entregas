-- Make review aggregate recalculation safe for INSERT/UPDATE/DELETE trigger records.

CREATE OR REPLACE FUNCTION public.recalculate_review_aggregates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_merchant_id uuid;
  v_old_merchant_id uuid;
  v_courier_id uuid;
  v_old_courier_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_merchant_id := OLD.merchant_id;
    v_courier_id := OLD.courier_id;
  ELSE
    v_merchant_id := NEW.merchant_id;
    v_courier_id := NEW.courier_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_merchant_id := OLD.merchant_id;
    v_old_courier_id := OLD.courier_id;
  END IF;

  UPDATE public.merchants m
  SET rating = COALESCE((
        SELECT round(avg(r.merchant_rating)::numeric, 2)
        FROM public.reviews r
        WHERE r.merchant_id = v_merchant_id AND r.merchant_rating IS NOT NULL
      ), 0),
      review_count = (
        SELECT count(*)::integer
        FROM public.reviews r
        WHERE r.merchant_id = v_merchant_id AND r.merchant_rating IS NOT NULL
      )
  WHERE m.id = v_merchant_id;

  IF v_courier_id IS NOT NULL THEN
    UPDATE public.couriers c
    SET rating = COALESCE((
          SELECT round(avg(r.courier_rating)::numeric, 2)
          FROM public.reviews r
          WHERE r.courier_id = v_courier_id AND r.courier_rating IS NOT NULL
        ), 0),
        review_count = (
          SELECT count(*)::integer
          FROM public.reviews r
          WHERE r.courier_id = v_courier_id AND r.courier_rating IS NOT NULL
        )
    WHERE c.id = v_courier_id;
  END IF;

  IF TG_OP = 'UPDATE' AND v_old_merchant_id IS DISTINCT FROM v_merchant_id THEN
    UPDATE public.merchants m
    SET rating = COALESCE((
          SELECT round(avg(r.merchant_rating)::numeric, 2)
          FROM public.reviews r
          WHERE r.merchant_id = v_old_merchant_id AND r.merchant_rating IS NOT NULL
        ), 0),
        review_count = (
          SELECT count(*)::integer
          FROM public.reviews r
          WHERE r.merchant_id = v_old_merchant_id AND r.merchant_rating IS NOT NULL
        )
    WHERE m.id = v_old_merchant_id;
  END IF;

  IF TG_OP = 'UPDATE' AND v_old_courier_id IS DISTINCT FROM v_courier_id AND v_old_courier_id IS NOT NULL THEN
    UPDATE public.couriers c
    SET rating = COALESCE((
          SELECT round(avg(r.courier_rating)::numeric, 2)
          FROM public.reviews r
          WHERE r.courier_id = v_old_courier_id AND r.courier_rating IS NOT NULL
        ), 0),
        review_count = (
          SELECT count(*)::integer
          FROM public.reviews r
          WHERE r.courier_id = v_old_courier_id AND r.courier_rating IS NOT NULL
        )
    WHERE c.id = v_old_courier_id;
  END IF;

  RETURN NULL;
END;
$$;
