import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// TEMPORÁRIO: homologação oficial do PIX com credenciais de teste do Mercado Pago.
// Antes de trocar para credenciais de produção, definir como false/remover este bloco.
const MERCADO_PAGO_PIX_TEST_HOMOLOGATION = true;

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
  return {
    message: text(payload.message),
    error: text(payload.error),
    status: text(payload.status),
    status_detail: text(payload.status_detail),
    code: typeof payload.code === "string" || typeof payload.code === "number" ? payload.code : null,
  };
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
  const mercadoPagoAccessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  const apiBase = (Deno.env.get("MERCADO_PAGO_API_URL") ?? "https://api.mercadopago.com").replace(/\/$/, "");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response(500, { error: "Serviço indisponível.", code: "SERVER_CONFIGURATION" });
  }
  if (!mercadoPagoAccessToken) {
    return response(503, {
      error: "Pagamento PIX ainda não está habilitado.",
      code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
    });
  }

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return response(401, { error: "Sessão inválida ou expirada.", code: "UNAUTHORIZED" });
  }
  if (!authData.user.email) {
    return response(409, { error: "Sua conta precisa ter um e-mail válido para pagar com PIX.", code: "PAYER_EMAIL_REQUIRED" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response(400, { error: "Requisição inválida.", code: "INVALID_REQUEST" });
  }
  if (!isRecord(body) || typeof body.orderId !== "string" || !UUID_RE.test(body.orderId)) {
    return response(400, { error: "Pedido inválido.", code: "INVALID_ORDER_ID" });
  }

  const orderId = body.orderId;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,order_number,customer_user_id,status,payment_method,payment_status,total")
    .eq("id", orderId)
    .eq("customer_user_id", authData.user.id)
    .single();

  if (orderError || !order) return response(404, { error: "Pedido não encontrado.", code: "ORDER_NOT_FOUND" });
  if (["cancelled", "refunded"].includes(order.status)) {
    return response(409, { error: "Este pedido não pode mais ser pago.", code: "ORDER_NOT_PAYABLE" });
  }
  if (order.payment_method !== "pix") {
    return response(409, { error: "Este pedido não utiliza PIX.", code: "PAYMENT_METHOD_MISMATCH" });
  }
  if (order.payment_status === "paid") {
    return response(409, { error: "Este pedido já está pago.", code: "ORDER_ALREADY_PAID" });
  }

  const amount = Number(order.total);
  if (!Number.isFinite(amount) || amount <= 0) {
    return response(409, { error: "Valor do pedido inválido.", code: "INVALID_AMOUNT" });
  }
  if (MERCADO_PAGO_PIX_TEST_HOMOLOGATION && Math.round(amount * 100) !== 5000) {
    return response(409, {
      error: "A homologação PIX do Mercado Pago exige pedido de teste exatamente em R$ 50,00.",
      code: "TEST_AMOUNT_REQUIRED",
    });
  }

  const amountText = amount.toFixed(2);
  const idempotencyKey = MERCADO_PAGO_PIX_TEST_HOMOLOGATION
    ? `mercadopago:order:${order.id}:pix:test:v2`
    : `mercadopago:order:${order.id}:pix:v1`;
  const externalReference = `apois-order-${order.id}`;

  const { data: existing } = await admin
    .from("payments")
    .select("id,status,amount,qr_code_text,qr_code_image_url,expires_at,provider_charge_id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing) {
    if (Number(existing.amount) !== amount) {
      return response(409, { error: "Pagamento existente possui valor divergente.", code: "PAYMENT_AMOUNT_CONFLICT" });
    }
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

  const providerBody = MERCADO_PAGO_PIX_TEST_HOMOLOGATION
    ? {
        type: "online",
        external_reference: externalReference,
        total_amount: "50.00",
        payer: {
          email: "test_user_br@testuser.com",
          first_name: "APRO",
        },
        transactions: {
          payments: [
            {
              amount: "50.00",
              payment_method: { id: "pix", type: "bank_transfer" },
            },
          ],
        },
      }
    : {
        type: "online",
        total_amount: amountText,
        external_reference: externalReference,
        processing_mode: "automatic",
        transactions: {
          payments: [
            {
              amount: amountText,
              payment_method: { id: "pix", type: "bank_transfer" },
              expiration_time: "PT30M",
            },
          ],
        },
        payer: { email: authData.user.email },
      };

  const providerResponse = await fetch(`${apiBase}/v1/orders`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${mercadoPagoAccessToken}`,
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(providerBody),
  });

  let providerPayload: unknown = null;
  try {
    providerPayload = await providerResponse.json();
  } catch {
    // Provider may return a non-JSON error body.
  }

  if (!providerResponse.ok || !isRecord(providerPayload)) {
    const safeError = safeProviderError(providerPayload);
    console.error(JSON.stringify({
      event: "create-pix-charge Mercado Pago error",
      status: providerResponse.status,
      orderId,
      provider: safeError,
      testHomologation: MERCADO_PAGO_PIX_TEST_HOMOLOGATION,
    }));
    return response(502, {
      error: "O Mercado Pago recusou a geração do PIX de teste.",
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
      amount,
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
        reused: true,
      });
    }
    console.error("create-pix-charge persistence error", { code: insertError?.code, orderId });
    return response(500, {
      error: "PIX gerado, mas não foi possível registrar o pagamento.",
      code: "PAYMENT_PERSISTENCE_ERROR",
    });
  }

  if (providerTransactionId) {
    await admin.from("payment_transactions").upsert(
      {
        payment_id: payment.id,
        provider_transaction_id: providerTransactionId,
        transaction_type: "charge",
        amount,
        status: paidImmediately ? "completed" : "pending",
        processed_at: paidImmediately ? new Date().toISOString() : null,
      },
      { onConflict: "payment_id,provider_transaction_id,transaction_type", ignoreDuplicates: true },
    );
  }

  if (paidImmediately) {
    await admin.from("orders").update({ payment_status: "paid" }).eq("id", order.id);
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
