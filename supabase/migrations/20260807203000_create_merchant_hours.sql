CREATE TABLE public.merchant_hours (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    weekday smallint NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
    opens_at time without time zone NULL,
    closes_at time without time zone NULL,
    is_closed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, weekday),
    CONSTRAINT valid_hours CHECK (
        (is_closed = true AND opens_at IS NULL AND closes_at IS NULL) OR
        (is_closed = false AND opens_at IS NOT NULL AND closes_at IS NOT NULL)
    )
);

GRANT SELECT ON public.merchant_hours TO authenticated;
GRANT ALL ON public.merchant_hours TO service_role;

ALTER TABLE public.merchant_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view hours of active merchants"
ON public.merchant_hours
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.merchants
        WHERE id = public.merchant_hours.merchant_id
        AND status = 'active'
    )
);
