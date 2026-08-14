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
type ProviderState = {
  status: string;
  paid: boolean;
  refunded: boolean;
  failed: boolean;
  processing: boolean;
  payload: unknown;
};

type CancelledPaymentRecovery = {
  refundId: string;
  refundStatus: string;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const reply = (status: number, body: JsonRecord) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function recoverCancelledPaidOrder(input: {
  admin: ReturnType<typeof createClient>;
  supabaseUrl: string;
  anonKey: string;
  authorization: string;
  order: { id: string; status: string; payment_status: string };
  payment: { id: string; provider: string; status: string };
}): Promise<CancelledPaymentRecovery> {
  const { admin, supabaseUrl, anonKey, authorization, order, payment } = input;
  if (order.status !== "cancelled") throw new Error("cancelled_order_required");

  const { data: refundId, error: refundError } = await admin.rpc(
    "ensure_cancelled_paid_order_refund",
    { _payment_id: payment.id },
  );
  if (refundError || typeof refundId !== "string" || !UUID_RE.test(refundId)) {
    throw new Error("cancelled_order_refund_create_failed");
  }

  if (!["openpix", "mercadopago"].includes(payment.provider)) {
    throw new Error("cancelled_order_refund_provider_unsupported");
  }

  const refundResponse = await fetch(`${supabaseUrl}/functions/v1/process-refund`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      apikey: anonKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ refundId }),
  });
  const refundPayload = await readJson(refundResponse);
  if (!refundResponse.ok) {
    throw new Error(
      isRecord(refundPayload) && text(refundPayload.code)
        ? `cancelled_order_refund_${text(refundPayload.code)}`
        : `cancelled_order_refund_http_${refundResponse.status}`,
    );
  }

  const refund =
    isRecord(refundPayload) && isRecord(refundPayload.refund) ? refundPayload.refund : null;
  const refundStatus =
    text(refund?.status) ?? (refundResponse.status === 202 ? "processing" : "completed");
  return { refundId, refundStatus };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST")
    return reply(405, { error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" });

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer "))
    return reply(401, { error: "Autenticação obrigatória.", code: "UNAUTHORIZED" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey)
    return reply(500, {
      error: "Serviço temporariamente indisponível.",
      code: "SERVER_CONFIGURATION",
    });

  const auth = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await auth.auth.getUser(authorization.slice(7));
  if (authError || !authData.user)
    return reply(401, { error: "Sessão inválida ou expirada.", code: "UNAUTHORIZED" });

  const body = await request.json().catch(() => null);
  const orderId = isRecord(body) ? text(body.orderId) : null;
  if (!orderId || !UUID_RE.test(orderId))
    return reply(400, { error: "Pedido inválido.", code: "INVALID_ORDER_ID" });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,customer_user_id,status,payment_status,total")
    .eq("id", orderId)
    .eq("customer_user_id", authData.user.id)
    .maybeSingle();
  if (orderError)
    return reply(500, {
      error: "Não foi possível consultar o pedido.",
      code: "ORDER_LOOKUP_FAILED",
    });
  if (!order) return reply(404, { error: "Pedido não encontrado.", code: "ORDER_NOT_FOUND" });

  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .select("id,provider,provider_charge_id,status,amount,paid_at")
    .eq("order_id", order.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentError)
    return reply(500, {
      error: "Não foi possível consultar o pagamento.",
      code: "PAYMENT_LOOKUP_FAILED",
    });
  if (!payment?.provider_charge_id)
    return reply(404, { error: "Pagamento não encontrado.", code: "PAYMENT_NOT_FOUND" });

  if (
    payment.status === "refunded" ||
    order.payment_status === "refunded" ||
    order.status === "refunded"
  ) {
    return reply(200, {
      paymentStatus: "refunded",
      providerStatus: "refunded",
      reconciled: false,
      provider: payment.provider,
    });
  }

  if (payment.status === "paid" && order.payment_status === "paid") {
    if (order.status === "cancelled") {
      try {
        const recovery = await recoverCancelledPaidOrder({
          admin,
          supabaseUrl,
          anonKey,
          authorization,
          order,
          payment,
        });
        return reply(recovery.refundStatus === "completed" ? 200 : 202, {
          paymentStatus: recovery.refundStatus === "completed" ? "refunded" : "processing",
          providerStatus: "confirmed",
          refundStatus: recovery.refundStatus,
          refundId: recovery.refundId,
          reconciled: true,
          provider: payment.provider,
        });
      } catch (error) {
        console.error("sync-payment-status cancelled order refund recovery failed", {
          orderId: order.id,
          paymentId: payment.id,
          message: error instanceof Error ? error.message : "unknown",
        });
        return reply(502, {
          error: "Pagamento recebido após o cancelamento; estorno pendente de nova tentativa.",
          code: "REFUND_RECONCILIATION_FAILED",
        });
      }
    }

    if (payment.provider === "openpix") {
      const { error: reserveError } = await admin.rpc("reserve_paid_order_merchant_net", {
        _order_id: order.id,
      });
      if (reserveError)
        return reply(500, {
          error: "Pagamento confirmado; conciliação financeira pendente.",
          code: "WALLET_SYNC_FAILED",
        });
    }
    return reply(200, {
      paymentStatus: "paid",
      providerStatus: "confirmed",
      reconciled: false,
      provider: payment.provider,
    });
  }

  let provider: ProviderState;
  try {
    if (payment.provider === "openpix") provider = await getOpenPixState(admin, order, payment);
    else if (payment.provider === "asaas") provider = await getAsaasState(order, payment);
    else if (payment.provider === "mercadopago")
      provider = await getMercadoPagoState(order, payment);
    else
      return reply(409, {
        error: "Provedor deste pagamento não suportado para conciliação.",
        code: "UNSUPPORTED_PROVIDER",
      });
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider_lookup_failed";
    const conflict = message.startsWith("conflict:");
    return reply(conflict ? 409 : 502, {
      error: conflict
        ? "Pagamento divergente no provedor."
        : "Não foi possível confirmar o pagamento agora.",
      code: conflict ? message.slice("conflict:".length) : "PROVIDER_LOOKUP_FAILED",
    });
  }

  const now = new Date().toISOString();
  let paymentStatus = payment.status;
  let cancelledRecovery: CancelledPaymentRecovery | null = null;
  if (provider.paid) {
    const { error } = await admin
      .from("payments")
      .update({
        status: "paid",
        paid_at: payment.paid_at ?? now,
        failed_at: null,
        failure_reason: null,
      })
      .eq("id", payment.id)
      .neq("status", "refunded");
    if (error)
      return reply(500, { error: "Falha ao atualizar pagamento.", code: "PAYMENT_UPDATE_FAILED" });

    if (order.status === "cancelled") {
      try {
        cancelledRecovery = await recoverCancelledPaidOrder({
          admin,
          supabaseUrl,
          anonKey,
          authorization,
          order,
          payment: { ...payment, status: "paid" },
        });
      } catch (error) {
        console.error("sync-payment-status late payment refund recovery failed", {
          orderId: order.id,
          paymentId: payment.id,
          message: error instanceof Error ? error.message : "unknown",
        });
        return reply(502, {
          error: "Pagamento recebido após o cancelamento; estorno pendente de nova tentativa.",
          code: "REFUND_RECONCILIATION_FAILED",
        });
      }
      paymentStatus = cancelledRecovery.refundStatus === "completed" ? "refunded" : "processing";
    } else if (order.status !== "refunded") {
      const { error: orderUpdateError } = await admin
        .from("orders")
        .update({ payment_status: "paid" })
        .eq("id", order.id)
        .neq("status", "cancelled")
        .neq("status", "refunded");
      if (orderUpdateError)
        return reply(500, { error: "Falha ao sincronizar pedido.", code: "ORDER_UPDATE_FAILED" });

      if (payment.provider === "openpix") {
        const { error: reserveError } = await admin.rpc("reserve_paid_order_merchant_net", {
          _order_id: order.id,
        });
        if (reserveError)
          return reply(500, {
            error: "Pagamento confirmado; conciliação financeira pendente.",
            code: "WALLET_SYNC_FAILED",
          });
      }
      paymentStatus = "paid";
    }
  } else if (provider.refunded) {
    await admin.from("payments").update({ status: "refunded" }).eq("id", payment.id);
    await admin.from("orders").update({ payment_status: "refunded" }).eq("id", order.id);
    paymentStatus = "refunded";
  } else if (provider.failed) {
    await admin
      .from("payments")
      .update({ status: "failed", failed_at: now, failure_reason: provider.status })
      .eq("id", payment.id)
      .in("status", ["pending", "processing"]);
    if (order.payment_status !== "paid")
      await admin.from("orders").update({ payment_status: "failed" }).eq("id", order.id);
    paymentStatus = "failed";
  } else if (provider.processing) {
    await admin
      .from("payments")
      .update({ status: "processing" })
      .eq("id", payment.id)
      .eq("status", "pending");
    paymentStatus = "processing";
  }

  const eventId = `customer-reconcile:${payment.provider_charge_id}:${provider.status}`;
  await admin.from("payment_events").upsert(
    {
      provider: payment.provider,
      provider_event_id: eventId,
      event_type: "payment.reconciled",
      payment_id: payment.id,
      payload: { source: "authenticated_customer_reconciliation", resource: provider.payload },
      status: "processed",
      processed_at: now,
    },
    { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
  );

  return reply(cancelledRecovery?.refundStatus === "processing" ? 202 : 200, {
    paymentStatus,
    providerStatus: provider.status,
    refundStatus: cancelledRecovery?.refundStatus ?? null,
    refundId: cancelledRecovery?.refundId ?? null,
    reconciled: true,
    provider: payment.provider,
  });
});

async function getOpenPixState(admin: any, order: any, payment: any): Promise<ProviderState> {
  const { data: environmentSetting } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "openpix_environment")
    .maybeSingle();
  const environment =
    typeof environmentSetting?.value === "string"
      ? environmentSetting.value.trim().toLowerCase()
      : "sandbox";
  if (!["sandbox", "production"].includes(environment))
    throw new Error("provider_environment_invalid");
  const appId =
    environment === "production"
      ? Deno.env.get("OPENPIX_APP_ID_PRODUCTION")?.trim()
      : Deno.env.get("OPENPIX_APP_ID_SANDBOX")?.trim();
  if (!appId) throw new Error("provider_not_configured");
  const apiBase = environment === "production" ? OPENPIX_PRODUCTION_BASE : OPENPIX_SANDBOX_BASE;
  const res = await fetch(
    `${apiBase}/api/v1/charge/${encodeURIComponent(payment.provider_charge_id)}`,
    {
      headers: { Authorization: appId, Accept: "application/json" },
    },
  );
  const payload = await readJson(res);
  if (!res.ok || !isRecord(payload) || !isRecord(payload.charge))
    throw new Error("provider_lookup_failed");
  const charge = payload.charge;
  const correlationID = text(charge.correlationID);
  const legacyCorrelationID = `apois-entrega-order-${order.id}`;
  const retryCorrelationPrefix = `${legacyCorrelationID}-payment-`;
  if (
    correlationID &&
    correlationID !== legacyCorrelationID &&
    !correlationID.startsWith(retryCorrelationPrefix)
  )
    throw new Error("conflict:EXTERNAL_REFERENCE_MISMATCH");
  const cents = Number(charge.value);
  if (!Number.isFinite(cents) || Math.round(cents) !== Math.round(Number(payment.amount) * 100))
    throw new Error("conflict:AMOUNT_MISMATCH");
  const status = (text(charge.status) ?? "UNKNOWN").toUpperCase();
  return {
    status,
    paid: status === "COMPLETED",
    refunded: false,
    failed: ["EXPIRED", "CANCELLED", "CANCELED"].includes(status),
    processing: ["ACTIVE", "CREATED", "PENDING"].includes(status),
    payload: charge,
  };
}

async function getAsaasState(order: any, payment: any): Promise<ProviderState> {
  const environment = (Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox").trim().toLowerCase();
  const apiKey =
    environment === "production"
      ? Deno.env.get("ASAAS_API_KEY_PRODUCTION")?.trim()
      : Deno.env.get("ASAAS_API_KEY_SANDBOX")?.trim() || Deno.env.get("ASAAS_API_KEY")?.trim();
  if (!apiKey) throw new Error("provider_not_configured");
  const apiBase =
    environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  const res = await fetch(`${apiBase}/payments/${encodeURIComponent(payment.provider_charge_id)}`, {
    headers: { access_token: apiKey, Accept: "application/json" },
  });
  const resource = await readJson(res);
  if (!res.ok || !isRecord(resource)) throw new Error("provider_lookup_failed");
  if (text(resource.id) !== payment.provider_charge_id)
    throw new Error("conflict:PROVIDER_RESOURCE_MISMATCH");
  const externalReference = text(resource.externalReference) ?? text(resource.external_reference);
  if (externalReference && externalReference !== `apois-order-${order.id}`)
    throw new Error("conflict:EXTERNAL_REFERENCE_MISMATCH");
  const amount = Number(resource.value);
  if (
    !Number.isFinite(amount) ||
    Math.round(amount * 100) !== Math.round(Number(payment.amount) * 100)
  )
    throw new Error("conflict:AMOUNT_MISMATCH");
  const status = (text(resource.status) ?? "UNKNOWN").toUpperCase();
  return {
    status,
    paid: ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(status),
    refunded: [
      "REFUNDED",
      "REFUND_REQUESTED",
      "REFUND_IN_PROGRESS",
      "PARTIALLY_REFUNDED",
    ].includes(status),
    failed: [
      "OVERDUE",
      "DELETED",
      "CANCELED",
      "CANCELLED",
      "CHARGEBACK_REQUESTED",
      "CHARGEBACK_DISPUTE",
    ].includes(status),
    processing: ["PENDING", "AWAITING_RISK_ANALYSIS"].includes(status),
    payload: resource,
  };
}

async function getMercadoPagoState(order: any, payment: any): Promise<ProviderState> {
  const environment = (Deno.env.get("MERCADO_PAGO_ENVIRONMENT") ?? "test").trim().toLowerCase();
  const accessToken =
    environment !== "production"
      ? Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_TEST")?.trim() ||
        Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")?.trim()
      : Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_PRODUCTION")?.trim();
  if (!accessToken) throw new Error("provider_not_configured");
  const apiBase = (Deno.env.get("MERCADO_PAGO_API_URL") ?? "https://api.mercadopago.com").replace(
    /\/$/,
    "",
  );
  const res = await fetch(
    `${apiBase}/v1/orders/${encodeURIComponent(payment.provider_charge_id)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    },
  );
  const resource = await readJson(res);
  if (!res.ok || !isRecord(resource)) throw new Error("provider_lookup_failed");
  if (text(resource.id) !== payment.provider_charge_id)
    throw new Error("conflict:PROVIDER_RESOURCE_MISMATCH");
  if (text(resource.external_reference) !== `apois-order-${order.id}`)
    throw new Error("conflict:EXTERNAL_REFERENCE_MISMATCH");
  const amount = Number(resource.total_amount);
  if (
    !Number.isFinite(amount) ||
    Math.round(amount * 100) !== Math.round(Number(payment.amount) * 100)
  )
    throw new Error("conflict:AMOUNT_MISMATCH");
  const status = text(resource.status) ?? "unknown";
  const detail = text(resource.status_detail) ?? "unknown";
  return {
    status: `${status}:${detail}`,
    paid: status === "processed" && detail === "accredited",
    refunded: status === "refunded" || detail === "refunded",
    failed: ["canceled", "expired", "failed"].includes(status),
    processing: status === "processing",
    payload: resource,
  };
}
