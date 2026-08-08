-- APOIS ENTREGAS — persistent customer merchant favorites.

CREATE TABLE IF NOT EXISTS public.customer_favorites (
  customer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_user_id, merchant_id)
);

CREATE INDEX IF NOT EXISTS customer_favorites_merchant_idx
  ON public.customer_favorites(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_favorites_user_created_idx
  ON public.customer_favorites(customer_user_id, created_at DESC);

ALTER TABLE public.customer_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers view own favorites" ON public.customer_favorites;
CREATE POLICY "Customers view own favorites"
ON public.customer_favorites FOR SELECT TO authenticated
USING (customer_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Customers add own favorites" ON public.customer_favorites;
CREATE POLICY "Customers add own favorites"
ON public.customer_favorites FOR INSERT TO authenticated
WITH CHECK (
  customer_user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.merchants m
    WHERE m.id = merchant_id
      AND m.is_active = true
      AND m.approval_status = 'approved'
  )
);

DROP POLICY IF EXISTS "Customers remove own favorites" ON public.customer_favorites;
CREATE POLICY "Customers remove own favorites"
ON public.customer_favorites FOR DELETE TO authenticated
USING (customer_user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.customer_favorites FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.customer_favorites TO authenticated;
GRANT ALL ON TABLE public.customer_favorites TO service_role;
