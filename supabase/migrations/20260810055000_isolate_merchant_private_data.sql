create or replace function public.get_authorized_merchant_private_data(_merchant_id uuid default null)
returns table(
  merchant_id uuid,
  owner_user_id uuid,
  legal_name text,
  document text,
  contact_phone text,
  contact_email text,
  rejection_reason text,
  approved_at timestamptz,
  approved_by uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    m.owner_user_id,
    m.legal_name,
    m.document,
    m.contact_phone,
    m.contact_email,
    m.rejection_reason,
    m.approved_at,
    m.approved_by
  from public.merchants m
  where (_merchant_id is null or m.id = _merchant_id)
    and (
      public.current_user_is_admin()
      or public.current_user_is_merchant_member(m.id)
    );
$$;

revoke all on function public.get_authorized_merchant_private_data(uuid) from public, anon;
grant execute on function public.get_authorized_merchant_private_data(uuid) to authenticated, service_role;

revoke select on table public.merchants from authenticated;
grant select (
  id,
  category_id,
  name,
  slug,
  description,
  logo_url,
  cover_url,
  tags,
  delivery_fee,
  delivery_min_minutes,
  delivery_max_minutes,
  rating,
  review_count,
  is_open,
  closes_at,
  is_active,
  address_line,
  neighborhood,
  city,
  state,
  latitude,
  longitude,
  created_at,
  updated_at,
  minimum_order,
  pickup_enabled,
  delivery_enabled,
  approval_status,
  temporarily_closed,
  city_id
) on table public.merchants to authenticated;
