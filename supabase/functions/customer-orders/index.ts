import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function response(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return response(405, { error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" });

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return response(401, { error: "Autenticação obrigatória.", code: "UNAUTHORIZED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("customer-orders: Supabase environment is incomplete");
    return response(500, { error: "Serviço temporariamente indisponível.", code: "SERVER_CONFIGURATION" });
  }

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return response(401, { error: "Sessão inválida ou expirada.", code: "UNAUTHORIZED" });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return response(400, { error: "Requisição inválida.", code: "INVALID_REQUEST" });
  }
  if (!isRecord(payload)) return response(400, { error: "Requisição inválida.", code: "INVALID_REQUEST" });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (payload.action === "list") {
    const limit = typeof payload.limit === "number" && Number.isInteger(payload.limit)
      ? Math.min(Math.max(payload.limit, 1), 100)
      : 50;

    const { data, error } = await adminClient
      .from("orders")
      .select(`
        id,
        order_number,
        status,
        payment_method,
        payment_status,
        subtotal,
        delivery_fee,
        service_fee,
        discount,
        total,
        delivery_address,
        observation,
        created_at,
        updated_at,
        merchants (
          id,
          name,
          logo_url,
          delivery_min_minutes,
          delivery_max_minutes,
          delivery_fee
        ),
        order_items (
          id,
          product_id,
          product_name,
          product_description,
          base_price,
          unit_price,
          quantity,
          line_total,
          selected_options
        )
      `)
      .eq("customer_user_id", authData.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("customer-orders list failed", { code: error.code, userId: authData.user.id });
      return response(500, { error: "Não foi possível carregar seus pedidos.", code: "LIST_FAILED" });
    }

    return response(200, { orders: data ?? [] });
  }

  if (payload.action === "detail") {
    const orderId = payload.orderId;
    if (typeof orderId !== "string" || !UUID_RE.test(orderId)) {
      return response(400, { error: "Pedido inválido.", code: "INVALID_ORDER_ID" });
    }

    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select(`
        id,
        order_number,
        status,
        payment_method,
        payment_status,
        subtotal,
        delivery_fee,
        service_fee,
        platform_fee,
        merchant_net,
        courier_earnings,
        discount,
        total,
        delivery_address,
        observation,
        fulfillment_type,
        accepted_at,
        ready_at,
        delivered_at,
        cancelled_at,
        cancellation_reason,
        created_at,
        updated_at,
        merchants (
          id,
          name,
          logo_url,
          address_line,
          neighborhood,
          city,
          state,
          delivery_min_minutes,
          delivery_max_minutes,
          delivery_fee
        ),
        order_items (
          id,
          product_id,
          product_name,
          product_description,
          base_price,
          unit_price,
          quantity,
          line_total,
          selected_options
        ),
        order_status_history (
          id,
          status,
          changed_by_user_id,
          created_at
        )
      `)
      .eq("id", orderId)
      .eq("customer_user_id", authData.user.id)
      .single();

    if (orderError || !order) {
      const notFound = orderError?.code === "PGRST116";
      if (!notFound) console.error("customer-orders detail failed", { code: orderError?.code, orderId });
      return response(notFound ? 404 : 500, {
        error: notFound ? "Pedido não encontrado." : "Não foi possível carregar o pedido.",
        code: notFound ? "NOT_FOUND" : "DETAIL_FAILED",
      });
    }

    const { data: deliveryJob, error: deliveryError } = await adminClient
      .from("delivery_jobs")
      .select(`
        id,
        status,
        courier_id,
        pickup_address,
        delivery_address,
        pickup_latitude,
        pickup_longitude,
        delivery_latitude,
        delivery_longitude,
        estimated_distance_meters,
        estimated_duration_seconds,
        estimated_earnings,
        accepted_at,
        pickup_arrived_at,
        picked_up_at,
        destination_arrived_at,
        delivered_at,
        couriers (
          id,
          user_id,
          photo_url,
          vehicle_type,
          vehicle_model,
          vehicle_plate,
          rating,
          review_count
        )
      `)
      .eq("order_id", orderId)
      .maybeSingle();

    if (deliveryError) {
      console.error("customer-orders delivery detail failed", { code: deliveryError.code, orderId });
    }

    let delivery = deliveryJob ?? null;
    const courierRelation = deliveryJob?.couriers;
    const courier = Array.isArray(courierRelation) ? courierRelation[0] : courierRelation;
    if (courier?.user_id) {
      const { data: courierProfile, error: profileError } = await adminClient
        .from("profiles")
        .select("full_name, phone, avatar_url")
        .eq("id", courier.user_id)
        .maybeSingle();
      if (profileError) {
        console.error("customer-orders courier profile failed", { code: profileError.code, orderId });
      }
      delivery = {
        ...deliveryJob,
        couriers: {
          ...courier,
          profile: courierProfile ?? null,
        },
      };
    }

    let pin: string | null = null;
    if (deliveryJob && !["delivered", "cancelled"].includes(deliveryJob.status)) {
      const { data: secret, error: secretError } = await adminClient
        .from("delivery_confirmation_secrets")
        .select("pin_code")
        .eq("order_id", orderId)
        .maybeSingle();
      if (secretError) console.error("customer-orders PIN load failed", { code: secretError.code, orderId });
      pin = secret?.pin_code ?? null;
    }

    return response(200, {
      order: {
        ...order,
        delivery,
        deliveryPin: pin,
      },
    });
  }

  return response(400, { error: "Ação inválida.", code: "INVALID_ACTION" });
});
