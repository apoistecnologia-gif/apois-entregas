drop policy if exists "Courier updates own documents" on storage.objects;
create policy "Courier updates own documents"
on storage.objects for update to authenticated
using (
  bucket_id = 'courier-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1
    from public.courier_documents d
    join public.couriers c on c.id = d.courier_id
    where d.storage_path = storage.objects.name
      and d.status = 'approved'
      and c.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'courier-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Courier deletes own documents" on storage.objects;
create policy "Courier deletes own documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'courier-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1
    from public.courier_documents d
    join public.couriers c on c.id = d.courier_id
    where d.storage_path = storage.objects.name
      and d.status = 'approved'
      and c.user_id = (select auth.uid())
  )
);

drop policy if exists "Merchant manager updates documents" on storage.objects;
create policy "Merchant manager updates documents"
on storage.objects for update to authenticated
using (
  bucket_id = 'merchant-documents'
  and public.current_user_is_merchant_manager(public.uuid_or_null((storage.foldername(name))[1]))
  and not exists (
    select 1
    from public.merchant_documents d
    where d.storage_path = storage.objects.name
      and d.status = 'approved'
  )
)
with check (
  bucket_id = 'merchant-documents'
  and public.current_user_is_merchant_manager(public.uuid_or_null((storage.foldername(name))[1]))
);

drop policy if exists "Merchant manager deletes documents" on storage.objects;
create policy "Merchant manager deletes documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'merchant-documents'
  and public.current_user_is_merchant_manager(public.uuid_or_null((storage.foldername(name))[1]))
  and not exists (
    select 1
    from public.merchant_documents d
    where d.storage_path = storage.objects.name
      and d.status = 'approved'
  )
);

drop policy if exists "Merchant owner updates application documents storage" on storage.objects;
create policy "Merchant owner updates application documents storage"
on storage.objects for update to authenticated
using (
  bucket_id = 'merchant-documents'
  and public.current_user_is_merchant_owner(public.uuid_or_null((storage.foldername(name))[1]))
  and not exists (
    select 1
    from public.merchant_documents d
    where d.storage_path = storage.objects.name
      and d.status = 'approved'
  )
)
with check (
  bucket_id = 'merchant-documents'
  and public.current_user_is_merchant_owner(public.uuid_or_null((storage.foldername(name))[1]))
);

drop policy if exists "Merchant owner deletes application documents storage" on storage.objects;
create policy "Merchant owner deletes application documents storage"
on storage.objects for delete to authenticated
using (
  bucket_id = 'merchant-documents'
  and public.current_user_is_merchant_owner(public.uuid_or_null((storage.foldername(name))[1]))
  and not exists (
    select 1
    from public.merchant_documents d
    where d.storage_path = storage.objects.name
      and d.status = 'approved'
  )
);
