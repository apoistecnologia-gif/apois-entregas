drop policy if exists "Users delete own support attachments" on storage.objects;
create policy "Users delete own unsubmitted support attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'support-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.support_tickets st
    where st.id = public.uuid_or_null((storage.foldername(storage.objects.name))[2])
      and st.requester_user_id = (select auth.uid())
  )
  and not exists (
    select 1
    from public.support_messages sm
    where sm.attachment_paths ? storage.objects.name
  )
);
