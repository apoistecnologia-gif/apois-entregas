-- APOIS ENTREGAS — reviews, notifications, push devices and support tickets.

ALTER TABLE public.couriers
  ADD COLUMN rating numeric(3,2) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  ADD COLUMN review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0);

CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  merchant_rating smallint CHECK (merchant_rating IS NULL OR merchant_rating BETWEEN 1 AND 5),
  courier_rating smallint CHECK (courier_rating IS NULL OR courier_rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, customer_user_id),
  CHECK (merchant_rating IS NOT NULL OR courier_rating IS NOT NULL)
);
CREATE INDEX reviews_merchant_created_idx ON public.reviews(merchant_id, created_at DESC);
CREATE INDEX reviews_courier_created_idx ON public.reviews(courier_id, created_at DESC) WHERE courier_id IS NOT NULL;
CREATE TRIGGER reviews_set_updated_at BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Recalculate aggregate ratings from source reviews to avoid incremental drift.
CREATE OR REPLACE FUNCTION public.recalculate_review_aggregates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_merchant_id uuid := COALESCE(NEW.merchant_id, OLD.merchant_id);
  v_courier_id uuid := COALESCE(NEW.courier_id, OLD.courier_id);
BEGIN
  UPDATE public.merchants m
  SET rating = COALESCE((
        SELECT round(avg(r.merchant_rating)::numeric, 2)
        FROM public.reviews r
        WHERE r.merchant_id = v_merchant_id AND r.merchant_rating IS NOT NULL
      ), 0),
      review_count = (
        SELECT count(*)::integer
        FROM public.reviews r
        WHERE r.merchant_id = v_merchant_id AND r.merchant_rating IS NOT NULL
      )
  WHERE m.id = v_merchant_id;

  IF v_courier_id IS NOT NULL THEN
    UPDATE public.couriers c
    SET rating = COALESCE((
          SELECT round(avg(r.courier_rating)::numeric, 2)
          FROM public.reviews r
          WHERE r.courier_id = v_courier_id AND r.courier_rating IS NOT NULL
        ), 0),
        review_count = (
          SELECT count(*)::integer
          FROM public.reviews r
          WHERE r.courier_id = v_courier_id AND r.courier_rating IS NOT NULL
        )
    WHERE c.id = v_courier_id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.courier_id IS DISTINCT FROM NEW.courier_id AND OLD.courier_id IS NOT NULL THEN
    UPDATE public.couriers c
    SET rating = COALESCE((
          SELECT round(avg(r.courier_rating)::numeric, 2)
          FROM public.reviews r
          WHERE r.courier_id = OLD.courier_id AND r.courier_rating IS NOT NULL
        ), 0),
        review_count = (
          SELECT count(*)::integer
          FROM public.reviews r
          WHERE r.courier_id = OLD.courier_id AND r.courier_rating IS NOT NULL
        )
    WHERE c.id = OLD.courier_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER reviews_recalculate_aggregates
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.recalculate_review_aggregates();

