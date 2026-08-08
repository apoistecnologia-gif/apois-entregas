-- APOIS ENTREGAS — idempotent in-app notification generation from trusted database events.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_key_unique_idx
  ON public.notifications(event_key) WHERE event_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  _user_id uuid,
  _notification_type text,
  _title text,
  _body text,
  _data jsonb DEFAULT '{}'::jsonb,
  _event_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE v_id uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;
  IF NULLIF(btrim(_notification_type),'') IS NULL OR NULLIF(btrim(_title),'') IS NULL OR NULLIF(btrim(_body),'') IS NULL THEN
    RAISE EXCEPTION 'invalid notification';
  END IF;
  IF jsonb_typeof(_data) <> 'object' THEN RAISE EXCEPTION 'notification data must be an object'; END IF;

  INSERT INTO public.notifications(user_id,notification_type,title,body,data,event_key)
  VALUES(_user_id,btrim(_notification_type),btrim(_title),btrim(_body),_data,NULLIF(btrim(_event_key),''))
  ON CONFLICT(event_key) WHERE event_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL AND _event_key IS NOT NULL THEN
    SELECT n.id INTO v_id FROM public.notifications n WHERE n.event_key=_event_key;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_notification(uuid,text,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification(uuid,text,text,text,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_title text;
  v_body text;
  v_member record;
  v_key_suffix text;
BEGIN
  IF TG_OP='INSERT' THEN
    v_title := 'Pedido recebido';
    v_body := 'Seu pedido #'||NEW.order_number::text||' foi recebido.';
    PERFORM public.enqueue_notification(
      NEW.customer_user_id,'order_received',v_title,v_body,
      jsonb_build_object('orderId',NEW.id,'orderNumber',NEW.order_number,'status',NEW.status),
      'order:'||NEW.id::text||':customer:created'
    );

    FOR v_member IN
      SELECT mm.user_id
      FROM public.merchant_members mm
      JOIN public.profiles p ON p.id=mm.user_id
      WHERE mm.merchant_id=NEW.merchant_id AND mm.status='active' AND p.is_active=true
    LOOP
      PERFORM public.enqueue_notification(
        v_member.user_id,'new_order','Novo pedido','Pedido #'||NEW.order_number::text||' chegou para o estabelecimento.',
        jsonb_build_object('orderId',NEW.id,'orderNumber',NEW.order_number,'status',NEW.status),
        'order:'||NEW.id::text||':merchant:'||v_member.user_id::text||':created'
      );
    END LOOP;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_title := CASE NEW.status
      WHEN 'accepted' THEN 'Pedido aceito'
      WHEN 'preparing' THEN 'Pedido em preparo'
      WHEN 'ready' THEN 'Pedido pronto'
      WHEN 'ready_for_pickup' THEN 'Pedido pronto para coleta'
      WHEN 'searching_driver' THEN 'Buscando entregador'
      WHEN 'driver_assigned' THEN 'Entregador encontrado'
      WHEN 'driver_arriving_store' THEN 'Entregador indo ao estabelecimento'
      WHEN 'picked_up' THEN 'Pedido coletado'
      WHEN 'out_for_delivery' THEN 'Saiu para entrega'
      WHEN 'on_the_way' THEN 'Pedido a caminho'
      WHEN 'delivered' THEN 'Pedido entregue'
      WHEN 'cancelled' THEN 'Pedido cancelado'
      WHEN 'refunded' THEN 'Pedido reembolsado'
      ELSE 'Pedido atualizado'
    END;
    v_body := CASE NEW.status
      WHEN 'delivered' THEN 'Seu pedido #'||NEW.order_number::text||' foi entregue.'
      WHEN 'cancelled' THEN 'O pedido #'||NEW.order_number::text||' foi cancelado.'
      ELSE 'O pedido #'||NEW.order_number::text||' agora está: '||replace(NEW.status,'_',' ')||'.'
    END;
    v_key_suffix := 'status:'||NEW.status;
    PERFORM public.enqueue_notification(
      NEW.customer_user_id,'order_status',v_title,v_body,
      jsonb_build_object('orderId',NEW.id,'orderNumber',NEW.order_number,'status',NEW.status),
      'order:'||NEW.id::text||':customer:'||v_key_suffix
    );
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    PERFORM public.enqueue_notification(
      NEW.customer_user_id,'payment_status',
      CASE WHEN NEW.payment_status='paid' THEN 'Pagamento confirmado' ELSE 'Pagamento atualizado' END,
      'O pagamento do pedido #'||NEW.order_number::text||' está '||replace(NEW.payment_status,'_',' ')||'.',
      jsonb_build_object('orderId',NEW.id,'orderNumber',NEW.order_number,'paymentStatus',NEW.payment_status),
      'order:'||NEW.id::text||':customer:payment:'||NEW.payment_status
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_generate_notifications ON public.orders;
CREATE TRIGGER orders_generate_notifications
AFTER INSERT OR UPDATE OF status,payment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_order_change();

CREATE OR REPLACE FUNCTION public.notify_delivery_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_user_id uuid;
  v_order_number bigint;
  v_merchant_name text;
BEGIN
  IF NEW.status <> 'offered' THEN RETURN NEW; END IF;
  SELECT c.user_id INTO v_user_id FROM public.couriers c WHERE c.id=NEW.courier_id;
  SELECT o.order_number,m.name INTO v_order_number,v_merchant_name
  FROM public.delivery_jobs dj
  JOIN public.orders o ON o.id=dj.order_id
  JOIN public.merchants m ON m.id=dj.merchant_id
  WHERE dj.id=NEW.delivery_job_id;

  PERFORM public.enqueue_notification(
    v_user_id,'delivery_offer','Nova entrega',
    'Nova entrega de '||COALESCE(v_merchant_name,'estabelecimento')||' disponível para aceite.',
    jsonb_build_object('offerId',NEW.id,'deliveryJobId',NEW.delivery_job_id,'orderNumber',v_order_number,'expiresAt',NEW.expires_at),
    'delivery-offer:'||NEW.id::text||':offered:'||extract(epoch FROM NEW.offered_at)::bigint::text
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS delivery_offers_generate_notifications ON public.delivery_offers;
CREATE TRIGGER delivery_offers_generate_notifications
AFTER INSERT OR UPDATE OF status,offered_at ON public.delivery_offers
FOR EACH ROW EXECUTE FUNCTION public.notify_delivery_offer();

CREATE OR REPLACE FUNCTION public.notify_support_critical()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE v_admin record;
BEGIN
  IF NEW.priority NOT IN ('high','critical') THEN RETURN NEW; END IF;
  FOR v_admin IN
    SELECT ur.user_id
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id=ur.user_id
    WHERE ur.role='admin'::public.app_role AND p.is_active=true
  LOOP
    PERFORM public.enqueue_notification(
      v_admin.user_id,'support_alert','Alerta de suporte',NEW.subject,
      jsonb_build_object('ticketId',NEW.id,'priority',NEW.priority,'status',NEW.status),
      'support:'||NEW.id::text||':admin:'||v_admin.user_id::text||':'||NEW.priority
    );
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS support_generate_admin_notifications ON public.support_tickets;
CREATE TRIGGER support_generate_admin_notifications
AFTER INSERT OR UPDATE OF priority ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_support_critical();
