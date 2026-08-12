import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const reply = (status: number, body: JsonRecord) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" });

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply(401, { error: "Autenticação obrigatória.", code: "UNAUTHORIZED" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return reply(500, { error: "Serviço temporariamente indisponível.", code: "SERVER_CONFIGURATION" });

  const auth = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await auth.auth.getUser(authorization.slice(7));
  if (authError || !authData.user) return reply(401, { error: "Sessão inválida ou expirada.", code: "UNAUTHORIZED" });

  const payload = await request.json().catch(() => null);
  if (!isRecord(payload) || typeof payload.orderId !== "string" || !UUID_RE.test(payload.orderId)) {
    return reply(400, { error: "Pedido inválido.", code: "INVALID_ORDER_ID" });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,customer_user_id,status,payment_status,total")
    .eq("id", payload.orderId)
    .eq("customer_user_id", authData.user.id)
    .maybeSingle();
  if (orderError) return reply(500, { error: "Não foi possível consultar o pedido.", code: "ORDER_LOOKUP_FAILED" });
  if (!order) return reply(404, { error: "Pedido não encontrado.", code: "ORDER_NOT_FOUND" });

  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .select("id,provider,provider_charge_id,status,amount,paid_at")
    .eq("order_id", order.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentError) return reply(500, { error: "Não foi possível consultar o pagamento.", code: "PAYMENT_LOOKUP_FAILED" });
  if (!payment?.provider_charge_id) return reply(404, { error: "Pagamento não encontrado.", code: "PAYMENT_NOT_FOUND" });

  if (payment.status === "paid" && order.payment_status === "paid") {
    return reply(200, { paymentStatus: "paid", providerStatus: "confirmed", reconciled: false, provider: payment.provider });
  }
  if (payment.status === "refunded" || order.payment_status === "refunded") {
    return reply(200, { paymentStatus: "refunded", providerStatus: "refunded", reconciled: false, provider: payment.provider });
  }

  if (payment.provider === "asaas") {
    return await reconcileAsaas({ admin, order, payment });
  }
  if (payment.provider === "mercadopago") {
    return await reconcileMercadoPago({ admin, order, payment });
  }

  return reply(409, { error: "Provedor deste pagamento não suportado para conciliação.", code: "UNSUPPORTED_PROVIDER" });
});

async function reconcileAsaas({ admin, order, payment }: any) {
  const environment = (Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox").trim().toLowerCase();
  const apiKey = environment === "production"
    ? Deno.env.get("ASAAS_API_KEY_PRODUCTION")?.trim()
    : (Deno.env.get("ASAAS_API_KEY_SANDBOX")?.trim() || Deno.env.get("ASAAS_API_KEY")?.trim());
  if (!apiKey) return reply(503, { error: "Credencial Asaas não configurada.", code: "PAYMENT_PROVIDER_NOT_CONFIGURED" });

  const apiBase = environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  const providerResponse = await fetch(`${apiBase}/payments/${encodeURIComponent(payment.provider_charge_id)}`, {
    headers: { access_token: apiKey, Accept: "application/json" },
  });
  const providerPayment = await providerResponse.json().catch(() => null);
  if (!providerResponse.ok || !isRecord(providerPayment)) {
    return reply(502, { error: "Não foi possível confirmar o PIX no Asaas agora.", code: "PROVIDER_LOOKUP_FAILED" });
  }
  if (text(providerPayment.id) !== payment.provider_charge_id) return reply(409, { error: "Pagamento divergente no Asaas.", code: "PROVIDER_RESOURCE_MISMATCH" });

  const externalReference = text(providerPayment.externalReference) ?? text(providerPayment.external_reference);
  if (externalReference && externalReference !== `apois-order-${order.id}`) {
    return reply(409, { error: "Referência do pagamento divergente.", code: "EXTERNAL_REFERENCE_MISMATCH" });
  }
  const providerAmount = Number(providerPayment.value);
  if (!Number.isFinite(providerAmount) || Math.round(providerAmount * 100) !== Math.round(Number(payment.amount) * 100)) {
    return reply(409, { error: "Valor do pagamento divergente.", code: "AMOUNT_MISMATCH" });
  }

  const providerStatus = (text(providerPayment.status) ?? "UNKNOWN").toUpperCase();
  const paid = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(providerStatus);
  const refunded = ["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS", "PARTIALLY_REFUNDED"].includes(providerStatus);
  const failed = ["OVERDUE", "DELETED", "CANCELED", "CANCELLED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"].includes(providerStatus);
  const processing = ["PENDING", "AWAITING_RISK_ANALYSIS"].includes(providerStatus);
  const now = new Date().toISOString();

  if (paid) {
    await admin.from("payments").update({ status: "paid", paid_at: payment.paid_at ?? now, failed_at: null, failure_reason: null }).eq("id", payment.id).neq("status", "refunded");
    if (!["cancelled", "refunded"].includes(order.status)) await admin.from("orders").update({ payment_status: "paid" }).eq("id", order.id);
  } else if (refunded) {
    await admin.from("payments").update({ status: "refunded" }).eq("id", payment.id);
    await admin.from("orders").update({ payment_status: "refunded" }).eq("id", order.id);
  } else if (failed) {
    await admin.from("payments").update({ status: "failed", failed_at: now, failure_reason: providerStatus }).eq("id", payment.id).in("status", ["pending", "processing"]);
    if (order.payment_status !== "paid") await admin.from("orders").update({ payment_status: "failed" }).eq("id", order.id);
  } else if (processing) {
    await admin.from("payments").update({ status: "processing" }).eq("id", payment.id).eq("status", "pending");
  }

  const eventId = `customer-reconcile:${payment.provider_charge_id}:${providerStatus}`;
  await admin.from("payment_events").upsert({
    provider: "asaas",
    provider_event_id: eventId,
    event_type: "payment.reconciled",
    payment_id: payment.id,
    payload: { source: "authenticated_customer_reconciliation", payment: providerPayment },
    status: "processed",
    processed_at: now,
  }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });

  const paymentStatus = paid ? "paid" : refunded ? "refunded" : failed ? "failed" : processing ? "processing" : payment.status;
  return reply(200, { paymentStatus, providerStatus, reconciled: true, provider: "asaas" });
}

async function reconcileMercadoPago({ admin, order, payment }: any) {
  const environment = (Deno.env.get("MERCADO_PAGO_ENVIRONMENT") ?? "test").trim().toLowerCase();
  const testMode = environment !== "production";
  const accessToken = testMode
    ? Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_TEST")?.trim() || Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")?.trim()
    : Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_PRODUCTION")?.trim();
  if (!accessToken) return reply(503, { error: "Credencial Mercado Pago não configurada.", code: "PAYMENT_PROVIDER_NOT_CONFIGURED" });

  const apiBase = (Deno.env.get("MERCADO_PAGO_API_URL") ?? "https://api.mercadopago.com").replace(/\/$/, "");
  const providerResponse = await fetch(`${apiBase}/v1/orders/${encodeURIComponent(payment.provider_charge_id)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const providerOrder = await providerResponse.json().catch(() => null);
  if (!providerResponse.ok || !isRecord(providerOrder)) return reply(502, { error: "Não foi possível confirmar o pagamento agora.", code: "PROVIDER_LOOKUP_FAILED" });
  if (text(providerOrder.id) !== payment.provider_charge_id) return reply(409, { error: "Pagamento divergente no provedor.", code: "PROVIDER_RESOURCE_MISMATCH" });

  const externalReference = text(providerOrder.external_reference);
  if (externalReference !== `apois-order-${order.id}`) return reply(409, { error: "Referência do pagamento divergente.", code: "EXTERNAL_REFERENCE_MISMATCH" });
  const providerAmount = Number(providerOrder.total_amount);
  if (!Number.isFinite(providerAmount) || Math.round(providerAmount * 100) !== Math.round(Number(payment.amount) * 100)) return reply(409, { error: "Valor do pagamento divergente.", code: "AMOUNT_MISMATCH" });

  const providerStatus = text(providerOrder.status) ?? "unknown";
  const detail = text(providerOrder.status_detail) ?? "unknown";
  const paid = providerStatus === "processed" && detail === "accredited";
  const refunded = providerStatus === "refunded" || detail === "refunded";
  const failed = ["canceled", "expired", "failed"].includes(providerStatus);
  const processing = providerStatus === "processing";
  const now = new Date().toISOString();

  if (paid) {
    await admin.from("payments").update({ status: "paid", paid_at: payment.paid_at ?? now, failed_at: null, failure_reason: null }).eq("id", payment.id).neq("status", "refunded");
    if (!["cancelled", "refunded"].includes(order.status)) await admin.from("orders").update({ payment_status: "paid" }).eq("id", order.id);
  } else if (refunded) {
    await admin.from("payments").update({ status: "refunded" }).eq("id", payment.id);
    await admin.from("orders").update({ payment_status: "refunded" }).eq("id", order.id);
  } else if (failed) {
    await admin.from("payments").update({ status: "failed", failed_at: now, failure_reason: `${providerStatus}:${detail}` }).eq("id", payment.id).in("status", ["pending", "processing"]);
    if (order.payment_status !== "paid") await admin.from("orders").update({ payment_status: "failed" }).eq("id", order.id);
  } else if (processing) {
    await admin.from("payments").update({ status: "processing" }).eq("id", payment.id).eq("status", "pending");
  }

  const eventId = `customer-reconcile:${payment.provider_charge_id}:${providerStatus}:${detail}`;
  await admin.from("payment_events").upsert({
    provider: "mercadopago",
    provider_event_id: eventId,
    event_type: "order.reconciled",
    payment_id: payment.id,
    payload: { source: "authenticated_customer_reconciliation", order: providerOrder },
    status: "processed",
    processed_at: now,
  }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true });

  const paymentStatus = paid ? "paid" : refunded ? "refunded" : failed ? "failed" : processing ? "processing" : payment.status;
  return reply(200, { paymentStatus, providerStatus, providerStatusDetail: detail, reconciled: true, provider: "mercadopago" });
}
