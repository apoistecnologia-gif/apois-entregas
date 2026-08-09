create or replace function public.admin_reply_support_ticket(
  _ticket_id uuid,
  _message text,
  _is_internal boolean default false,
  _set_in_progress boolean default true
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ticket public.support_tickets;
  v_message_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_message text := btrim(coalesce(_message, ''));
begin
  if not public.current_user_is_admin() then
    raise exception 'admin access required';
  end if;

  if char_length(v_message) not between 1 and 5000 then
    raise exception 'invalid message';
  end if;

  select *
  into v_ticket
  from public.support_tickets t
  where t.id = _ticket_id
  for update;

  if not found then
    raise exception 'ticket not found';
  end if;

  if v_ticket.status = 'closed' then
    raise exception 'ticket is closed';
  end if;

  v_before := to_jsonb(v_ticket);

  insert into public.support_messages(
    ticket_id,
    sender_user_id,
    message,
    attachment_paths,
    is_internal
  ) values (
    _ticket_id,
    (select auth.uid()),
    v_message,
    '[]'::jsonb,
    _is_internal
  )
  returning id into v_message_id;

  if _set_in_progress and v_ticket.status = 'open' then
    update public.support_tickets t
    set
      status = 'in_progress',
      assigned_admin_id = coalesce(t.assigned_admin_id, (select auth.uid())),
      updated_at = now()
    where t.id = _ticket_id
    returning to_jsonb(t) into v_after;
  else
    update public.support_tickets t
    set
      assigned_admin_id = coalesce(t.assigned_admin_id, (select auth.uid())),
      updated_at = now()
    where t.id = _ticket_id
    returning to_jsonb(t) into v_after;
  end if;

  insert into public.admin_audit_logs(
    admin_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) values (
    (select auth.uid()),
    case when _is_internal then 'add_support_internal_note' else 'reply_support_ticket' end,
    'support_ticket',
    _ticket_id::text,
    v_before,
    v_after || jsonb_build_object('message_id', v_message_id, 'is_internal', _is_internal)
  );

  return v_message_id;
end;
$function$;

revoke all on function public.admin_reply_support_ticket(uuid,text,boolean,boolean) from public;
revoke all on function public.admin_reply_support_ticket(uuid,text,boolean,boolean) from anon;
grant execute on function public.admin_reply_support_ticket(uuid,text,boolean,boolean) to authenticated;
