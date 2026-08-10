create or replace function public.protect_approved_merchant_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.approval_status = 'approved'
     and not public.current_user_is_admin()
     and (
       new.document is distinct from old.document
       or new.legal_name is distinct from old.legal_name
       or new.owner_user_id is distinct from old.owner_user_id
     )
  then
    raise exception 'approved merchant identity changes require admin review';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_approved_merchant_identity() from public, anon, authenticated;
grant execute on function public.protect_approved_merchant_identity() to service_role;

drop trigger if exists trg_protect_approved_merchant_identity on public.merchants;
create trigger trg_protect_approved_merchant_identity
before update on public.merchants
for each row execute function public.protect_approved_merchant_identity();
