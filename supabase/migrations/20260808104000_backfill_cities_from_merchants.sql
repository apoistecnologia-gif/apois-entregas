-- Backfill real city records from existing merchant addresses only.
-- No demonstration city is inserted when there is no corresponding merchant data.

INSERT INTO public.cities(name,state,slug,is_active)
SELECT DISTINCT
  btrim(m.city),
  upper(btrim(m.state)),
  lower(regexp_replace(btrim(m.city), '\s+', '-', 'g')) || '-' || lower(btrim(m.state)),
  true
FROM public.merchants m
WHERE NULLIF(btrim(m.city),'') IS NOT NULL
  AND upper(btrim(m.state)) ~ '^[A-Z]{2}$'
ON CONFLICT DO NOTHING;

UPDATE public.merchants m
SET city_id=c.id
FROM public.cities c
WHERE m.city_id IS NULL
  AND lower(btrim(c.name))=lower(btrim(m.city))
  AND c.state=upper(btrim(m.state));
