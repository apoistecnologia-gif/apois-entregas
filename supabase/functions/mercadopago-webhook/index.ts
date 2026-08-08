import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
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
function parseSignature(value: string): { ts: string | null; v1: string | null } {
  let ts: string | null = null;
  let v1: string | null = null;
  for (const part of value.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim().toLowerCase();
    const entry = part.slice(separator + 1).trim();
    if (key === "ts") ts = entry || null;
    if (key === "v1") v1 = entry || null;
  }
  return { ts, v1 };
}
function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return diff === 0;
}
async function validSignature(request: Request, dataId: string, secret: string): Promise<boolean> {
  const signature = request.headers.get("x-signature")?.trim();
  if (!signature) return false;
  const { ts, v1 } = parseSignature(signature);
  if (!ts || !v1 || !/^\d+$/.test(ts)) return false;

  const requestId = request.headers.get("x-request-id")?.trim();
  const parts = [`id:${dataId}`];
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);
  const manifest = `${parts.join(";")};`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  return constantTimeEqual(toHex(digest), v1.toLowerCase());
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return response(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  const webhookSecret = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET");
  const apiBase = (Deno.env.get("MERCADO_PAGO_API_URL") ?? "https://api.mercadopago.com").replace(/\/$/, "");

  if (!supabaseUrl || !serviceRoleKey || !accessToken || !webhookSecret) {
    console.error("mercadopago-webhook environment incomplete");
    return response(500, { error: "server_configuration" });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return response(400, { error: "invalid_json" });
  }
  if (!isRecord(payload)) return response(400, { error: "invalid_payload" });

  const url = new URL(request.url);
  const bodyData = isRecord(payload.data) ? payload.data : null;
  const dataId = url.searchParams.get("data.id")?.trim() ?? text(bodyData?.id);
  if (!dataId) return response(400, { error: "missing_data_id" });
  if (!(await validSignature(request, dataId, webhookSecret))) {
    return response(401, { error: "invalid_signature" });
  }

  const providerResponse = await fetch(`${apiBase}/v1/orders/${encodeURIComponent(dataId)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  let providerOrder: unknown = null;
  try {
    providerOrder = await providerResponse.json();
  } catch {
    // Keep a safe ignored response for simulated/unknown resources.
  }
  if (providerResponse.status === 404) return response(200, { accepted: true, ignored: true });
  if (!providerResponse.ok || !isRecord(providerOrder)) {
    console.error("mercadopago webhook order lookup failed", { status: providerResponse.status, dataId });
    return response(503, { error: "provider_lookup_failed" });
  }

  const externalReference = text(providerOrder.external_reference);
  const internalOrderId = externalReference?.startsWith("apois-order-")
    ? externalReference.slice("apois-order-".length)
    : null;
  if (!internalOrderId || !/^[0-9a-f-]{36}$/i.test(internalOrderId)) {
    return response(200, { accepted: true, ignored: true });
  }

  const providerStatus = text(providerOrder.status) ?? "unknown";
  const providerStatusDetail = text(providerOrder.status_detail) ?? "unknown";
  const eventType = text(payload.action) ?? text(payload.type) ?? "order.updated";
  const providerNotificationId = text(payload.id) ?? `${eventType}:${dataId}:${providerStatus}:${providerStatusDetail}`;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: internalOrder } = await admin
    .from("orders")
    .select("id,status,payment_status,total")
    .eq("id", internalOrderId)
    .maybeSingle();
  if (!internalOrder) return response(200, { accepted: true, ignored: true });

  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .select("id,order_id,status,amount,provider_charge_id")
    .eq("provider", "mercadopago")
    .eq("provider_charge_id", dataId)
    .eq("order_id", internalOrderId)
    .maybeSingle();
  if (paymentError) {
    console.error("mercadopago webhook payment lookup failed", { code: paymentError.code });
    return response(500, { error: "payment_lookup_failed" });
  }
  if (!payment) {
    return response(503, { error: "payment_not_ready" });
  }

  const providerAmount = Number(providerOrder.total_amount);
  if (!Number.isFinite(providerAmount) || Math.round(providerAmount * 100) !== Math.round(Number(payment.amount) * 100)) {
    console.error("mercadopago webhook amount mismatch", { paymentId: payment.id });
    return response(409, { error: "amount_mismatch" });
  }

  const eventId = `${providerNotificationId}:${providerStatus}:${providerStatusDetail}`;
  const { data: existingEvent } = await admin
    .from("payment_events")
    .select("id")
    .eq("provider", "mercadopago")
    .eq("provider_event_id", eventId)
    .maybeSingle();
  if (existingEvent) return response(200, { accepted: true, duplicate: true });

  const { data: eventRow, error: eventError } = await admin
    .from("payment_events")
    .insert({
      provider: "mercadopago",
      provider_event_id: eventId,
      event_type: eventType,
      payment_id: payment.id,
      payload: { notification: payload, order: providerOrder },
      status: "received",
    })
    .select("id")
    .single();
  if (eventError || !eventRow) {
    if (eventError?.code === "23505") return response(200, { accepted: true, duplicate: true });
    console.error("mercadopago webhook event insert failed", { code: eventError?.code });
    return response(500, { error: "event_persistence_failed" });
  }

  const transactions = isRecord(providerOrder.transactions) ? providerOrder.transactions : null;
  const providerPayments = transactions && Array.isArray(transactions.payments) ? transactions.payments : [];
  const providerPayment = providerPayments.length > 0 && isRecord(providerPayments[0]) ? providerPayments[0] : null;
  const providerTransactionId = providerPayment ? text(providerPayment.id) : null;
  const providerRefunds = transactions && Array.isArray(transactions.refunds) ? transactions.refunds : [];
  const providerRefund = providerRefunds.length > 0 && isRecord(providerRefunds[0]) ? providerRefunds[0] : null;
  const providerRefundId = providerRefund ? text(providerRefund.id) : null;
  const providerRefundAmount = providerRefund && Number.isFinite(Number(providerRefund.amount))
    ? Number(providerRefund.amount)
    : Number(payment.amount);
  const now = new Date().toISOString();

  const paid = providerStatus === "processed" && providerStatusDetail === "accredited";
  const refunded = providerStatus === "refunded" || providerStatusDetail === "refunded";
  const failed = ["canceled", "expired", "failed"].includes(providerStatus);
  const processing = providerStatus === "processing";

  if (paid) {
    const { error: updateError } = await admin
      .from("payments")
      .update({ status: "paid", paid_at: now, failed_at: null, failure_reason: null })
      .eq("id", payment.id)
      .neq("status", "refunded");
    if (updateError) {
      await admin.from("payment_events").update({ status: "failed", error_message: updateError.code, processed_at: now }).eq("id", eventRow.id);
      return response(500, { error: "payment_update_failed" });
    }
    if (!["cancelled", "refunded"].includes(internalOrder.status)) {
      await admin.from("orders").update({ payment_status: "paid" }).eq("id", internalOrder.id);
    }
  } else if (refunded) {
    await admin.from("payments").update({ status: "refunded" }).eq("id", payment.id);
    const { data: transitionedOrder } = await admin
      .from("orders")
      .update({ payment_status: "refunded", status: "refunded" })
      .eq("id", internalOrder.id)
      .eq("status", "cancelled")
      .select("id")
      .maybeSingle();
    if (!transitionedOrder) {
      await admin.from("orders").update({ payment_status: "refunded" }).eq("id", internalOrder.id);
    } else {
      await admin.from("order_status_history").insert({ order_id: internalOrder.id, status: "refunded", changed_by_user_id: null });
    }

    const refundQuery = admin.from("refunds").update({
      status: "completed",
      provider_refund_id: providerRefundId,
      processed_at: now,
    }).eq("payment_id", payment.id).in("status", ["pending", "processing", "failed"]);
    if (providerRefundId) {
      await refundQuery.or(`provider_refund_id.is.null,provider_refund_id.eq.${providerRefundId}`);
    } else {
      await refundQuery;
    }
  } else if (failed) {
    await admin
      .from("payments")
      .update({ status: "failed", failed_at: now, failure_reason: `${providerStatus}:${providerStatusDetail}` })
      .eq("id", payment.id)
      .in("status", ["pending", "processing"]);
    if (internalOrder.payment_status !== "paid") {
      await admin.from("orders").update({ payment_status: "failed" }).eq("id", internalOrder.id);
    }
  } else if (processing) {
    await admin.from("payments").update({ status: "processing" }).eq("id", payment.id).eq("status", "pending");
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

  await admin.from("payment_events").update({ status: "processed", processed_at: now }).eq("id", eventRow.id);
  return response(200, { accepted: true, processed: providerStatus });
});