CREATE OR REPLACE FUNCTION public.submit_order_review(
  _order_id uuid,
  _merchant_rating smallint,
  _courier_rating smallint DEFAULT NULL,
  _comment text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_courier_id uuid;
  v_review_id uuid;
BEGIN
  SELECT * INTO v_order
  FROM public.orders o
  WHERE o.id=_order_id AND o.customer_user_id=(SELECT auth.uid())
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_order.status <> 'delivered' THEN RAISE EXCEPTION 'order is not delivered'; END IF;
  IF _merchant_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'invalid merchant rating'; END IF;
  IF _courier_rating IS NOT NULL AND _courier_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'invalid courier rating'; END IF;
  IF _comment IS NOT NULL AND char_length(_comment) > 1000 THEN RAISE EXCEPTION 'comment is too long'; END IF;

  SELECT dj.courier_id INTO v_courier_id
  FROM public.delivery_jobs dj WHERE dj.order_id=_order_id;

  IF EXISTS (SELECT 1 FROM public.reviews r WHERE r.order_id=_order_id AND r.customer_user_id=(SELECT auth.uid())) THEN
    RAISE EXCEPTION 'order already reviewed';
  END IF;

  INSERT INTO public.reviews(
    order_id,customer_user_id,merchant_id,courier_id,merchant_rating,courier_rating,comment
  ) VALUES (
    _order_id,(SELECT auth.uid()),v_order.merchant_id,v_courier_id,_merchant_rating,
    CASE WHEN v_courier_id IS NULL THEN NULL ELSE _courier_rating END,
    NULLIF(btrim(_comment),'')
  ) RETURNING id INTO v_review_id;

  RETURN v_review_id;
END;
$$;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (btrim(notification_type) <> ''),
  title text NOT NULL CHECK (btrim(title) <> ''),
  body text NOT NULL CHECK (btrim(body) <> ''),
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data)='object'),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('android','ios','web')),
  token text NOT NULL UNIQUE CHECK (btrim(token) <> ''),
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_devices_user_active_idx ON public.push_devices(user_id, is_active);
CREATE TRIGGER push_devices_set_updated_at BEFORE UPDATE ON public.push_devices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.mark_notification_read(_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.notifications
  SET read_at=COALESCE(read_at,now())
  WHERE id=_notification_id AND user_id=(SELECT auth.uid());
  RETURN FOUND;
END;
$$;

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  delivery_job_id uuid REFERENCES public.delivery_jobs(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (btrim(category) <> ''),
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 1 AND 200),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 5000),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  assigned_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_status_priority_idx ON public.support_tickets(status, priority, created_at);
CREATE INDEX support_tickets_requester_idx ON public.support_tickets(requester_user_id, created_at DESC);
CREATE TRIGGER support_tickets_set_updated_at BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 5000),
  attachment_paths jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachment_paths)='array'),
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_ticket_created_idx ON public.support_messages(ticket_id, created_at);

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  _category text,
  _subject text,
  _description text,
  _order_id uuid DEFAULT NULL,
  _delivery_job_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_ticket_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NULLIF(btrim(_category),'') IS NULL THEN RAISE EXCEPTION 'category is required'; END IF;
  IF char_length(btrim(COALESCE(_subject,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid subject'; END IF;
  IF char_length(btrim(COALESCE(_description,''))) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'invalid description'; END IF;

  IF _order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id=_order_id AND (
      o.customer_user_id=(SELECT auth.uid()) OR
      public.current_user_is_merchant_member(o.merchant_id) OR
      EXISTS (SELECT 1 FROM public.delivery_jobs dj WHERE dj.order_id=o.id AND dj.courier_id=public.current_user_courier_id())
    )
  ) THEN RAISE EXCEPTION 'order access required'; END IF;

  IF _delivery_job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.delivery_jobs dj
    JOIN public.orders o ON o.id=dj.order_id
    WHERE dj.id=_delivery_job_id AND (
      o.customer_user_id=(SELECT auth.uid()) OR
      public.current_user_is_merchant_member(dj.merchant_id) OR
      dj.courier_id=public.current_user_courier_id()
    )
  ) THEN RAISE EXCEPTION 'delivery access required'; END IF;

  INSERT INTO public.support_tickets(
    requester_user_id,order_id,delivery_job_id,category,subject,description,priority,status
  ) VALUES (
    (SELECT auth.uid()),_order_id,_delivery_job_id,btrim(_category),btrim(_subject),btrim(_description),'normal','open'
  ) RETURNING id INTO v_ticket_id;
  RETURN v_ticket_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_support_message(
  _ticket_id uuid,
  _message text,
  _attachment_paths jsonb DEFAULT '[]'::jsonb,
  _is_internal boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_ticket public.support_tickets; v_id uuid; v_admin boolean;
BEGIN
  IF char_length(btrim(COALESCE(_message,''))) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'invalid message'; END IF;
  IF jsonb_typeof(_attachment_paths) <> 'array' THEN RAISE EXCEPTION 'attachments must be an array'; END IF;
  v_admin := public.current_user_is_admin();
  SELECT * INTO v_ticket FROM public.support_tickets t WHERE t.id=_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket not found'; END IF;
  IF NOT v_admin AND v_ticket.requester_user_id IS DISTINCT FROM (SELECT auth.uid()) THEN RAISE EXCEPTION 'ticket access required'; END IF;
  IF NOT v_admin AND _is_internal THEN RAISE EXCEPTION 'internal messages require admin'; END IF;
  IF NOT v_admin AND v_ticket.status NOT IN ('open','in_progress') THEN RAISE EXCEPTION 'ticket is closed'; END IF;

  INSERT INTO public.support_messages(ticket_id,sender_user_id,message,attachment_paths,is_internal)
  VALUES(_ticket_id,(SELECT auth.uid()),btrim(_message),_attachment_paths,_is_internal)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_support_ticket(
  _ticket_id uuid,
  _status text DEFAULT NULL,
  _priority text DEFAULT NULL,
  _assigned_admin_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_before jsonb; v_after jsonb;
BEGIN
  IF NOT public.current_user_is_admin() THEN RAISE EXCEPTION 'admin access required'; END IF;
  IF _status IS NOT NULL AND _status NOT IN ('open','in_progress','resolved','closed') THEN RAISE EXCEPTION 'invalid ticket status'; END IF;
  IF _priority IS NOT NULL AND _priority NOT IN ('low','normal','high','critical') THEN RAISE EXCEPTION 'invalid priority'; END IF;
  IF _assigned_admin_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_assigned_admin_id AND ur.role='admin'::public.app_role
  ) THEN RAISE EXCEPTION 'assigned user is not an admin'; END IF;

  SELECT to_jsonb(t) INTO v_before FROM public.support_tickets t WHERE t.id=_ticket_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'ticket not found'; END IF;

  UPDATE public.support_tickets t
  SET status=COALESCE(_status,t.status),
      priority=COALESCE(_priority,t.priority),
      assigned_admin_id=COALESCE(_assigned_admin_id,t.assigned_admin_id),
      resolved_at=CASE WHEN _status='resolved' THEN now() WHEN _status IS NOT NULL AND _status<>'resolved' THEN NULL ELSE t.resolved_at END,
      closed_at=CASE WHEN _status='closed' THEN now() WHEN _status IS NOT NULL AND _status<>'closed' THEN NULL ELSE t.closed_at END
  WHERE t.id=_ticket_id
  RETURNING to_jsonb(t) INTO v_after;

  INSERT INTO public.admin_audit_logs(admin_id,action,entity_type,entity_id,before_data,after_data)
  VALUES((SELECT auth.uid()),'update_support_ticket','support_ticket',_ticket_id::text,v_before,v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_order_review(uuid,smallint,smallint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.create_support_ticket(text,text,text,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.add_support_message(uuid,text,jsonb,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_update_support_ticket(uuid,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_order_review(uuid,smallint,smallint,text),public.mark_notification_read(uuid),
  public.create_support_ticket(text,text,text,uuid,uuid),public.add_support_message(uuid,text,jsonb,boolean),
  public.admin_update_support_ticket(uuid,text,text,uuid) TO authenticated,service_role;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers view own reviews" ON public.reviews FOR SELECT TO authenticated
USING (customer_user_id=(SELECT auth.uid()) OR public.current_user_is_admin());
CREATE POLICY "Merchants view their reviews" ON public.reviews FOR SELECT TO authenticated
USING (public.current_user_is_merchant_member(merchant_id));
CREATE POLICY "Couriers view their reviews" ON public.reviews FOR SELECT TO authenticated
USING (courier_id=public.current_user_courier_id());

CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT TO authenticated
USING (user_id=(SELECT auth.uid()) OR public.current_user_is_admin());

CREATE POLICY "Users view own push devices" ON public.push_devices FOR SELECT TO authenticated
USING (user_id=(SELECT auth.uid()) OR public.current_user_is_admin());
CREATE POLICY "Users register own push devices" ON public.push_devices FOR INSERT TO authenticated
WITH CHECK (user_id=(SELECT auth.uid()));
CREATE POLICY "Users update own push devices" ON public.push_devices FOR UPDATE TO authenticated
USING (user_id=(SELECT auth.uid())) WITH CHECK (user_id=(SELECT auth.uid()));
CREATE POLICY "Users delete own push devices" ON public.push_devices FOR DELETE TO authenticated
USING (user_id=(SELECT auth.uid()));

CREATE POLICY "Users view own support tickets" ON public.support_tickets FOR SELECT TO authenticated
USING (requester_user_id=(SELECT auth.uid()) OR public.current_user_is_admin());
CREATE POLICY "Ticket participants view messages" ON public.support_messages FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.support_tickets t
  WHERE t.id=support_messages.ticket_id
    AND (t.requester_user_id=(SELECT auth.uid()) OR public.current_user_is_admin())
    AND (NOT support_messages.is_internal OR public.current_user_is_admin())
));

REVOKE ALL ON public.reviews,public.notifications,public.push_devices,public.support_tickets,public.support_messages FROM anon,authenticated;
GRANT SELECT ON public.reviews,public.notifications,public.push_devices,public.support_tickets,public.support_messages TO authenticated;
GRANT INSERT,DELETE ON public.push_devices TO authenticated;
GRANT UPDATE (platform,token,is_active,last_seen_at) ON public.push_devices TO authenticated;
GRANT ALL ON public.reviews,public.notifications,public.push_devices,public.support_tickets,public.support_messages TO service_role;
