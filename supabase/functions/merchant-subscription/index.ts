import { createClient } from "npm:@supabase/supabase-js@2.112.1";

type JsonRecord = Record<string, unknown>;

const MONTHLY_AMOUNT = 69.9;
const PIX_EXPIRATION_MS = 30 * 60 * 1000;
const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

function json(request: Request, status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Access-Control-Allow-Origin": request.headers.get("origin") ?? "*",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function safeProviderError(payload: unknown) {
  if (!isRecord(payload)) return null;
  const causes = Array.isArray(payload.cause)
    ? payload.cause
        .slice(0, 5)
        .map((cause) => {
          if (!isRecord(cause)) return null;
          return {
            code:
              typeof cause.code === "string" || typeof cause.code === "number" ? cause.code : null,
            description: text(cause.description),
          };
        })
        .filter(Boolean)
    : [];
  return {
    message: text(payload.message),
    error: text(payload.error),
    status: text(payload.status),
    statusDetail: text(payload.status_detail),
    code:
      typeof payload.code === "string" || typeof payload.code === "number" ? payload.code : null,
    causes,
  };
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

function providerPayment(order: JsonRecord): JsonRecord | null {
  const transactions = isRecord(order.transactions) ? order.transactions : null;
  const payments = transactions && Array.isArray(transactions.payments) ? transactions.payments : [];
  return payments.length > 0 && isRecord(payments[0]) ? payments[0] : null;
}

function orderPaid(order: JsonRecord): boolean {
  const payment = providerPayment(order);
  const orderStatus = text(order.status);
  const orderDetail = text(order.status_detail);
  const paymentStatus = text(payment?.status);
  const paymentDetail = text(payment?.status_detail);
  return (
    (orderStatus === "processed" && orderDetail === "accredited") ||
    paymentStatus === "approved" ||
    (paymentStatus === "processed" && paymentDetail === "accredited")
  );
}

function orderFailed(order: JsonRecord): boolean {
  const payment = providerPayment(order);
  const statuses = [
    text(order.status),
    text(order.status_detail),
    text(payment?.status),
    text(payment?.status_detail),
  ].filter((value): value is string => Boolean(value));
  return statuses.some((value) =>
    ["canceled", "cancelled", "expired", "failed", "rejected"].includes(value),
  );
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Origin": request.headers.get("origin") ?? "*",
      },
    });
  }
  if (request.method !== "POST") return json(request, 405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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

  if (!supabaseUrl || !serviceRoleKey || !accessToken) {
    console.error("merchant-subscription environment incomplete", { environment });
    return json(request, 500, { error: "server_configuration" });
  }

  const authorization = request.headers.get("authorization")?.trim();
  const jwt = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json(request, 401, { error: "authentication_required" });

  let payload: unknown = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }
  const body = isRecord(payload) ? payload : {};
  const action = text(body.action) ?? "checkout";
  if (!new Set(["checkout", "sync"]).has(action)) {
    return json(request, 400, { error: "invalid_action" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const user = userData.user;
  if (userError || !user) return json(request, 401, { error: "invalid_session" });

  const { data: membership, error: membershipError } = await admin
    .from("merchant_members")
    .select("merchant_id,role,status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (membershipError) return json(request, 500, { error: "membership_lookup_failed" });
  if (!membership) return json(request, 403, { error: "merchant_membership_required" });

  const { data: merchant } = await admin
    .from("merchants")
    .select("id,name,approval_status,is_active,contact_email")
    .eq("id", membership.merchant_id)
    .maybeSingle();
  if (!merchant || merchant.approval_status !== "approved" || !merchant.is_active) {
    return json(request, 409, { error: "merchant_not_approved" });
  }

  let { data: subscription } = await admin
    .from("merchant_subscriptions")
    .select("*")
    .eq("merchant_id", merchant.id)
    .maybeSingle();

  if (!subscription) {
    const created = await admin
      .from("merchant_subscriptions")
      .insert({
        merchant_id: merchant.id,
        provider: "mercadopago",
        provider_status: "pending",
        amount: MONTHLY_AMOUNT,
        currency: "BRL",
        billing_frequency: "monthly",
        metadata: { environment, billingModel: "monthly_pix" },
      })
      .select("*")
      .single();
    if (created.error || !created.data) {
      return json(request, 500, { error: "subscription_create_failed" });
    }
    subscription = created.data;
  }

  const { data: paymentRows, error: paymentsError } = await admin
    .from("merchant_subscription_payments")
    .select("*")
    .eq("merchant_subscription_id", subscription.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (paymentsError) return json(request, 500, { error: "subscription_payment_lookup_failed" });

  const reconcilePayment = async (paymentRow: any) => {
    const providerOrderId = text(paymentRow?.provider_authorized_payment_id);
    if (!providerOrderId) return false;

    const providerResponse = await fetch(`${apiBase}/v1/orders/${encodeURIComponent(providerOrderId)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    const raw: unknown = await providerResponse.json().catch(() => null);
    if (!providerResponse.ok || !isRecord(raw)) return false;

    const expectedReference = `apois-merchant-subscription-${subscription.id}`;
    const amount = numberValue(raw.total_amount);
    if (
      text(raw.external_reference) !== expectedReference ||
      amount === null ||
      Math.round(amount * 100) !== 6990
    ) {
      console.error("merchant subscription PIX provider mismatch", {
        merchantId: merchant.id,
        providerOrderId,
      });
      return false;
    }

    const now = new Date().toISOString();
    const payment = providerPayment(raw);
    const transactionId = identifier(payment?.id);
    if (orderPaid(raw)) {
      const periodEnd = addOneMonth(now);
      await admin
        .from("merchant_subscription_payments")
        .update({
          provider_payment_id: transactionId ?? paymentRow.provider_payment_id,
          status: "approved",
          paid_at: now,
          failure_reason: null,
          provider_payload: raw,
          updated_at: now,
        })
        .eq("id", paymentRow.id);
      const updated = await admin
        .from("merchant_subscriptions")
        .update({
          provider_status: "paid",
          current_period_start: now,
          current_period_end: periodEnd,
          next_payment_at: periodEnd,
          last_payment_at: now,
          last_payment_status: "approved",
          metadata: { environment, billingModel: "monthly_pix" },
          updated_at: now,
        })
        .eq("id", subscription.id)
        .select("*")
        .single();
      if (!updated.error && updated.data) subscription = updated.data;
      return true;
    }

    if (orderFailed(raw)) {
      await admin
        .from("merchant_subscription_payments")
        .update({
          provider_payment_id: transactionId ?? paymentRow.provider_payment_id,
          status: "failed",
          failure_reason: `${text(raw.status) ?? "unknown"}:${text(raw.status_detail) ?? "unknown"}`,
          provider_payload: raw,
          updated_at: now,
        })
        .eq("id", paymentRow.id);
      return false;
    }

    if (paymentRow.status !== "pending") {
      await admin
        .from("merchant_subscription_payments")
        .update({
          provider_payment_id: transactionId ?? paymentRow.provider_payment_id,
          status: "pending",
          provider_payload: raw,
          updated_at: now,
        })
        .eq("id", paymentRow.id);
    }
    return false;
  };

  const latestProviderPayment = (paymentRows ?? []).find((row: any) =>
    Boolean(row.provider_authorized_payment_id),
  );
  if (latestProviderPayment) await reconcilePayment(latestProviderPayment);

  const accessAllowed = Boolean(
    subscription.current_period_end &&
      new Date(subscription.current_period_end).getTime() > Date.now(),
  );

  const baseResponse = () => ({
    status: subscription.provider_status,
    amount: Number(subscription.amount),
    currency: subscription.currency,
    currentPeriodEnd: subscription.current_period_end,
    nextPaymentAt: subscription.next_payment_at,
    lastPaymentStatus: subscription.last_payment_status,
  });

  if (action === "sync" || accessAllowed) {
    return json(request, 200, {
      ok: true,
      accessAllowed,
      subscription: baseResponse(),
    });
  }

  const activePending = (paymentRows ?? []).find((row: any) => {
    if (row.status !== "pending" || !row.qr_code_text || !row.provider_authorized_payment_id) {
      return false;
    }
    if (!row.expires_at) return true;
    return new Date(row.expires_at).getTime() > Date.now();
  });

  if (activePending) {
    return json(request, 200, {
      ok: true,
      accessAllowed: false,
      testMode,
      payment: {
        id: activePending.id,
        status: activePending.status,
        amount: Number(activePending.amount),
        qrCodeText: activePending.qr_code_text,
        qrCodeImageUrl: activePending.qr_code_image_url,
        expiresAt: activePending.expires_at,
        providerChargeId: activePending.provider_authorized_payment_id,
      },
      subscription: baseResponse(),
      reused: true,
    });
  }

  const expiredIds = (paymentRows ?? [])
    .filter(
      (row: any) =>
        row.status === "pending" &&
        row.expires_at &&
        new Date(row.expires_at).getTime() <= Date.now(),
    )
    .map((row: any) => row.id);
  if (expiredIds.length > 0) {
    await admin
      .from("merchant_subscription_payments")
      .update({ status: "failed", failure_reason: "expired", updated_at: new Date().toISOString() })
      .in("id", expiredIds);
  }

  const attemptNumber = (paymentRows?.length ?? 0) + 1;
  const mode = testMode ? "test" : "prod";
  const idempotencyKey = `mercadopago:merchant-subscription:${subscription.id}:pix:${mode}:attempt:${attemptNumber}`;
  const externalReference = `apois-merchant-subscription-${subscription.id}`;
  const payerEmail = testMode ? "test_user_br@testuser.com" : user.email ?? merchant.contact_email;
  if (!payerEmail) return json(request, 409, { error: "payer_email_required" });

  const providerBody = testMode
    ? {
        type: "online",
        external_reference: externalReference,
        total_amount: MONTHLY_AMOUNT.toFixed(2),
        payer: { email: payerEmail, first_name: "APRO" },
        transactions: {
          payments: [
            {
              amount: MONTHLY_AMOUNT.toFixed(2),
              payment_method: { id: "pix", type: "bank_transfer" },
            },
          ],
        },
      }
    : {
        type: "online",
        processing_mode: "automatic",
        external_reference: externalReference,
        total_amount: MONTHLY_AMOUNT.toFixed(2),
        payer: { email: payerEmail },
        transactions: {
          payments: [
            {
              amount: MONTHLY_AMOUNT.toFixed(2),
              payment_method: { id: "pix", type: "bank_transfer" },
              expiration_time: "PT30M",
            },
          ],
        },
      };

  const providerResponse = await fetch(`${apiBase}/v1/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(providerBody),
  });
  const providerRaw: unknown = await providerResponse.json().catch(() => null);
  if (!providerResponse.ok || !isRecord(providerRaw)) {
    const provider = safeProviderError(providerRaw);
    console.error("merchant-subscription PIX create failed", {
      status: providerResponse.status,
      merchantId: merchant.id,
      provider,
      testMode,
    });
    return json(request, 502, {
      error: "provider_subscription_pix_failed",
      providerStatus: providerResponse.status,
      provider,
    });
  }

  const providerOrderId = text(providerRaw.id);
  const payment = providerPayment(providerRaw);
  const paymentMethod = payment && isRecord(payment.payment_method) ? payment.payment_method : null;
  const transactionId = identifier(payment?.id);
  const qrCodeText = text(paymentMethod?.qr_code);
  const qrCodeBase64 = text(paymentMethod?.qr_code_base64);
  const ticketUrl = text(paymentMethod?.ticket_url);
  const qrCodeImageUrl = qrCodeBase64 ? `data:image/png;base64,${qrCodeBase64}` : ticketUrl;
  if (!providerOrderId || !qrCodeText) {
    return json(request, 502, { error: "provider_subscription_pix_incomplete" });
  }

  const expiresAt = new Date(Date.now() + PIX_EXPIRATION_MS).toISOString();
  const inserted = await admin
    .from("merchant_subscription_payments")
    .insert({
      merchant_subscription_id: subscription.id,
      provider_authorized_payment_id: providerOrderId,
      provider_payment_id: transactionId,
      amount: MONTHLY_AMOUNT,
      currency: "BRL",
      status: orderPaid(providerRaw) ? "approved" : "pending",
      method: "pix",
      qr_code_text: qrCodeText,
      qr_code_image_url: qrCodeImageUrl,
      expires_at: expiresAt,
      idempotency_key: idempotencyKey,
      debit_date: new Date().toISOString(),
      paid_at: orderPaid(providerRaw) ? new Date().toISOString() : null,
      provider_payload: providerRaw,
    })
    .select("*")
    .single();
  if (inserted.error || !inserted.data) {
    const concurrent = await admin
      .from("merchant_subscription_payments")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (!concurrent.data) {
      return json(request, 500, { error: "subscription_pix_persistence_failed" });
    }
    inserted.data = concurrent.data;
  }

  if (orderPaid(providerRaw)) {
    await reconcilePayment(inserted.data);
  }

  return json(request, 201, {
    ok: true,
    accessAllowed: Boolean(
      subscription.current_period_end &&
        new Date(subscription.current_period_end).getTime() > Date.now(),
    ),
    testMode,
    payment: {
      id: inserted.data.id,
      status: inserted.data.status,
      amount: Number(inserted.data.amount),
      qrCodeText: inserted.data.qr_code_text,
      qrCodeImageUrl: inserted.data.qr_code_image_url,
      expiresAt: inserted.data.expires_at,
      providerChargeId: inserted.data.provider_authorized_payment_id,
    },
    subscription: baseResponse(),
    reused: false,
  });
});
