create or replace function public.notify_order_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_courier_user_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.payment_status = 'paid' then
      insert into public.notifications(user_id,title,body,data)
      values (
        new.customer_user_id,
        'Pedido confirmado',
        'Seu pagamento foi confirmado e o estabelecimento já recebeu o pedido #' || new.order_number || '.',
        jsonb_build_object('order_id',new.id,'status',new.status,'payment_status',new.payment_status)
      );

      insert into public.notifications(user_id,title,body,data)
      select mm.user_id,
             'Novo pedido',
             'O pedido #' || new.order_number || ' está pago e pronto para atendimento.',
             jsonb_build_object('order_id',new.id,'status',new.status,'payment_status',new.payment_status)
      from public.merchant_members mm
      where mm.merchant_id = new.merchant_id and mm.status = 'active';
    else
      insert into public.notifications(user_id,title,body,data)
      values (
        new.customer_user_id,
        'Pedido criado',
        'Aguardando a confirmação do pagamento do pedido #' || new.order_number || '.',
        jsonb_build_object('order_id',new.id,'status',new.status,'payment_status',new.payment_status)
      );
    end if;

    return new;
  end if;

  if new.payment_status is distinct from old.payment_status and new.payment_status = 'paid' then
    insert into public.notifications(user_id,title,body,data)
    values (
      new.customer_user_id,
      'Pagamento confirmado',
      'O pagamento do pedido #' || new.order_number || ' foi confirmado.',
      jsonb_build_object('order_id',new.id,'status',new.status,'payment_status',new.payment_status)
    );

    if new.status = 'confirmed' then
      insert into public.notifications(user_id,title,body,data)
      select mm.user_id,
             'Novo pedido',
             'O pedido #' || new.order_number || ' está pago e pronto para atendimento.',
             jsonb_build_object('order_id',new.id,'status',new.status,'payment_status',new.payment_status)
      from public.merchant_members mm
      where mm.merchant_id = new.merchant_id and mm.status = 'active';
    end if;
  end if;

  if new.status is distinct from old.status then
    v_title := 'Pedido atualizado';
    v_body := 'O pedido #' || new.order_number || ' mudou para ' || new.status || '.';
    insert into public.notifications(user_id,title,body,data)
    values (
      new.customer_user_id,
      v_title,
      v_body,
      jsonb_build_object('order_id',new.id,'status',new.status,'payment_status',new.payment_status)
    );
  end if;

  if new.courier_id is distinct from old.courier_id and new.courier_id is not null then
    select c.user_id into v_courier_user_id from public.couriers c where c.id = new.courier_id;
    if v_courier_user_id is not null then
      insert into public.notifications(user_id,title,body,data)
      values (
        v_courier_user_id,
        'Entrega atribuída',
        'Você foi vinculado ao pedido #' || new.order_number || '.',
        jsonb_build_object('order_id',new.id,'status',new.status)
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_order_lifecycle() from public, anon, authenticated;
grant execute on function public.notify_order_lifecycle() to service_role;
