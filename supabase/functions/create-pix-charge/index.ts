import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;
function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function response(status: number, body: JsonRecord) { return new Response(JSON.stringify(body), { status, headers: jsonHeaders }); }
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return response(405, { error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" });

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return response(401, { error: "Autenticação obrigatória.", code: "UNAUTHORIZED" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openPixAppId = Deno.env.get("OPENPIX_APP_ID");
  const apiBase = (Deno.env.get("OPENPIX_API_URL") ?? "https://api.openpix.com.br/api/v1").replace(/\/$/, "");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return response(500, { error: "Serviço indisponível.", code: "SERVER_CONFIGURATION" });
  if (!openPixAppId) return response(503, { error: "Pagamento PIX ainda não está habilitado.", code: "PAYMENT_PROVIDER_NOT_CONFIGURED" });

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return response(401, { error: "Sessão inválida ou expirada.", code: "UNAUTHORIZED" });

  let body: unknown;
  try { body = await request.json(); } catch { return response(400, { error: "Requisição inválida.", code: "INVALID_REQUEST" }); }
  if (!isRecord(body) || typeof body.orderId !== "string" || !UUID_RE.test(body.orderId)) {
    return response(400, { error: "Pedido inválido.", code: "INVALID_ORDER_ID" });
  }

  const orderId = body.orderId;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,order_number,customer_user_id,status,payment_method,payment_status,total")
    .eq("id", orderId)
    .eq("customer_user_id", authData.user.id)
    .single();

  if (orderError || !order) return response(404, { error: "Pedido não encontrado.", code: "ORDER_NOT_FOUND" });
  if (["cancelled", "refunded"].includes(order.status)) return response(409, { error: "Este pedido não pode mais ser pago.", code: "ORDER_NOT_PAYABLE" });
  if (order.payment_method !== "pix") return response(409, { error: "Este pedido não utiliza PIX.", code: "PAYMENT_METHOD_MISMATCH" });

  const correlationID = `apois-order-${order.id}`;
  const { data: existing } = await admin
    .from("payments")
    .select("id,status,amount,qr_code_text,qr_code_image_url,expires_at,provider_charge_id")
    .eq("idempotency_key", correlationID)
    .maybeSingle();

  if (existing) {
    if (Number(existing.amount) !== Number(order.total)) return response(409, { error: "Pagamento existente possui valor divergente.", code: "PAYMENT_AMOUNT_CONFLICT" });
    return response(200, {
      payment: {
        id: existing.id,
        status: existing.status,
        amount: Number(existing.amount),
        qrCodeText: existing.qr_code_text,
        qrCodeImageUrl: existing.qr_code_image_url,
        expiresAt: existing.expires_at,
        providerChargeId: existing.provider_charge_id,
      },
      reused: true,
    });
  }

  const cents = Math.round(Number(order.total) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) return response(409, { error: "Valor do pedido inválido.", code: "INVALID_AMOUNT" });

  const providerResponse = await fetch(`${apiBase}/charge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: openPixAppId,
    },
    body: JSON.stringify({
      correlationID,
      value: cents,
      comment: `APOIS ENTREGAS - Pedido #${order.order_number}`,
    }),
  });

  let providerPayload: unknown = null;
  try { providerPayload = await providerResponse.json(); } catch { /* provider may return no JSON */ }
  if (!providerResponse.ok || !isRecord(providerPayload)) {
    console.error("create-pix-charge provider error", { status: providerResponse.status, orderId });
    return response(502, { error: "Não foi possível gerar o PIX agora.", code: "PAYMENT_PROVIDER_ERROR" });
  }

  const charge = isRecord(providerPayload.charge) ? providerPayload.charge : providerPayload;
  const providerChargeId = text(charge.transactionID) ?? text(charge.identifier) ?? text(charge.correlationID) ?? correlationID;
  const brCode = text(charge.brCode) ?? text(providerPayload.brCode);
  const qrCodeImage = text(charge.qrCodeImage) ?? text(providerPayload.qrCodeImage);
  const paymentLinkUrl = text(charge.paymentLinkUrl) ?? text(providerPayload.paymentLinkUrl);
  const expiresDate = text(charge.expiresDate) ?? text(charge.expiresAt);

  const { data: payment, error: insertError } = await admin
    .from("payments")
    .insert({
      order_id: order.id,
      provider: "openpix",
      provider_charge_id: providerChargeId,
      method: "pix",
      status: "pending",
      amount: Number(order.total),
      currency: "BRL",
      qr_code_text: brCode,
      qr_code_image_url: qrCodeImage ?? paymentLinkUrl,
      expires_at: expiresDate,
      idempotency_key: correlationID,
    })
    .select("id,status,amount,qr_code_text,qr_code_image_url,expires_at,provider_charge_id")
    .single();

  if (insertError || !payment) {
    // Concurrent retry may have inserted it after our initial lookup.
    const { data: concurrent } = await admin.from("payments").select("id,status,amount,qr_code_text,qr_code_image_url,expires_at,provider_charge_id").eq("idempotency_key", correlationID).maybeSingle();
    if (concurrent) {
      return response(200, { payment: { id: concurrent.id, status: concurrent.status, amount: Number(concurrent.amount), qrCodeText: concurrent.qr_code_text, qrCodeImageUrl: concurrent.qr_code_image_url, expiresAt: concurrent.expires_at, providerChargeId: concurrent.provider_charge_id }, reused: true });
    }
    console.error("create-pix-charge persistence error", { code: insertError?.code, orderId });
    return response(500, { error: "PIX gerado, mas não foi possível registrar o pagamento.", code: "PAYMENT_PERSISTENCE_ERROR" });
  }

  return response(201, {
    payment: {
      id: payment.id,
      status: payment.status,
      amount: Number(payment.amount),
      qrCodeText: payment.qr_code_text,
      qrCodeImageUrl: payment.qr_code_image_url,
      expiresAt: payment.expires_at,
      providerChargeId: payment.provider_charge_id,
    },
    reused: false,
  });
});
