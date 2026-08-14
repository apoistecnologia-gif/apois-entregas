import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPENPIX_SANDBOX_BASE = "https://api.woovi-sandbox.com";
const OPENPIX_PRODUCTION_BASE = "https://api.openpix.com.br";

type JsonRecord = Record<string, unknown>;
type RefundRow = {
  id: string;
  payment_id: string;
  order_id: string;
  amount: number;
  reason: string;
  status: string;
  provider_refund_id: string | null;
  requested_by: string | null;
  processed_at: string | null;
};
type OrderRow = {
  id: string;
  customer_user_id: string;
  status: string;
  payment_status: string;
  total: number;
};
type PaymentRow = {
  id: string;
  provider: string;
  provider_charge_id: string | null;
  status: string;
  amount: number;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function response(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
async function readJson(providerResponse: Response): Promise<unknown> {
  try {
    return await providerResponse.json();
  } catch {
    return null;
  }
}
function chargeCorrelationMatchesOrder(correlationID: string | null, orderId: string) {
  if (!correlationID) return false;
  const legacy = `apois-entrega-order-${orderId}`;
  if (correlationID === legacy) return true;
  const retryPrefix = `${legacy}-payment-`;
  return correlationID.startsWith(retryPrefix) && UUID_RE.test(correlationID.slice(retryPrefix.length));
}

async function finalizeRefund(
  admin: ReturnType<typeof createClient>,
  refund: RefundRow,
  order: OrderRow,
  payment: PaymentRow,
  actorUserId: string | null,
  providerRefundId: string | null,
) {
  const now = new Date().toISOString();
  const { error: refundUpdateError } = await admin
    .from("refunds")
    .update({
      status: "completed",
      provider_refund_id: providerRefundId,
      processed_at: now,
    })
    .eq("id", refund.id);
  if (refundUpdateError) throw new Error("refund_update_failed");

  const { error: paymentUpdateError } = await admin
    .from("payments")
    .update({ status: "refunded" })
    .eq("id", payment.id);
  if (paymentUpdateError) throw new Error("payment_update_failed");

  const { data: transitionedOrder, error: transitionError } = await admin
    .from("orders")
    .update({ payment_status: "refunded", status: "refunded" })
    .eq("id", order.id)
    .eq("status", "cancelled")
    .select("id")
    .maybeSingle();
  if (transitionError) throw new Error("order_update_failed");

  if (!transitionedOrder) {
    const { error: orderPaymentError } = await admin
      .from("orders")
      .update({ payment_status: "refunded" })
      .eq("id", order.id);
    if (orderPaymentError) throw new Error("order_update_failed");
  } else {
    const { error: historyError } = await admin.from("order_status_history").insert({
      order_id: order.id,
      status: "refunded",
      changed_by_user_id: actorUserId,
    });
    if (historyError) throw new Error("order_history_failed");
  }

  if (providerRefundId) {
    const { error: transactionError } = await admin.from("payment_transactions").upsert(
      {
        payment_id: payment.id,
        provider_transaction_id: providerRefundId,
        transaction_type: "refund",
        amount: Number(refund.amount),
        status: "completed",
        processed_at: now,
      },
      { onConflict: "payment_id,provider_transaction_id,transaction_type" },
    );
    if (transactionError) throw new Error("refund_transaction_update_failed");
  }
}

async function processOpenPixRefund(input: {
  admin: ReturnType<typeof createClient>;
  refund: RefundRow;
  order: OrderRow;
  payment: PaymentRow;
  actorUserId: string;
}) {
  const { admin, refund, order, payment, actorUserId } = input;
  if (!payment.provider_charge_id) {
    return response(409, {
      error: "A cobrança OpenPix deste pedido não foi encontrada.",
      code: "PROVIDER_CHARGE_NOT_FOUND",
    });
  }

  const { data: environmentSetting, error: environmentSettingError } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "openpix_environment")
    .maybeSingle();
  const environment =
    typeof environmentSetting?.value === "string"
      ? environmentSetting.value.trim().toLowerCase()
      : null;
  if (environmentSettingError || !["sandbox", "production"].includes(environment ?? "")) {
    return response(503, {
      error: "Ambiente OpenPix temporariamente inconsistente.",
      code: "PAYMENT_ENVIRONMENT_MISMATCH",
    });
  }

  const production = environment === "production";
  const appId = production
    ? Deno.env.get("OPENPIX_APP_ID_PRODUCTION")?.trim()
    : Deno.env.get("OPENPIX_APP_ID_SANDBOX")?.trim();
  if (!appId) {
    return response(503, {
      error: "Estornos OpenPix ainda não estão habilitados para este ambiente.",
      code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
    });
  }
  const apiBase = production ? OPENPIX_PRODUCTION_BASE : OPENPIX_SANDBOX_BASE;
  const providerHeaders = { Authorization: appId, Accept: "application/json" };

  const chargeResponse = await fetch(
    `${apiBase}/api/v1/charge/${encodeURIComponent(payment.provider_charge_id)}`,
    { headers: providerHeaders },
  );
  const chargePayload = await readJson(chargeResponse);
  if (!chargeResponse.ok || !isRecord(chargePayload) || !isRecord(chargePayload.charge)) {
    return response(502, {
      error: "Não foi possível consultar a cobrança na OpenPix.",
      code: "PROVIDER_LOOKUP_FAILED",
    });
  }

  const charge = chargePayload.charge;
  const chargeCorrelationID = text(charge.correlationID);
  if (!chargeCorrelationMatchesOrder(chargeCorrelationID, order.id)) {
    return response(409, {
      error: "A cobrança OpenPix não corresponde a este pedido.",
      code: "EXTERNAL_REFERENCE_MISMATCH",
    });
  }

  const chargeValue = numberValue(charge.value);
  const paymentAmountCents = Math.round(Number(payment.amount) * 100);
  if (chargeValue === null || Math.round(chargeValue) !== paymentAmountCents) {
    return response(409, {
      error: "O valor da cobrança OpenPix diverge do pagamento.",
      code: "PAYMENT_AMOUNT_MISMATCH",
    });
  }
  if ((text(charge.status) ?? "").toUpperCase() !== "COMPLETED") {
    return response(409, {
      error: "A cobrança ainda não está confirmada para estorno.",
      code: "PAYMENT_NOT_CONFIRMED",
    });
  }

  const refundAmountCents = Math.round(Number(refund.amount) * 100);
  const refundCorrelationID = `apois-entrega-refund-${refund.id}`;
  const refundUrl = `${apiBase}/api/v1/charge/${encodeURIComponent(chargeCorrelationID!)}/refund`;

  const readRefunds = async () => {
    const providerResponse = await fetch(refundUrl, { headers: providerHeaders });
    const body = await readJson(providerResponse);
    return { providerResponse, body };
  };
  const findOwnRefund = (payload: unknown): JsonRecord | null => {
    if (!isRecord(payload) || !Array.isArray(payload.refunds)) return null;
    const found = payload.refunds.find(
      (candidate) => isRecord(candidate) && text(candidate.correlationID) === refundCorrelationID,
    );
    return isRecord(found) ? found : null;
  };

  const existingLookup = await readRefunds();
  if (!existingLookup.providerResponse.ok) {
    return response(502, {
      error: "Não foi possível consultar os estornos na OpenPix.",
      code: "REFUND_LOOKUP_FAILED",
    });
  }
  let providerRefund = findOwnRefund(existingLookup.body);
  let reused = Boolean(providerRefund);

  if (!providerRefund) {
    await admin
      .from("refunds")
      .update({ status: "processing" })
      .eq("id", refund.id)
      .in("status", ["pending", "failed", "processing"]);

    const providerResponse = await fetch(refundUrl, {
      method: "POST",
      headers: {
        ...providerHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        correlationID: refundCorrelationID,
        value: refundAmountCents,
        comment: refund.reason.slice(0, 140),
      }),
    });
    const providerPayload = await readJson(providerResponse);
    providerRefund =
      providerResponse.ok && isRecord(providerPayload) && isRecord(providerPayload.refund)
        ? providerPayload.refund
        : null;

    if (!providerRefund) {
      const verification = await readRefunds();
      providerRefund = verification.providerResponse.ok ? findOwnRefund(verification.body) : null;
      if (!providerRefund) {
        await admin.from("refunds").update({ status: "failed" }).eq("id", refund.id);
        console.error("process-refund OpenPix provider error", {
          refundId: refund.id,
          status: providerResponse.status,
        });
        return response(502, {
          error: "A OpenPix não conseguiu iniciar o estorno agora.",
          code: "REFUND_PROVIDER_ERROR",
        });
      }
      reused = true;
    }
  }

  const providerValue = numberValue(providerRefund.value);
  if (providerValue !== null && Math.round(providerValue) !== refundAmountCents) {
    await admin.from("refunds").update({ status: "failed" }).eq("id", refund.id);
    return response(409, {
      error: "O valor do estorno retornado pela OpenPix diverge do pedido.",
      code: "REFUND_AMOUNT_CONFLICT",
    });
  }

  const providerStatus = (text(providerRefund.status) ?? "IN_PROCESSING").toUpperCase();
  const providerRefundId =
    text(providerRefund.endToEndId) ?? text(providerRefund.refundId) ?? refundCorrelationID;

  if (["CONFIRMED", "COMPLETED", "REFUNDED"].includes(providerStatus)) {
    try {
      await finalizeRefund(admin, refund, order, payment, actorUserId, providerRefundId);
    } catch (error) {
      console.error("process-refund OpenPix local finalization failed", {
        refundId: refund.id,
        message: error instanceof Error ? error.message : "unknown",
      });
      return response(500, {
        error: "Estorno confirmado; conciliação local pendente.",
        code: "REFUND_LOCAL_SYNC_FAILED",
      });
    }
    return response(200, {
      refund: { id: refund.id, status: "completed", providerRefundId },
      reused,
    });
  }

  if (["FAILED", "REJECTED", "CANCELLED", "CANCELED"].includes(providerStatus)) {
    await admin
      .from("refunds")
      .update({ status: "failed", provider_refund_id: providerRefundId })
      .eq("id", refund.id);
    return response(502, {
      error: "A OpenPix não confirmou o estorno.",
      code: "REFUND_PROVIDER_ERROR",
    });
  }

  await admin
    .from("refunds")
    .update({ status: "processing", provider_refund_id: providerRefundId })
    .eq("id", refund.id);
  return response(202, {
    refund: { id: refund.id, status: "processing", providerRefundId },
    reused,
  });
}

