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
  const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
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
  if (!accessToken) {
    return response(503, {
      error: "Estornos ainda não estão habilitados.",
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return response(400, { error: "Requisição inválida.", code: "INVALID_REQUEST" });
  }
  if (
    !isRecord(payload) ||
    typeof payload.refundId !== "string" ||
    !UUID_RE.test(payload.refundId)
  ) {
    return response(400, { error: "Estorno inválido.", code: "INVALID_REFUND_ID" });
  }

  const refundId = payload.refundId;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: refund, error: refundError } = await admin
    .from("refunds")
    .select(
      "id,payment_id,order_id,amount,reason,status,provider_refund_id,requested_by,processed_at",
    )
    .eq("id", refundId)
    .maybeSingle();
  if (refundError) {
    console.error("process-refund refund lookup failed", { code: refundError.code, refundId });
    return response(500, {
      error: "Não foi possível consultar o estorno.",
      code: "REFUND_LOOKUP_FAILED",
    });
  }
  if (!refund) return response(404, { error: "Estorno não encontrado.", code: "REFUND_NOT_FOUND" });

  const { data: order } = await admin
    .from("orders")
    .select("id,customer_user_id,status,payment_status,total")
    .eq("id", refund.order_id)
    .maybeSingle();
  if (!order) return response(404, { error: "Pedido não encontrado.", code: "ORDER_NOT_FOUND" });

  const { data: adminRole } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", authData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  const authorized =
    order.customer_user_id === authData.user.id ||
    refund.requested_by === authData.user.id ||
    Boolean(adminRole);
  if (!authorized)
    return response(403, { error: "Você não pode processar este estorno.", code: "FORBIDDEN" });

  if (refund.status === "completed") {
    return response(200, {
      refund: { id: refund.id, status: refund.status, providerRefundId: refund.provider_refund_id },
      reused: true,
    });
  }

  const { data: payment } = await admin
    .from("payments")
    .select("id,provider,provider_charge_id,status,amount")
    .eq("id", refund.payment_id)
    .maybeSingle();
  if (!payment)
    return response(409, {
      error: "Pagamento do estorno não foi encontrado.",
      code: "PAYMENT_NOT_FOUND",
    });
  if (payment.provider !== "mercadopago" || !payment.provider_charge_id) {
    return response(409, {
      error: "Este pagamento não pode ser estornado pelo gateway atual.",
      code: "PROVIDER_MISMATCH",
    });
  }
  if (Math.round(Number(payment.amount) * 100) !== Math.round(Number(refund.amount) * 100)) {
    return response(409, {
      error: "O estorno total possui valor divergente do pagamento.",
      code: "REFUND_AMOUNT_CONFLICT",
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

  const readProviderOrder = async (): Promise<{ response: Response; body: unknown }> => {
    const providerResponse = await fetch(providerOrderUrl, { headers: authHeaders });
    let body: unknown = null;
    try {
      body = await providerResponse.json();
    } catch {
      /* ignore */
    }
    return { response: providerResponse, body };
  };

  let { response: currentProviderResponse, body: providerPayload } = await readProviderOrder();
  if (!currentProviderResponse.ok || !isRecord(providerPayload)) {
    return response(502, {
      error: "Não foi possível consultar o pagamento no Mercado Pago.",
      code: "PROVIDER_LOOKUP_FAILED",
    });
  }

  if (!providerTransactionId) {
    const transactions = isRecord(providerPayload.transactions)
      ? providerPayload.transactions
      : null;
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
      // Full refund in Orders API: identify the original transaction and omit amount.
      body: JSON.stringify({ transactions: [{ id: providerTransactionId }] }),
    });

    let refundPayload: unknown = null;
    try {
      refundPayload = await providerResponse.json();
    } catch {
      /* ignore */
    }

    if (providerResponse.ok && isRecord(refundPayload)) {
      providerPayload = refundPayload;
    } else {
      const verified = await readProviderOrder();
      const verifiedRecord = isRecord(verified.body) ? verified.body : null;
      const verifiedRefunded =
        verifiedRecord &&
        (text(verifiedRecord.status) === "refunded" ||
          text(verifiedRecord.status_detail) === "refunded");
      if (!verified.response.ok || !verifiedRefunded) {
        await admin.from("refunds").update({ status: "failed" }).eq("id", refund.id);
        console.error("process-refund provider error", {
          status: providerResponse.status,
          refundId,
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
      .update({
        status: "processing",
        provider_refund_id: providerRefundId,
      })
      .eq("id", refund.id);
    return response(202, {
      refund: { id: refund.id, status: "processing", providerRefundId },
      reused: false,
    });
  }

  const now = new Date().toISOString();
  await admin
    .from("refunds")
    .update({
      status: "completed",
      provider_refund_id: providerRefundId,
      processed_at: now,
    })
    .eq("id", refund.id);
  await admin.from("payments").update({ status: "refunded" }).eq("id", payment.id);

  const { data: transitionedOrder } = await admin
    .from("orders")
    .update({ payment_status: "refunded", status: "refunded" })
    .eq("id", order.id)
    .eq("status", "cancelled")
    .select("id")
    .maybeSingle();
  if (!transitionedOrder) {
    await admin.from("orders").update({ payment_status: "refunded" }).eq("id", order.id);
  } else {
    await admin.from("order_status_history").insert({
      order_id: order.id,
      status: "refunded",
      changed_by_user_id: authData.user.id,
    });
  }

  if (providerRefundId) {
    await admin.from("payment_transactions").upsert(
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
  }

  return response(200, {
    refund: { id: refund.id, status: "completed", providerRefundId },
    reused: false,
  });
});
