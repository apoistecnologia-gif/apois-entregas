-- APOIS ENTREGAS — merchant managers must be able to see inactive customization rows to manage them.

DROP POLICY IF EXISTS "Merchant managers view all option groups" ON public.product_option_groups;
CREATE POLICY "Merchant managers view all option groups"
ON public.product_option_groups
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = product_option_groups.product_id
      AND public.current_user_is_merchant_manager(p.merchant_id)
  )
);

DROP POLICY IF EXISTS "Merchant managers view all options" ON public.product_options;
CREATE POLICY "Merchant managers view all options"
ON public.product_options
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.product_option_groups pog
    JOIN public.products p ON p.id = pog.product_id
    WHERE pog.id = product_options.option_group_id
      AND public.current_user_is_merchant_manager(p.merchant_id)
  )
);
