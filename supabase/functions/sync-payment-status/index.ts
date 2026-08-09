import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function response(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function accessTokenForOrder(providerOrderId: string): string | null {
  const sandbox = /^ORDTST/i.test(providerOrderId);
  if (sandbox) {
    return (
      Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_TEST")?.trim() ||
      Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")?.trim() ||
      null
    );
  }
  return Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_PRODUCTION")?.trim() || null;
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
  const apiBase = (Deno.env.get("MERCADO_PAGO_API_URL") ?? "https://api.mercadopago.com").replace(
    /\/$/,
    "",
  );

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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return response(400, { error: "Requisição inválida.", code: "INVALID_REQUEST" });
  }

  if (!isRecord(payload) || typeof payload.orderId !== "string" || !UUID_RE.test(payload.orderId)) {
    return response(400, { error: "Pedido inválido.", code: "INVALID_ORDER_ID" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,customer_user_id,status,payment_status,total")
    .eq("id", payload.orderId)
    .eq("customer_user_id", authData.user.id)
    .maybeSingle();

  if (orderError) {
    console.error("sync-payment-status order lookup failed", { code: orderError.code });
    return response(500, {
      error: "Não foi possível consultar o pedido.",
      code: "ORDER_LOOKUP_FAILED",
    });
  }
  if (!order) return response(404, { error: "Pedido não encontrado.", code: "ORDER_NOT_FOUND" });

  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .select("id,provider,provider_charge_id,status,amount,paid_at")
    .eq("order_id", order.id)
    .eq("provider", "mercadopago")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (paymentError) {
    console.error("sync-payment-status payment lookup failed", { code: paymentError.code });
    return response(500, {
      error: "Não foi possível consultar o pagamento.",
      code: "PAYMENT_LOOKUP_FAILED",
    });
  }
  if (!payment?.provider_charge_id) {
    return response(404, { error: "Pagamento não encontrado.", code: "PAYMENT_NOT_FOUND" });
  }

  if (payment.status === "paid" && order.payment_status === "paid") {
    return response(200, { paymentStatus: "paid", providerStatus: "processed", reconciled: false });
  }
  if (payment.status === "refunded" || order.payment_status === "refunded") {
    return response(200, {
      paymentStatus: "refunded",
      providerStatus: "refunded",
      reconciled: false,
    });
  }

  const accessToken = accessTokenForOrder(payment.provider_charge_id);
  if (!accessToken) {
    return response(503, {
      error: "Credencial do gateway não configurada.",
      code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
    });
  }

  const providerResponse = await fetch(
    `${apiBase}/v1/orders/${encodeURIComponent(payment.provider_charge_id)}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );

  let providerOrder: unknown = null;
  try {
    providerOrder = await providerResponse.json();
  } catch {
    // Provider can return an empty/non-JSON body on errors.
  }

  if (!providerResponse.ok || !isRecord(providerOrder)) {
    console.error("sync-payment-status provider lookup failed", {
      status: providerResponse.status,
      orderId: order.id,
    });
    return response(502, {
      error: "Não foi possível confirmar o pagamento agora.",
      code: "PROVIDER_LOOKUP_FAILED",
    });
  }

  if (text(providerOrder.id) !== payment.provider_charge_id) {
    return response(409, {
      error: "Pagamento divergente no provedor.",
      code: "PROVIDER_RESOURCE_MISMATCH",
    });
  }

  const externalReference = text(providerOrder.external_reference);
  if (externalReference !== `apois-order-${order.id}`) {
    return response(409, {
      error: "Referência do pagamento divergente.",
      code: "EXTERNAL_REFERENCE_MISMATCH",
    });
  }

  const providerAmount = Number(providerOrder.total_amount);
  if (
    !Number.isFinite(providerAmount) ||
    Math.round(providerAmount * 100) !== Math.round(Number(payment.amount) * 100)
  ) {
    return response(409, { error: "Valor do pagamento divergente.", code: "AMOUNT_MISMATCH" });
  }

  const providerStatus = text(providerOrder.status) ?? "unknown";
  const providerStatusDetail = text(providerOrder.status_detail) ?? "unknown";
  const paid = providerStatus === "processed" && providerStatusDetail === "accredited";
  const refunded = providerStatus === "refunded" || providerStatusDetail === "refunded";
  const failed = ["canceled", "expired", "failed"].includes(providerStatus);
  const processing = providerStatus === "processing";
  const now = new Date().toISOString();

  const transactions = isRecord(providerOrder.transactions) ? providerOrder.transactions : null;
  const providerPayments =
    transactions && Array.isArray(transactions.payments) ? transactions.payments : [];
  const providerPayment =
    providerPayments.length > 0 && isRecord(providerPayments[0]) ? providerPayments[0] : null;
  const providerTransactionId = providerPayment ? text(providerPayment.id) : null;
  const providerRefunds =
    transactions && Array.isArray(transactions.refunds) ? transactions.refunds : [];
  const providerRefund =
    providerRefunds.length > 0 && isRecord(providerRefunds[0]) ? providerRefunds[0] : null;
  const providerRefundId = providerRefund ? text(providerRefund.id) : null;
  const providerRefundAmount =
    providerRefund && Number.isFinite(Number(providerRefund.amount))
      ? Number(providerRefund.amount)
      : Number(payment.amount);

  if (paid) {
    await admin
      .from("payments")
      .update({
        status: "paid",
        paid_at: payment.paid_at ?? now,
        failed_at: null,
        failure_reason: null,
      })
      .eq("id", payment.id)
      .neq("status", "refunded");
    if (!["cancelled", "refunded"].includes(order.status))
      await admin.from("orders").update({ payment_status: "paid" }).eq("id", order.id);
  } else if (refunded) {
    await admin.from("payments").update({ status: "refunded" }).eq("id", payment.id);
    await admin.from("orders").update({ payment_status: "refunded" }).eq("id", order.id);
    await admin
      .from("refunds")
      .update({ status: "completed", provider_refund_id: providerRefundId, processed_at: now })
      .eq("payment_id", payment.id)
      .in("status", ["pending", "processing", "failed"]);
  } else if (failed) {
    await admin
      .from("payments")
      .update({
        status: "failed",
        failed_at: now,
        failure_reason: `${providerStatus}:${providerStatusDetail}`,
      })
      .eq("id", payment.id)
      .in("status", ["pending", "processing"]);
    if (order.payment_status !== "paid")
      await admin.from("orders").update({ payment_status: "failed" }).eq("id", order.id);
  } else if (processing) {
    await admin
      .from("payments")
      .update({ status: "processing" })
      .eq("id", payment.id)
      .eq("status", "pending");
  }

  if (providerTransactionId) {
    await admin.from("payment_transactions").upsert(
      {
        payment_id: payment.id,
        provider_transaction_id: providerTransactionId,
        transaction_type: "charge",
        amount: Number(payment.amount),
        status: paid || refunded ? "completed" : failed ? "failed" : "pending",
        processed_at: paid || refunded || failed ? now : null,
      },
      { onConflict: "payment_id,provider_transaction_id,transaction_type" },
    );
  }

  if (refunded && providerRefundId) {
    await admin.from("payment_transactions").upsert(
      {
        payment_id: payment.id,
        provider_transaction_id: providerRefundId,
        transaction_type: "refund",
        amount: providerRefundAmount,
        status: "completed",
        processed_at: now,
      },
      { onConflict: "payment_id,provider_transaction_id,transaction_type" },
    );
  }

  const eventId = `customer-reconcile:${payment.provider_charge_id}:${providerStatus}:${providerStatusDetail}`;
  await admin.from("payment_events").upsert(
    {
      provider: "mercadopago",
      provider_event_id: eventId,
      event_type: "order.reconciled",
      payment_id: payment.id,
      payload: {
        notification: {
          source: "authenticated_customer_reconciliation",
          data: { id: payment.provider_charge_id },
        },
        order: providerOrder,
      },
      status: "processed",
      processed_at: now,
    },
    { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
  );

  const paymentStatus = paid
    ? "paid"
    : refunded
      ? "refunded"
      : failed
        ? "failed"
        : processing
          ? "processing"
          : payment.status;
  return response(200, { paymentStatus, providerStatus, providerStatusDetail, reconciled: true });
});