async function processMercadoPagoRefund(input: {
  admin: ReturnType<typeof createClient>;
  refund: RefundRow;
  order: OrderRow;
  payment: PaymentRow;
  actorUserId: string;
}) {
  const { admin, refund, order, payment, actorUserId } = input;
  if (!payment.provider_charge_id) {
    return response(409, {
      error: "A cobrança deste pedido não foi encontrada.",
      code: "PROVIDER_CHARGE_NOT_FOUND",
    });
  }

  const environment = (Deno.env.get("MERCADO_PAGO_ENVIRONMENT") ?? "test").trim().toLowerCase();
  const testMode = environment !== "production";
  const accessToken = testMode
    ? Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_TEST")?.trim() ||
      Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")?.trim()
    : Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_PRODUCTION")?.trim();
  const apiBase = (Deno.env.get("MERCADO_PAGO_API_URL") ?? "https://api.mercadopago.com").replace(
    /\/$/,
    "",
  );

  const { data: environmentSetting, error: environmentSettingError } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "mercado_pago_environment")
    .maybeSingle();
  const databaseEnvironment =
    typeof environmentSetting?.value === "string"
      ? environmentSetting.value.trim().toLowerCase()
      : null;
  if (
    environmentSettingError ||
    !["test", "production"].includes(databaseEnvironment ?? "") ||
    databaseEnvironment !== environment
  ) {
    return response(503, {
      error: "Ambiente de pagamentos temporariamente inconsistente.",
      code: "PAYMENT_ENVIRONMENT_MISMATCH",
    });
  }

  const sandboxPayment = /^ORDTST/i.test(payment.provider_charge_id);
  if ((testMode && !sandboxPayment) || (!testMode && sandboxPayment)) {
    return response(409, {
      error: "Este pagamento pertence a outro ambiente do gateway.",
      code: "PAYMENT_ENVIRONMENT_MISMATCH",
    });
  }
  if (!accessToken) {
    return response(503, {
      error: "Estornos ainda não estão habilitados para este ambiente.",
      code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
    });
  }

  let providerTransactionId: string | null = null;
  const { data: localCharge } = await admin
    .from("payment_transactions")
    .select("provider_transaction_id")
    .eq("payment_id", payment.id)
    .eq("transaction_type", "charge")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  providerTransactionId = text(localCharge?.provider_transaction_id);

  const providerOrderUrl = `${apiBase}/v1/orders/${encodeURIComponent(payment.provider_charge_id)}`;
  const authHeaders = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  const readProviderOrder = async (): Promise<{ providerResponse: Response; body: unknown }> => {
    const providerResponse = await fetch(providerOrderUrl, { headers: authHeaders });
    return { providerResponse, body: await readJson(providerResponse) };
  };

  const providerLookup = await readProviderOrder();
  let providerPayload = providerLookup.body;
  if (!providerLookup.providerResponse.ok || !isRecord(providerPayload)) {
    return response(502, {
      error: "Não foi possível consultar o pagamento no Mercado Pago.",
      code: "PROVIDER_LOOKUP_FAILED",
    });
  }

  if (!providerTransactionId) {
    const transactions = isRecord(providerPayload.transactions) ? providerPayload.transactions : null;
    const providerPayments =
      transactions && Array.isArray(transactions.payments) ? transactions.payments : [];
    const firstPayment =
      providerPayments.length > 0 && isRecord(providerPayments[0]) ? providerPayments[0] : null;
    providerTransactionId = firstPayment ? text(firstPayment.id) : null;
  }
  if (!providerTransactionId) {
    return response(409, {
      error: "A transação original do pagamento não foi encontrada.",
      code: "PROVIDER_TRANSACTION_NOT_FOUND",
    });
  }

  const currentStatus = text(providerPayload.status);
  const currentStatusDetail = text(providerPayload.status_detail);
  const alreadyRefunded = currentStatus === "refunded" || currentStatusDetail === "refunded";

  if (!alreadyRefunded) {
    const idempotencyKey = `mercadopago:refund:${refund.id}:v2`;
    await admin
      .from("refunds")
      .update({ status: "processing" })
      .eq("id", refund.id)
      .in("status", ["pending", "failed", "processing"]);

    const providerResponse = await fetch(`${providerOrderUrl}/refund`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ transactions: [{ id: providerTransactionId }] }),
    });
    const refundPayload = await readJson(providerResponse);

    if (providerResponse.ok && isRecord(refundPayload)) {
      providerPayload = refundPayload;
    } else {
      const verified = await readProviderOrder();
      const verifiedRecord = isRecord(verified.body) ? verified.body : null;
      const verifiedRefunded =
        verifiedRecord &&
        (text(verifiedRecord.status) === "refunded" ||
          text(verifiedRecord.status_detail) === "refunded");
      if (!verified.providerResponse.ok || !verifiedRefunded) {
        await admin.from("refunds").update({ status: "failed" }).eq("id", refund.id);
        console.error("process-refund Mercado Pago provider error", {
          status: providerResponse.status,
          refundId: refund.id,
        });
        return response(502, {
          error: "O Mercado Pago não conseguiu processar o estorno agora.",
          code: "REFUND_PROVIDER_ERROR",
        });
      }
      providerPayload = verifiedRecord;
    }
  }

  if (!isRecord(providerPayload)) {
    await admin.from("refunds").update({ status: "failed" }).eq("id", refund.id);
    return response(502, {
      error: "Resposta inválida do Mercado Pago.",
      code: "INVALID_PROVIDER_RESPONSE",
    });
  }

  const transactions = isRecord(providerPayload.transactions) ? providerPayload.transactions : null;
  const providerRefunds =
    transactions && Array.isArray(transactions.refunds) ? transactions.refunds : [];
  const providerRefund =
    providerRefunds.length > 0 && isRecord(providerRefunds[0]) ? providerRefunds[0] : null;
  const providerRefundId = providerRefund ? text(providerRefund.id) : null;
  const providerRefundStatus = providerRefund ? text(providerRefund.status) : null;
  const providerStatus = text(providerPayload.status);
  const providerStatusDetail = text(providerPayload.status_detail);
  const completed =
    providerStatus === "refunded" ||
    providerStatusDetail === "refunded" ||
    providerRefundStatus === "processed";

  if (!completed) {
    await admin
      .from("refunds")
      .update({ status: "processing", provider_refund_id: providerRefundId })
      .eq("id", refund.id);
    return response(202, {
      refund: { id: refund.id, status: "processing", providerRefundId },
      reused: false,
    });
  }

  try {
    await finalizeRefund(admin, refund, order, payment, actorUserId, providerRefundId);
  } catch (error) {
    console.error("process-refund Mercado Pago local finalization failed", {
      refundId: refund.id,
      message: error instanceof Error ? error.message : "unknown",
    });
    return response(500, {
      error: "Estorno confirmado; conciliação local pendente.",
      code: "REFUND_LOCAL_SYNC_FAILED",
    });
  }
  return response(200, {
    refund: { id: refund.id, status: "completed", providerRefundId },
    reused: alreadyRefunded,
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST")
    return response(405, { error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" });

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return response(401, { error: "Autenticação obrigatória.", code: "UNAUTHORIZED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response(500, {
      error: "Serviço temporariamente indisponível.",
      code: "SERVER_CONFIGURATION",
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

  const payload = await request.json().catch(() => null);
  if (
    !isRecord(payload) ||
    typeof payload.refundId !== "string" ||
    !UUID_RE.test(payload.refundId)
  ) {
    return response(400, { error: "Estorno inválido.", code: "INVALID_REFUND_ID" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: refundData, error: refundError } = await admin
    .from("refunds")
    .select(
      "id,payment_id,order_id,amount,reason,status,provider_refund_id,requested_by,processed_at",
    )
    .eq("id", payload.refundId)
    .maybeSingle();
  if (refundError) {
    console.error("process-refund refund lookup failed", {
      code: refundError.code,
      refundId: payload.refundId,
    });
    return response(500, {
      error: "Não foi possível consultar o estorno.",
      code: "REFUND_LOOKUP_FAILED",
    });
  }
  if (!refundData)
    return response(404, { error: "Estorno não encontrado.", code: "REFUND_NOT_FOUND" });
  const refund = refundData as RefundRow;

  const { data: orderData } = await admin
    .from("orders")
    .select("id,customer_user_id,status,payment_status,total")
    .eq("id", refund.order_id)
    .maybeSingle();
  if (!orderData)
    return response(404, { error: "Pedido não encontrado.", code: "ORDER_NOT_FOUND" });
  const order = orderData as OrderRow;

  const [{ data: adminRole }, { data: adminProfile }] = await Promise.all([
    admin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .eq("role", "admin")
      .maybeSingle(),
    admin.from("profiles").select("is_active").eq("id", authData.user.id).maybeSingle(),
  ]);
  const activeAdmin = Boolean(adminRole && adminProfile?.is_active === true);
  const authorized =
    order.customer_user_id === authData.user.id ||
    refund.requested_by === authData.user.id ||
    activeAdmin;
  if (!authorized) {
    return response(403, { error: "Você não pode processar este estorno.", code: "FORBIDDEN" });
  }

  if (refund.status === "completed") {
    return response(200, {
      refund: { id: refund.id, status: refund.status, providerRefundId: refund.provider_refund_id },
      reused: true,
    });
  }

  const { data: paymentData } = await admin
    .from("payments")
    .select("id,provider,provider_charge_id,status,amount")
    .eq("id", refund.payment_id)
    .maybeSingle();
  if (!paymentData) {
    return response(409, {
      error: "Pagamento do estorno não foi encontrado.",
      code: "PAYMENT_NOT_FOUND",
    });
  }
  const payment = paymentData as PaymentRow;

  if (Math.round(Number(payment.amount) * 100) !== Math.round(Number(refund.amount) * 100)) {
    return response(409, {
      error: "O estorno total possui valor divergente do pagamento.",
      code: "REFUND_AMOUNT_CONFLICT",
    });
  }
  if (!["paid", "refunded"].includes(payment.status)) {
    return response(409, {
      error: "Este pagamento ainda não pode ser estornado.",
      code: "PAYMENT_NOT_CONFIRMED",
    });
  }

  if (payment.provider === "openpix") {
    return processOpenPixRefund({
      admin,
      refund,
      order,
      payment,
      actorUserId: authData.user.id,
    });
  }
  if (payment.provider === "mercadopago") {
    return processMercadoPagoRefund({
      admin,
      refund,
      order,
      payment,
      actorUserId: authData.user.id,
    });
  }

  return response(409, {
    error: "Este pagamento não pode ser estornado pelo gateway atual.",
    code: "PROVIDER_MISMATCH",
  });
});
