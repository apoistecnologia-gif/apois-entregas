create or replace function public.add_support_message(
  _ticket_id uuid,
  _message text,
  _attachment_paths jsonb default '[]'::jsonb,
  _is_internal boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ticket public.support_tickets;
  v_id uuid;
  v_admin boolean;
  v_path text;
  v_attachment_count integer;
  v_message text := btrim(coalesce(_message,''));
begin
  if jsonb_typeof(_attachment_paths) <> 'array' then
    raise exception 'attachments must be an array';
  end if;

  v_attachment_count := jsonb_array_length(_attachment_paths);
  if v_attachment_count > 4 then
    raise exception 'too many attachments';
  end if;
  if char_length(v_message) > 5000 or (char_length(v_message) = 0 and v_attachment_count = 0) then
    raise exception 'invalid message';
  end if;

  v_admin := public.current_user_is_admin();
  select * into v_ticket from public.support_tickets t where t.id = _ticket_id;
  if not found then raise exception 'ticket not found'; end if;
  if not v_admin and v_ticket.requester_user_id is distinct from (select auth.uid()) then
    raise exception 'ticket access required';
  end if;
  if not v_admin and _is_internal then raise exception 'internal messages require admin'; end if;
  if not v_admin and v_ticket.status not in ('open','in_progress') then raise exception 'ticket is closed'; end if;

  for v_path in select jsonb_array_elements_text(_attachment_paths)
  loop
    if char_length(v_path) > 500 or position('..' in v_path) > 0 then
      raise exception 'invalid attachment path';
    end if;
    if not v_admin and v_path not like ((select auth.uid())::text || '/' || _ticket_id::text || '/%') then
      raise exception 'attachment path does not belong to ticket';
    end if;
    if not exists(
      select 1
      from storage.objects o
      where o.bucket_id = 'support-attachments'
        and o.name = v_path
    ) then
      raise exception 'attachment not found';
    end if;
  end loop;

  insert into public.support_messages(ticket_id,sender_user_id,message,attachment_paths,is_internal)
  values(
    _ticket_id,
    (select auth.uid()),
    case when char_length(v_message)=0 then 'Anexo enviado.' else v_message end,
    _attachment_paths,
    _is_internal
  )
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.add_support_message(uuid,text,jsonb,boolean) from public, anon;
grant execute on function public.add_support_message(uuid,text,jsonb,boolean) to authenticated, service_role;
