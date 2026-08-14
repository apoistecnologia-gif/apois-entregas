create or replace function public.notify_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_member record;
  v_key_suffix text;
begin
  if tg_op = 'INSERT' then
    if new.payment_status = 'paid' then
      perform public.enqueue_notification(
        new.customer_user_id,
        'order_received',
        'Pedido confirmado',
        'Seu pagamento foi confirmado e o pedido #' || new.order_number::text || ' já pode ser atendido.',
        jsonb_build_object(
          'orderId', new.id,
          'orderNumber', new.order_number,
          'status', new.status,
          'paymentStatus', new.payment_status
        ),
        'order:' || new.id::text || ':customer:created'
      );
    else
      perform public.enqueue_notification(
        new.customer_user_id,
        'order_received',
        'Pedido criado',
        'Aguardando a confirmação do pagamento do pedido #' || new.order_number::text || '.',
        jsonb_build_object(
          'orderId', new.id,
          'orderNumber', new.order_number,
          'status', new.status,
          'paymentStatus', new.payment_status
        ),
        'order:' || new.id::text || ':customer:created'
      );
    end if;

    if new.payment_status = 'paid' and new.status not in ('cancelled', 'refunded') then
      for v_member in
        select mm.user_id
        from public.merchant_members mm
        join public.profiles p on p.id = mm.user_id
        where mm.merchant_id = new.merchant_id
          and mm.status = 'active'
          and p.is_active = true
      loop
        perform public.enqueue_notification(
          v_member.user_id,
          'new_order',
          'Novo pedido',
          'Pedido #' || new.order_number::text || ' está pago e pronto para atendimento.',
          jsonb_build_object(
            'orderId', new.id,
            'orderNumber', new.order_number,
            'status', new.status,
            'paymentStatus', new.payment_status
          ),
          'order:' || new.id::text || ':merchant:' || v_member.user_id::text || ':paid'
        );
      end loop;
    end if;

    return new;
  end if;

  if new.status is not distinct from old.status
     and new.payment_status is not distinct from old.payment_status then
    return new;
  end if;

  if new.status is distinct from old.status then
    v_title := case new.status
      when 'accepted' then 'Pedido aceito'
      when 'preparing' then 'Pedido em preparo'
      when 'ready' then 'Pedido pronto'
      when 'ready_for_pickup' then 'Pedido pronto para coleta'
      when 'searching_driver' then 'Buscando entregador'
      when 'driver_assigned' then 'Entregador encontrado'
      when 'driver_arriving_store' then 'Entregador indo ao estabelecimento'
      when 'picked_up' then 'Pedido coletado'
      when 'out_for_delivery' then 'Saiu para entrega'
      when 'on_the_way' then 'Pedido a caminho'
      when 'delivered' then 'Pedido entregue'
      when 'cancelled' then 'Pedido cancelado'
      when 'refunded' then 'Pedido reembolsado'
      else 'Pedido atualizado'
    end;
    v_body := case new.status
      when 'delivered' then 'Seu pedido #' || new.order_number::text || ' foi entregue.'
      when 'cancelled' then 'O pedido #' || new.order_number::text || ' foi cancelado.'
      else 'O pedido #' || new.order_number::text || ' agora está: ' || replace(new.status, '_', ' ') || '.'
    end;
    v_key_suffix := 'status:' || new.status;
    perform public.enqueue_notification(
      new.customer_user_id,
      'order_status',
      v_title,
      v_body,
      jsonb_build_object(
        'orderId', new.id,
        'orderNumber', new.order_number,
        'status', new.status,
        'paymentStatus', new.payment_status
      ),
      'order:' || new.id::text || ':customer:' || v_key_suffix
    );
  end if;

  if new.payment_status is distinct from old.payment_status then
    perform public.enqueue_notification(
      new.customer_user_id,
      'payment_status',
      case when new.payment_status = 'paid' then 'Pagamento confirmado' else 'Pagamento atualizado' end,
      'O pagamento do pedido #' || new.order_number::text || ' está ' || replace(new.payment_status, '_', ' ') || '.',
      jsonb_build_object(
        'orderId', new.id,
        'orderNumber', new.order_number,
        'status', new.status,
        'paymentStatus', new.payment_status
      ),
      'order:' || new.id::text || ':customer:payment:' || new.payment_status
    );

    if new.payment_status = 'paid' and new.status not in ('cancelled', 'refunded') then
      for v_member in
        select mm.user_id
        from public.merchant_members mm
        join public.profiles p on p.id = mm.user_id
        where mm.merchant_id = new.merchant_id
          and mm.status = 'active'
          and p.is_active = true
      loop
        perform public.enqueue_notification(
          v_member.user_id,
          'new_order',
          'Novo pedido',
          'Pedido #' || new.order_number::text || ' está pago e pronto para atendimento.',
          jsonb_build_object(
            'orderId', new.id,
            'orderNumber', new.order_number,
            'status', new.status,
            'paymentStatus', new.payment_status
          ),
          'order:' || new.id::text || ':merchant:' || v_member.user_id::text || ':paid'
        );
      end loop;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_order_change() from public, anon, authenticated;
grant execute on function public.notify_order_change() to service_role;
