import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function identifier(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

async function validSignature(request: Request, dataId: string, secrets: string[]): Promise<boolean> {
  const signature = request.headers.get("x-signature")?.trim();
  if (!signature) return false;
  const { ts, v1 } = parseSignature(signature);
  if (!ts || !v1 || !/^\d+$/.test(ts)) return false;
  const requestId = request.headers.get("x-request-id")?.trim();
  const candidates = Array.from(new Set([dataId.toLowerCase(), dataId]));

  for (const secret of secrets) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    for (const candidate of candidates) {
      const parts = [`id:${candidate}`];
      if (requestId) parts.push(`request-id:${requestId}`);
      parts.push(`ts:${ts}`);
      const manifest = `${parts.join(";")};`;
      const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
      if (constantTimeEqual(toHex(digest), v1.toLowerCase())) return true;
    }
  }
  return false;
}

function isSandboxOrderId(value: string): boolean {
  return /^ORDTST[0-9A-Z]{20,}$/i.test(value);
}

function merchantIdFromReference(value: string | null): string | null {
  const prefix = "apois-merchant-";
  if (!value?.startsWith(prefix)) return null;
  const id = value.slice(prefix.length);
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

function addOneMonth(value: string): string {
  const date = new Date(value);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const daysInMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(originalDay, daysInMonth));
  return date.toISOString();
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return response(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const environment = (Deno.env.get("MERCADO_PAGO_ENVIRONMENT") ?? "test")
    .trim()
    .toLowerCase();
  const accessTokenTest =
    Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_TEST")?.trim() ||
    Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN")?.trim() ||
    null;
  const accessTokenProduction =
    Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_PRODUCTION")?.trim() || null;
  const webhookSecretTest = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET_TEST")?.trim() || null;
  const webhookSecretProduction =
    Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET_PRODUCTION")?.trim() || null;
  const webhookSecretLegacy = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET")?.trim() || null;
  const apiBase = (
    Deno.env.get("MERCADO_PAGO_API_URL") ?? "https://api.mercadopago.com"
  ).replace(/\/$/, "");
  const accessToken = environment === "production" ? accessTokenProduction : accessTokenTest;
  const signatureSecrets = Array.from(
    new Set(
      (environment === "production"
        ? [webhookSecretProduction, webhookSecretLegacy]
        : [webhookSecretTest, webhookSecretLegacy, webhookSecretProduction]
      ).filter((value): value is string => Boolean(value)),
    ),
  );

  if (!supabaseUrl || !serviceRoleKey || !accessToken || signatureSecrets.length === 0) {
    console.error("mercadopago-webhook environment incomplete", { environment });
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
  const dataId = url.searchParams.get("data.id")?.trim() ?? identifier(bodyData?.id);
  if (!dataId) return response(400, { error: "missing_data_id" });

  const notificationType = text(payload.type) ?? text(payload.action) ?? "order";
  const signatureValid = await validSignature(request, dataId, signatureSecrets);
  const isSubscriptionNotification = [
    "subscription_preapproval",
    "subscription_authorized_payment",
  ].includes(notificationType);
  const sandboxProviderVerificationAllowed =
    environment !== "production" && (isSubscriptionNotification || isSandboxOrderId(dataId));
  if (!signatureValid && !sandboxProviderVerificationAllowed) {
    console.warn("mercadopago webhook invalid signature", {
      dataId,
      notificationType,
      environment,
    });
    return response(401, { error: "invalid_signature" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (notificationType === "subscription_preapproval") {
    const providerResponse = await fetch(
      `${apiBase}/preapproval/${encodeURIComponent(dataId)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    );
    const providerRaw: unknown = await providerResponse.json().catch(() => null);
    if (!providerResponse.ok || !isRecord(providerRaw)) {
      return signatureValid
        ? response(200, { accepted: true, ignored: true })
        : response(401, { error: "sandbox_resource_not_verified" });
    }
    if (identifier(providerRaw.id) !== dataId)
      return response(409, { error: "provider_resource_mismatch" });

    const merchantId = merchantIdFromReference(text(providerRaw.external_reference));
    const recurring = isRecord(providerRaw.auto_recurring) ? providerRaw.auto_recurring : null;
    const amount = numberValue(recurring?.transaction_amount);
    const currency = text(recurring?.currency_id);
    if (!merchantId || amount === null || Math.round(amount * 100) !== 6990 || currency !== "BRL") {
      return response(200, { accepted: true, ignored: true });
    }

    const { data: subscription } = await admin
      .from("merchant_subscriptions")
      .select("id,merchant_id")
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (!subscription) return response(200, { accepted: true, ignored: true });

    const providerStatus = text(providerRaw.status) ?? "unknown";
    const eventId = `${notificationType}:${identifier(payload.id) ?? dataId}:${providerStatus}`;
    const { data: existing } = await admin
      .from("merchant_subscription_events")
      .select("id")
      .eq("provider_event_id", eventId)
      .maybeSingle();
    if (existing) return response(200, { accepted: true, duplicate: true });

    const { data: eventRow } = await admin
      .from("merchant_subscription_events")
      .insert({
        merchant_subscription_id: subscription.id,
        provider_event_id: eventId,
        event_type: notificationType,
        provider_resource_id: dataId,
        payload: { notification: payload, preapproval: providerRaw },
      })
      .select("id")
      .single();

    const now = new Date().toISOString();
    await admin
      .from("merchant_subscriptions")
      .update({
        provider_preapproval_id: dataId,
        provider_status: providerStatus,
        checkout_url: text(providerRaw.init_point),
        next_payment_at: text(providerRaw.next_payment_date),
        metadata: { environment },
        updated_at: now,
      })
      .eq("id", subscription.id);
    if (eventRow)
      await admin
        .from("merchant_subscription_events")
        .update({ processed_at: now })
        .eq("id", eventRow.id);

    return response(200, {
      accepted: true,
      processed: providerStatus,
      verification: signatureValid ? "hmac" : "sandbox_provider_lookup",
    });
  }

  if (notificationType === "subscription_authorized_payment") {
    const invoiceResponse = await fetch(
      `${apiBase}/authorized_payments/${encodeURIComponent(dataId)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    );
    const invoiceRaw: unknown = await invoiceResponse.json().catch(() => null);
    if (!invoiceResponse.ok || !isRecord(invoiceRaw)) {
      return signatureValid
        ? response(200, { accepted: true, ignored: true })
        : response(401, { error: "sandbox_resource_not_verified" });
    }
    if (identifier(invoiceRaw.id) !== dataId)
      return response(409, { error: "provider_resource_mismatch" });

    const preapprovalId = identifier(invoiceRaw.preapproval_id);
    if (!preapprovalId) return response(200, { accepted: true, ignored: true });
    const { data: subscription } = await admin
      .from("merchant_subscriptions")
      .select("id,merchant_id,current_period_end")
      .eq("provider_preapproval_id", preapprovalId)
      .maybeSingle();
    if (!subscription) return response(200, { accepted: true, ignored: true });

    const amount = numberValue(invoiceRaw.transaction_amount);
    const currency = text(invoiceRaw.currency_id);
    if (amount === null || Math.round(amount * 100) !== 6990 || currency !== "BRL")
      return response(409, { error: "amount_mismatch" });

    const payment = isRecord(invoiceRaw.payment) ? invoiceRaw.payment : null;
    const paymentStatus = text(payment?.status) ?? text(invoiceRaw.status) ?? "unknown";
    const eventId = `${notificationType}:${identifier(payload.id) ?? dataId}:${paymentStatus}:${identifier(payment?.id) ?? "none"}`;
    const { data: existing } = await admin
      .from("merchant_subscription_events")
      .select("id")
      .eq("provider_event_id", eventId)
      .maybeSingle();
    if (existing) return response(200, { accepted: true, duplicate: true });

    const { data: eventRow } = await admin
      .from("merchant_subscription_events")
      .insert({
        merchant_subscription_id: subscription.id,
        provider_event_id: eventId,
        event_type: notificationType,
        provider_resource_id: dataId,
        payload: { notification: payload, authorized_payment: invoiceRaw },
      })
      .select("id")
      .single();

    const now = new Date().toISOString();
    const debitDate = text(invoiceRaw.debit_date) ?? text(invoiceRaw.date_created) ?? now;
    const approved = paymentStatus === "approved";

    await admin.from("merchant_subscription_payments").upsert(
      {
        merchant_subscription_id: subscription.id,
        provider_authorized_payment_id: dataId,
        provider_payment_id: identifier(payment?.id),
        amount,
        currency,
        status: paymentStatus,
        debit_date: debitDate,
        paid_at: approved ? debitDate : null,
        provider_payload: invoiceRaw,
        updated_at: now,
      },
      { onConflict: "provider_authorized_payment_id" },
    );

    const preapprovalResponse = await fetch(
      `${apiBase}/preapproval/${encodeURIComponent(preapprovalId)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    );
    const preapprovalRaw: unknown = await preapprovalResponse.json().catch(() => null);
    const preapproval =
      preapprovalResponse.ok && isRecord(preapprovalRaw) ? preapprovalRaw : null;
    const providerStatus = text(preapproval?.status) ?? "authorized";
    const nextPaymentAt = text(preapproval?.next_payment_date);

    const update: JsonRecord = {
      provider_status: providerStatus,
      next_payment_at: nextPaymentAt,
      last_payment_status: paymentStatus,
      updated_at: now,
      metadata: { environment },
    };
    if (approved) {
      const periodEnd =
        nextPaymentAt && new Date(nextPaymentAt).getTime() > new Date(debitDate).getTime()
          ? nextPaymentAt
          : addOneMonth(debitDate);
      update.current_period_start = debitDate;
      update.current_period_end = periodEnd;
      update.last_payment_at = debitDate;
    }
    await admin.from("merchant_subscriptions").update(update).eq("id", subscription.id);
    if (eventRow)
      await admin
        .from("merchant_subscription_events")
        .update({ processed_at: now })
        .eq("id", eventRow.id);

    return response(200, {
      accepted: true,
      processed: paymentStatus,
      verification: signatureValid ? "hmac" : "sandbox_provider_lookup",
    });
  }

  if (notificationType === "payment") {
    return response(200, { accepted: true, ignored: true });
  }

  const sandboxOrder = isSandboxOrderId(dataId);
  const sandboxVerifiedByProvider =
    !signatureValid && environment !== "production" && sandboxOrder;
  const providerResponse = await fetch(`${apiBase}/v1/orders/${encodeURIComponent(dataId)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  let providerOrder: unknown = null;
  try {
    providerOrder = await providerResponse.json();
  } catch {
    // Unknown/simulated resources are acknowledged only when signed.
  }

  if (providerResponse.status === 404) {
    return signatureValid
      ? response(200, { accepted: true, ignored: true })
      : response(401, { error: "sandbox_resource_not_verified" });
  }
  if (!providerResponse.ok || !isRecord(providerOrder)) {
    console.error("mercadopago webhook order lookup failed", {
      status: providerResponse.status,
      dataId,
      signatureValid,
    });
    return response(503, { error: "provider_lookup_failed" });
  }
  if (text(providerOrder.id) !== dataId)
    return response(409, { error: "provider_resource_mismatch" });

  const externalReference = text(providerOrder.external_reference);
  const internalOrderId = externalReference?.startsWith("apois-order-")
    ? externalReference.slice("apois-order-".length)
    : null;
  if (!internalOrderId || !/^[0-9a-f-]{36}$/i.test(internalOrderId))
    return response(200, { accepted: true, ignored: true });

  const providerStatus = text(providerOrder.status) ?? "unknown";
  const providerStatusDetail = text(providerOrder.status_detail) ?? "unknown";
  const eventType = signatureValid
    ? text(payload.action) ?? text(payload.type) ?? "order.updated"
    : "order.reconciled";
  const providerNotificationId = signatureValid
    ? identifier(payload.id) ?? `${eventType}:${dataId}:${providerStatus}:${providerStatusDetail}`
    : `provider-reconcile:${dataId}:${providerStatus}:${providerStatusDetail}`;

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
  if (!payment) return response(503, { error: "payment_not_ready" });

  const providerAmount = Number(providerOrder.total_amount);
  if (
    !Number.isFinite(providerAmount) ||
    Math.round(providerAmount * 100) !== Math.round(Number(payment.amount) * 100)
  ) {
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

  const safeNotification = signatureValid
    ? payload
    : { type: "order", data: { id: dataId }, source: "sandbox_provider_reconciliation" };
  const { data: eventRow, error: eventError } = await admin
    .from("payment_events")
    .insert({
      provider: "mercadopago",
      provider_event_id: eventId,
      event_type: eventType,
      payment_id: payment.id,
      payload: { notification: safeNotification, order: providerOrder },
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
      await admin
        .from("payment_events")
        .update({ status: "failed", error_message: updateError.code, processed_at: now })
        .eq("id", eventRow.id);
      return response(500, { error: "payment_update_failed" });
    }
    if (!["cancelled", "refunded"].includes(internalOrder.status))
      await admin.from("orders").update({ payment_status: "paid" }).eq("id", internalOrder.id);
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
      await admin
        .from("orders")
        .update({ payment_status: "refunded" })
        .eq("id", internalOrder.id);
    } else {
      await admin.from("order_status_history").insert({
        order_id: internalOrder.id,
        status: "refunded",
        changed_by_user_id: null,
      });
    }
    const refundQuery = admin
      .from("refunds")
      .update({ status: "completed", provider_refund_id: providerRefundId, processed_at: now })
      .eq("payment_id", payment.id)
      .in("status", ["pending", "processing", "failed"]);
    if (providerRefundId) {
      await refundQuery.or(`provider_refund_id.is.null,provider_refund_id.eq.${providerRefundId}`);
    } else {
      await refundQuery;
    }
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
    if (internalOrder.payment_status !== "paid")
      await admin
        .from("orders")
        .update({ payment_status: "failed" })
        .eq("id", internalOrder.id);
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

  await admin
    .from("payment_events")
    .update({ status: "processed", processed_at: now })
    .eq("id", eventRow.id);
  return response(200, {
    accepted: true,
    processed: providerStatus,
    verification: signatureValid
      ? "hmac"
      : sandboxVerifiedByProvider
        ? "sandbox_provider_lookup"
        : "provider_lookup",
  });
});
