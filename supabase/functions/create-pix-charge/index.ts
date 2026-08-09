import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEST_PIX_AMOUNT = 50;
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function response(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeProviderError(payload: unknown) {
  if (!isRecord(payload)) return null;
  const causes = Array.isArray(payload.cause)
    ? payload.cause.slice(0, 5).map((cause) => {
        if (!isRecord(cause)) return null;
        return {
          code: typeof cause.code === "string" || typeof cause.code === "number" ? cause.code : null,
          description: text(cause.description),
          data: text(cause.data),
        };
      }).filter(Boolean)
    : [];
  return {
    message: text(payload.message),
    error: text(payload.error),
    status: text(payload.status),
    status_detail: text(payload.status_detail),
    code: typeof payload.code === "string" || typeof payload.code === "number" ? payload.code : null,
    causes,
  };
}

function providerErrorReason(payload: ReturnType<typeof safeProviderError>, status: number) {
  if (!payload) return `HTTP ${status}`;
  const firstCause = Array.isArray(payload.causes) && payload.causes.length > 0 ? payload.causes[0] : null;
  return payload.message || payload.error || payload.status_detail || firstCause?.description ||
    (payload.code !== null ? String(payload.code) : null) || `HTTP ${status}`;
}

function activePayment(payment: any): boolean {
  if (!["pending", "processing"].includes(payment.status)) return false;
  if (!payment.expires_at) return true;
  return new Date(payment.expires_at).getTime() > Date.now();
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
  const environment = (Deno.env.get("MERCADO_PAGO_ENVIRONMENT") ?? "test").trim().toLowerCase();
  const testMode = environment !== "production";
  const accessToken = testMode
    ? Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_TEST") ?? Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")
    : Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_PRODUCTION");
  const apiBase = (Deno.env.get("MERCADO_PAGO_API_URL") ?? "https://api.mercadopago.com").replace(/\/$/, "");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response(500, { error: "Serviço indisponível.", code: "SERVER_CONFIGURATION" });
  }
  if (!accessToken) {
    return response(503, {
      error: testMode ? "Credencial de teste do PIX não configurada." : "Credencial de produção do PIX não configurada.",
      code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
    });
  }

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return response(401, { error: "Sessão inválida ou expirada.", code: "UNAUTHORIZED" });
  if (!authData.user.email) return response(409, { error: "Sua conta precisa ter um e-mail válido para pagar com PIX.", code: "PAYER_EMAIL_REQUIRED" });

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
  if (order.payment_status === "paid") return response(409, { error: "Este pedido já está pago.", code: "ORDER_ALREADY_PAID" });

  const orderAmount = Number(order.total);
  if (!Number.isFinite(orderAmount) || orderAmount <= 0) return response(409, { error: "Valor do pedido inválido.", code: "INVALID_AMOUNT" });

  const chargeAmount = testMode ? TEST_PIX_AMOUNT : orderAmount;
  const chargeAmountText = chargeAmount.toFixed(2);
  const { data: attempts, error: attemptsError } = await admin
    .from("payments")
    .select("id,status,amount,qr_code_text,qr_code_image_url,expires_at,provider_charge_id,idempotency_key,created_at")
    .eq("order_id", order.id)
    .eq("provider", "mercadopago")
    .order("created_at", { ascending: false });

  if (attemptsError) return response(500, { error: "Não foi possível consultar tentativas de pagamento.", code: "PAYMENT_LOOKUP_FAILED" });
  const latest = attempts?.[0] ?? null;

  if (latest?.status === "paid") return response(409, { error: "Este pedido já está pago.", code: "ORDER_ALREADY_PAID" });
  if (latest && activePayment(latest)) {
    if (Math.round(Number(latest.amount) * 100) !== Math.round(chargeAmount * 100)) {
      return response(409, { error: "Pagamento ativo possui valor divergente.", code: "PAYMENT_AMOUNT_CONFLICT" });
    }
    return response(200, {
      payment: {
        id: latest.id,
        status: latest.status,
        amount: Number(latest.amount),
        qrCodeText: latest.qr_code_text,
        qrCodeImageUrl: latest.qr_code_image_url,
        expiresAt: latest.expires_at,
        providerChargeId: latest.provider_charge_id,
      },
      orderAmount,
      testMode,
      reused: true,
    });
  }

  if (latest && ["pending", "processing"].includes(latest.status) && !activePayment(latest)) {
    await admin.from("payments").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "expired" }).eq("id", latest.id);
  }

  const attemptNumber = (attempts?.length ?? 0) + 1;
  const idempotencyKey = `mercadopago:order:${order.id}:pix:${testMode ? "test" : "prod"}:attempt:${attemptNumber}`;
  const externalReference = `apois-order-${order.id}`;
  const providerBody = testMode
    ? {
        type: "online",
        external_reference: externalReference,
        total_amount: "50.00",
        payer: { email: "test_user_br@testuser.com", first_name: "APRO" },
        transactions: { payments: [{ amount: "50.00", payment_method: { id: "pix", type: "bank_transfer" } }] },
      }
    : {
        type: "online",
        processing_mode: "automatic",
        external_reference: externalReference,
        total_amount: chargeAmountText,
        payer: { email: authData.user.email },
        transactions: {
          payments: [{ amount: chargeAmountText, payment_method: { id: "pix", type: "bank_transfer" }, expiration_time: "PT30M" }],
        },
      };

  const providerResponse = await fetch(`${apiBase}/v1/orders`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(providerBody),
  });

  let providerPayload: unknown = null;
  try { providerPayload = await providerResponse.json(); } catch { /* provider body can be empty */ }
  if (!providerResponse.ok || !isRecord(providerPayload)) {
    const safeError = safeProviderError(providerPayload);
    const reason = providerErrorReason(safeError, providerResponse.status);
    console.error("create-pix-charge Mercado Pago error", { status: providerResponse.status, orderId, provider: safeError, testMode });
    return response(502, {
      error: `O Mercado Pago recusou a geração do PIX: ${reason}.`,
      code: "PAYMENT_PROVIDER_ERROR",
      providerStatus: providerResponse.status,
      provider: safeError,
    });
  }

  const providerOrderId = text(providerPayload.id);
  const transactions = isRecord(providerPayload.transactions) ? providerPayload.transactions : null;
  const providerPayments = transactions && Array.isArray(transactions.payments) ? transactions.payments : [];
  const providerPayment = providerPayments.length > 0 && isRecord(providerPayments[0]) ? providerPayments[0] : null;
  const paymentMethod = providerPayment && isRecord(providerPayment.payment_method) ? providerPayment.payment_method : null;
  const providerTransactionId = providerPayment ? text(providerPayment.id) : null;
  const qrCodeText = paymentMethod ? text(paymentMethod.qr_code) : null;
  const qrCodeBase64 = paymentMethod ? text(paymentMethod.qr_code_base64) : null;
  const ticketUrl = paymentMethod ? text(paymentMethod.ticket_url) : null;
  const qrCodeImageUrl = qrCodeBase64 ? `data:image/png;base64,${qrCodeBase64}` : ticketUrl;
  const providerStatus = text(providerPayload.status) ?? (providerPayment ? text(providerPayment.status) : null);
  const providerStatusDetail = text(providerPayload.status_detail) ?? (providerPayment ? text(providerPayment.status_detail) : null);
  const paidImmediately = providerStatus === "processed" && providerStatusDetail === "accredited";

  if (!providerOrderId || !qrCodeText) {
    console.error("create-pix-charge invalid Mercado Pago response", { orderId, providerStatus, providerStatusDetail });
    return response(502, { error: "O Mercado Pago não retornou um PIX válido.", code: "INVALID_PROVIDER_RESPONSE" });
  }

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const { data: payment, error: insertError } = await admin
    .from("payments")
    .insert({
      order_id: order.id,
      provider: "mercadopago",
      provider_charge_id: providerOrderId,
      method: "pix",
      status: paidImmediately ? "paid" : "pending",
      amount: chargeAmount,
      currency: "BRL",
      qr_code_text: qrCodeText,
      qr_code_image_url: qrCodeImageUrl,
      expires_at: expiresAt,
      paid_at: paidImmediately ? new Date().toISOString() : null,
      idempotency_key: idempotencyKey,
    })
    .select("id,status,amount,qr_code_text,qr_code_image_url,expires_at,provider_charge_id")
    .single();

  if (insertError || !payment) {
    const { data: concurrent } = await admin
      .from("payments")
      .select("id,status,amount,qr_code_text,qr_code_image_url,expires_at,provider_charge_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (concurrent) {
      return response(200, {
        payment: {
          id: concurrent.id,
          status: concurrent.status,
          amount: Number(concurrent.amount),
          qrCodeText: concurrent.qr_code_text,
          qrCodeImageUrl: concurrent.qr_code_image_url,
          expiresAt: concurrent.expires_at,
          providerChargeId: concurrent.provider_charge_id,
        },
        orderAmount,
        testMode,
        reused: true,
      });
    }
    console.error("create-pix-charge persistence error", { code: insertError?.code, orderId });
    return response(500, { error: "PIX gerado, mas não foi possível registrar o pagamento.", code: "PAYMENT_PERSISTENCE_ERROR" });
  }

  if (providerTransactionId) {
    await admin.from("payment_transactions").upsert(
      {
        payment_id: payment.id,
        provider_transaction_id: providerTransactionId,
        transaction_type: "charge",
        amount: chargeAmount,
        status: paidImmediately ? "completed" : "pending",
        processed_at: paidImmediately ? new Date().toISOString() : null,
      },
      { onConflict: "payment_id,provider_transaction_id,transaction_type", ignoreDuplicates: true },
    );
  }

  if (paidImmediately) await admin.from("orders").update({ payment_status: "paid" }).eq("id", order.id);

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
    orderAmount,
    testMode,
    reused: false,
  });
});
