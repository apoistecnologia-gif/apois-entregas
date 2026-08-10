import { createClient } from "npm:@supabase/supabase-js@2.112.1";

type JsonRecord = Record<string, unknown>;

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
              typeof cause.code === "string" || typeof cause.code === "number"
                ? cause.code
                : null,
            description: text(cause.description),
          };
        })
        .filter(Boolean)
    : [];
  return {
    message: text(payload.message),
    error: text(payload.error),
    status: text(payload.status),
    code:
      typeof payload.code === "string" || typeof payload.code === "number"
        ? payload.code
        : null,
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

function safeReturnUrl(request: Request, requested: unknown): string {
  const requestOrigin = request.headers.get("origin")?.trim() ?? "";
  const fallback = requestOrigin
    ? `${requestOrigin.replace(/\/$/, "")}/merchant`
    : "https://apoisentrega.com.br/merchant";
  const candidate = text(requested) ?? fallback;
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
    ) {
      return fallback;
    }
    if (requestOrigin) {
      const origin = new URL(requestOrigin);
      if (url.origin !== origin.origin) return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
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
        amount: 69.9,
        currency: "BRL",
        billing_frequency: "monthly",
      })
      .select("*")
      .single();
    if (created.error || !created.data)
      return json(request, 500, { error: "subscription_create_failed" });
    subscription = created.data;
  }

  const syncProvider = async () => {
    if (!subscription?.provider_preapproval_id) return subscription;
    const preapprovalResponse = await fetch(
      `${apiBase}/preapproval/${encodeURIComponent(subscription.provider_preapproval_id)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    );
    if (!preapprovalResponse.ok) {
      console.error("merchant-subscription preapproval lookup failed", {
        status: preapprovalResponse.status,
      });
      return subscription;
    }

    const rawPreapproval: unknown = await preapprovalResponse.json();
    if (!isRecord(rawPreapproval)) return subscription;

    const externalReference = text(rawPreapproval.external_reference);
    const expectedReference = `apois-merchant-${merchant.id}`;
    const recurring = isRecord(rawPreapproval.auto_recurring)
      ? rawPreapproval.auto_recurring
      : null;
    const amount = numberValue(recurring?.transaction_amount);
    const currency = text(recurring?.currency_id);
    if (
      externalReference !== expectedReference ||
      amount === null ||
      Math.round(amount * 100) !== 6990 ||
      currency !== "BRL"
    ) {
      console.error("merchant-subscription provider mismatch", { merchantId: merchant.id });
      return subscription;
    }

    const invoicesResponse = await fetch(
      `${apiBase}/authorized_payments/search?preapproval_id=${encodeURIComponent(
        subscription.provider_preapproval_id,
      )}&limit=20&offset=0`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    );

    let approvedInvoice: JsonRecord | null = null;
    if (invoicesResponse.ok) {
      const invoicesRaw: unknown = await invoicesResponse.json();
      if (isRecord(invoicesRaw) && Array.isArray(invoicesRaw.results)) {
        const invoices = invoicesRaw.results.filter(isRecord);
        invoices.sort((a, b) =>
          String(b.debit_date ?? b.date_created ?? "").localeCompare(
            String(a.debit_date ?? a.date_created ?? ""),
          ),
        );
        approvedInvoice =
          invoices.find((invoice) => {
            const payment = isRecord(invoice.payment) ? invoice.payment : null;
            return text(payment?.status) === "approved";
          }) ?? null;
      }
    }

    const nextPaymentAt = text(rawPreapproval.next_payment_date);
    const update: JsonRecord = {
      provider_status: text(rawPreapproval.status) ?? subscription.provider_status,
      checkout_url: text(rawPreapproval.init_point) ?? subscription.checkout_url,
      next_payment_at: nextPaymentAt,
      updated_at: new Date().toISOString(),
      metadata: { environment },
    };

    if (approvedInvoice) {
      const payment = isRecord(approvedInvoice.payment) ? approvedInvoice.payment : null;
      const debitDate =
        text(approvedInvoice.debit_date) ??
        text(approvedInvoice.date_created) ??
        new Date().toISOString();
      const periodEnd =
        nextPaymentAt && new Date(nextPaymentAt).getTime() > new Date(debitDate).getTime()
          ? nextPaymentAt
          : addOneMonth(debitDate);
      update.current_period_start = debitDate;
      update.current_period_end = periodEnd;
      update.last_payment_at = debitDate;
      update.last_payment_status = text(payment?.status) ?? "approved";

      const authorizedPaymentId = text(approvedInvoice.id) ?? String(approvedInvoice.id ?? "");
      if (authorizedPaymentId) {
        await admin.from("merchant_subscription_payments").upsert(
          {
            merchant_subscription_id: subscription.id,
            provider_authorized_payment_id: authorizedPaymentId,
            provider_payment_id:
              text(payment?.id) ?? (payment?.id != null ? String(payment.id) : null),
            amount: numberValue(approvedInvoice.transaction_amount) ?? 69.9,
            currency: text(approvedInvoice.currency_id) ?? "BRL",
            status: text(payment?.status) ?? text(approvedInvoice.status) ?? "approved",
            debit_date: debitDate,
            paid_at: debitDate,
            provider_payload: approvedInvoice,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "provider_authorized_payment_id" },
        );
      }
    }

    const updated = await admin
      .from("merchant_subscriptions")
      .update(update)
      .eq("id", subscription.id)
      .select("*")
      .single();
    if (!updated.error && updated.data) subscription = updated.data;
    return subscription;
  };

  if (subscription.provider_preapproval_id) await syncProvider();

  const accessAllowed = Boolean(
    subscription.current_period_end &&
      new Date(subscription.current_period_end).getTime() > Date.now(),
  );

  if (action === "sync" || accessAllowed) {
    return json(request, 200, {
      ok: true,
      accessAllowed,
      subscription: {
        status: subscription.provider_status,
        amount: Number(subscription.amount),
        currency: subscription.currency,
        currentPeriodEnd: subscription.current_period_end,
        nextPaymentAt: subscription.next_payment_at,
        lastPaymentStatus: subscription.last_payment_status,
        checkoutUrl: subscription.checkout_url,
      },
    });
  }

  if (
    subscription.provider_preapproval_id &&
    subscription.checkout_url &&
    ["pending", "authorized"].includes(subscription.provider_status)
  ) {
    return json(request, 200, {
      ok: true,
      accessAllowed: false,
      checkoutUrl: subscription.checkout_url,
      subscription: { status: subscription.provider_status, amount: 69.9, currency: "BRL" },
    });
  }

  const returnUrl = safeReturnUrl(request, body.returnUrl);
  const payerEmail = testMode
    ? Deno.env.get("MERCADO_PAGO_TEST_PAYER_EMAIL")?.trim() || "test_user_br@testuser.com"
    : user.email ?? merchant.contact_email;
  if (!payerEmail) return json(request, 409, { error: "payer_email_required" });

  const preapprovalPayload = {
    reason: "APOIS ENTREGA - Mensalidade do estabelecimento",
    external_reference: `apois-merchant-${merchant.id}`,
    payer_email: payerEmail,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: 69.9,
      currency_id: "BRL",
    },
    back_url: returnUrl,
    status: "pending",
  };

  const providerResponse = await fetch(`${apiBase}/preapproval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Idempotency-Key": `apois-merchant-subscription-${merchant.id}`,
    },
    body: JSON.stringify(preapprovalPayload),
  });
  const providerRaw: unknown = await providerResponse.json().catch(() => null);
  if (!providerResponse.ok || !isRecord(providerRaw)) {
    const provider = safeProviderError(providerRaw);
    console.error("merchant-subscription provider create failed", {
      status: providerResponse.status,
      provider,
      testMode,
    });
    return json(request, 502, {
      error: "provider_subscription_failed",
      providerStatus: providerResponse.status,
      provider,
    });
  }

  const providerId = text(providerRaw.id);
  const checkoutUrl = text(providerRaw.init_point);
  if (!providerId || !checkoutUrl)
    return json(request, 502, { error: "provider_subscription_incomplete" });

  const saved = await admin
    .from("merchant_subscriptions")
    .update({
      provider_preapproval_id: providerId,
      provider_status: text(providerRaw.status) ?? "pending",
      checkout_url: checkoutUrl,
      next_payment_at: text(providerRaw.next_payment_date),
      metadata: { environment },
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscription.id)
    .select("*")
    .single();
  if (saved.error || !saved.data)
    return json(request, 500, { error: "subscription_persistence_failed" });

  return json(request, 201, {
    ok: true,
    accessAllowed: false,
    checkoutUrl,
    subscription: { status: saved.data.provider_status, amount: 69.9, currency: "BRL" },
  });
});
