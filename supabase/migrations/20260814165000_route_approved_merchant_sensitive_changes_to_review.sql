create or replace function public.protect_approved_merchant_identity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_legal_changed boolean := false;
  v_location_changed boolean := false;
  v_owner_changed boolean := false;
begin
  if old.approval_status <> 'approved'
     or public.current_user_is_admin()
     or coalesce((select auth.role()), '') = 'service_role' then
    return new;
  end if;

  v_legal_changed :=
    new.document is distinct from old.document
    or new.legal_name is distinct from old.legal_name;

  v_owner_changed := new.owner_user_id is distinct from old.owner_user_id;

  v_location_changed :=
    new.city_id is distinct from old.city_id
    or new.city is distinct from old.city
    or new.state is distinct from old.state
    or new.address_line is distinct from old.address_line
    or new.neighborhood is distinct from old.neighborhood
    or new.latitude is distinct from old.latitude
    or new.longitude is distinct from old.longitude;

  if not (v_legal_changed or v_owner_changed or v_location_changed) then
    return new;
  end if;

  -- Approved identity/location data may be changed by the merchant, but the
  -- merchant must leave the live marketplace and pass review again before
  -- becoming operational. This preserves the existing settings UX without
  -- allowing an approved partner to bypass document/location verification.
  new.approval_status := 'under_review';
  new.is_active := false;
  new.is_open := false;
  new.approved_at := null;
  new.approved_by := null;
  new.rejection_reason := null;

  if v_legal_changed then
    update public.merchant_documents
    set status = 'pending',
        rejection_reason = null,
        reviewed_by = null,
        reviewed_at = null
    where merchant_id = old.id
      and document_type = 'documento_empresa'
      and status = 'approved';
  end if;

  if v_owner_changed then
    update public.merchant_documents
    set status = 'pending',
        rejection_reason = null,
        reviewed_by = null,
        reviewed_at = null
    where merchant_id = old.id
      and document_type = 'responsavel'
      and status = 'approved';
  end if;

  if v_location_changed then
    update public.merchant_documents
    set status = 'pending',
        rejection_reason = null,
        reviewed_by = null,
        reviewed_at = null
    where merchant_id = old.id
      and document_type = 'comprovante_endereco'
      and status = 'approved';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_approved_merchant_identity() from public, anon, authenticated;
grant execute on function public.protect_approved_merchant_identity() to service_role;
