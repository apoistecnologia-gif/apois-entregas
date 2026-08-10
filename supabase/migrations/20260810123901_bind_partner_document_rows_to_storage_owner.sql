create or replace function public.validate_partner_document_storage_path()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_expected_prefix text;
begin
  if tg_table_name = 'courier_documents' then
    select c.user_id::text into v_expected_prefix
    from public.couriers c
    where c.id = new.courier_id;
  elsif tg_table_name = 'merchant_documents' then
    v_expected_prefix := new.merchant_id::text;
  else
    raise exception 'unsupported partner document table';
  end if;

  if v_expected_prefix is null then
    raise exception 'partner document owner not found';
  end if;

  if new.storage_path is null
     or split_part(new.storage_path, '/', 1) <> v_expected_prefix
     or position('/' in new.storage_path) = 0 then
    raise exception 'document storage path does not belong to partner';
  end if;

  return new;
end;
$function$;

revoke all on function public.validate_partner_document_storage_path() from public, anon, authenticated;

drop trigger if exists trg_validate_courier_document_storage_path on public.courier_documents;
create trigger trg_validate_courier_document_storage_path
before insert or update of courier_id, storage_path
on public.courier_documents
for each row execute function public.validate_partner_document_storage_path();

drop trigger if exists trg_validate_merchant_document_storage_path on public.merchant_documents;
create trigger trg_validate_merchant_document_storage_path
before insert or update of merchant_id, storage_path
on public.merchant_documents
for each row execute function public.validate_partner_document_storage_path();
