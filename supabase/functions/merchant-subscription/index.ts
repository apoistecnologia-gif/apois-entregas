import { createClient } from "npm:@supabase/supabase-js@2.112.1";

type JsonRecord = Record<string, unknown>;

const MONTHLY_AMOUNT = 69.9;
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

function validRecurring(resource: JsonRecord): boolean {
  const recurring = isRecord(resource.auto_recurring) ? resource.auto_recurring : null;
  const amount = numberValue(recurring?.transaction_amount);
  const currency = text(recurring?.currency_id);
  return amount !== null && Math.round(amount * 100) === 6990 && currency === "BRL";
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

  const providerHeaders = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

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
    .select("id,name,approval_status,is_active")
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
      })
      .select("*")
      .single();
    if (created.error || !created.data) {
      return json(request, 500, { error: "subscription_create_failed" });
    }
    subscription = created.data;
  }

  const discoverPreapprovalFromPlan = async () => {
    if (subscription.provider_preapproval_id || !subscription.provider_plan_id) return;
    const searchResponse = await fetch(
      `${apiBase}/preapproval/search?preapproval_plan_id=${encodeURIComponent(
        subscription.provider_plan_id,
      )}&limit=20&offset=0`,
      { headers: providerHeaders },
    );
    if (!searchResponse.ok) return;
    const raw: unknown = await searchResponse.json().catch(() => null);
    if (!isRecord(raw) || !Array.isArray(raw.results)) return;

    const candidates = raw.results
      .filter(isRecord)
      .filter((entry) => text(entry.preapproval_plan_id) === subscription.provider_plan_id)
      .filter(validRecurring)
      .sort((a, b) =>
        String(b.last_modified ?? b.date_created ?? "").localeCompare(
          String(a.last_modified ?? a.date_created ?? ""),
        ),
      );
    const chosen =
      candidates.find((entry) =>
        ["authorized", "pending", "paused"].includes(text(entry.status) ?? ""),
      ) ?? candidates[0];
    const providerId = chosen ? identifier(chosen.id) : null;
    if (!providerId) return;

    const saved = await admin
      .from("merchant_subscriptions")
      .update({
        provider_preapproval_id: providerId,
        provider_status: text(chosen.status) ?? subscription.provider_status,
        next_payment_at: text(chosen.next_payment_date),
        updated_at: new Date().toISOString(),
      })
      .eq("id", subscription.id)
      .select("*")
      .single();
    if (!saved.error && saved.data) subscription = saved.data;
  };

  const syncProvider = async () => {
    await discoverPreapprovalFromPlan();
    if (!subscription.provider_preapproval_id) return;

    const preapprovalResponse = await fetch(
      `${apiBase}/preapproval/${encodeURIComponent(subscription.provider_preapproval_id)}`,
      { headers: providerHeaders },
    );
    if (!preapprovalResponse.ok) {
      console.error("merchant-subscription preapproval lookup failed", {
        status: preapprovalResponse.status,
      });
      return;
    }

    const rawPreapproval: unknown = await preapprovalResponse.json().catch(() => null);
    if (!isRecord(rawPreapproval) || !validRecurring(rawPreapproval)) return;
    const planId = text(rawPreapproval.preapproval_plan_id);
    if (subscription.provider_plan_id && planId && planId !== subscription.provider_plan_id) {
      console.error("merchant-subscription plan mismatch", { merchantId: merchant.id });
      return;
    }

    const invoicesResponse = await fetch(
      `${apiBase}/authorized_payments/search?preapproval_id=${encodeURIComponent(
        subscription.provider_preapproval_id,
      )}&limit=20&offset=0`,
      { headers: providerHeaders },
    );

    let approvedInvoice: JsonRecord | null = null;
    if (invoicesResponse.ok) {
      const invoicesRaw: unknown = await invoicesResponse.json().catch(() => null);
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

    const now = new Date().toISOString();
    const nextPaymentAt = text(rawPreapproval.next_payment_date);
    const update: JsonRecord = {
      provider_status: text(rawPreapproval.status) ?? subscription.provider_status,
      next_payment_at: nextPaymentAt,
      updated_at: now,
      metadata: {
        environment,
        billingModel: "provider_plan_checkout",
      },
    };

    if (approvedInvoice) {
      const payment = isRecord(approvedInvoice.payment) ? approvedInvoice.payment : null;
      const debitDate =
        text(approvedInvoice.debit_date) ?? text(approvedInvoice.date_created) ?? now;
      const periodEnd =
        nextPaymentAt && new Date(nextPaymentAt).getTime() > new Date(debitDate).getTime()
          ? nextPaymentAt
          : addOneMonth(debitDate);
      update.current_period_start = debitDate;
      update.current_period_end = periodEnd;
      update.last_payment_at = debitDate;
      update.last_payment_status = text(payment?.status) ?? "approved";

      const authorizedPaymentId = identifier(approvedInvoice.id);
      if (authorizedPaymentId) {
        await admin.from("merchant_subscription_payments").upsert(
          {
            merchant_subscription_id: subscription.id,
            provider_authorized_payment_id: authorizedPaymentId,
            provider_payment_id: identifier(payment?.id),
            amount: numberValue(approvedInvoice.transaction_amount) ?? MONTHLY_AMOUNT,
            currency: text(approvedInvoice.currency_id) ?? "BRL",
            status: text(payment?.status) ?? text(approvedInvoice.status) ?? "approved",
            debit_date: debitDate,
            paid_at: debitDate,
            provider_payload: approvedInvoice,
            updated_at: now,
          },
          { onConflict: "provider_authorized_payment_id" },
        );
      }
    }

    const saved = await admin
      .from("merchant_subscriptions")
      .update(update)
      .eq("id", subscription.id)
      .select("*")
      .single();
    if (!saved.error && saved.data) subscription = saved.data;
  };

  await syncProvider();

  const accessAllowed = Boolean(
    subscription.current_period_end &&
    new Date(subscription.current_period_end).getTime() > Date.now(),
  );

  const responseSubscription = () => ({
    status: subscription.provider_status,
    amount: Number(subscription.amount),
    currency: subscription.currency,
    currentPeriodEnd: subscription.current_period_end,
    nextPaymentAt: subscription.next_payment_at,
    lastPaymentStatus: subscription.last_payment_status,
    checkoutUrl: subscription.checkout_url,
  });

  if (action === "sync" || accessAllowed) {
    return json(request, 200, {
      ok: true,
      accessAllowed,
      subscription: responseSubscription(),
    });
  }

  if (subscription.provider_plan_id && subscription.checkout_url) {
    const returnUrl = safeReturnUrl(request, body.returnUrl);
    const updatePlanResponse = await fetch(
      `${apiBase}/preapproval_plan/${encodeURIComponent(subscription.provider_plan_id)}`,
      {
        method: "PUT",
        headers: providerHeaders,
        body: JSON.stringify({ back_url: returnUrl }),
      },
    );
    if (!updatePlanResponse.ok) {
      console.warn("merchant-subscription plan return URL update failed", {
        status: updatePlanResponse.status,
        merchantId: merchant.id,
      });
    }
    return json(request, 200, {
      ok: true,
      accessAllowed: false,
      checkoutUrl: subscription.checkout_url,
      subscription: responseSubscription(),
    });
  }

  const returnUrl = safeReturnUrl(request, body.returnUrl);
  const planPayload = {
    reason: `APOIS ENTREGA - ${String(merchant.name ?? "Mensalidade").slice(0, 80)}`,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: MONTHLY_AMOUNT,
      currency_id: "BRL",
    },
    back_url: returnUrl,
  };

  const providerResponse = await fetch(`${apiBase}/preapproval_plan`, {
    method: "POST",
    headers: providerHeaders,
    body: JSON.stringify(planPayload),
  });
  const providerRaw: unknown = await providerResponse.json().catch(() => null);
  if (!providerResponse.ok || !isRecord(providerRaw)) {
    const provider = safeProviderError(providerRaw);
    console.error("merchant-subscription plan create failed", {
      status: providerResponse.status,
      provider,
      testMode,
    });
    return json(request, 502, {
      error: "provider_subscription_plan_failed",
      providerStatus: providerResponse.status,
      provider,
    });
  }

  const providerPlanId = identifier(providerRaw.id);
  const checkoutUrl = text(providerRaw.init_point);
  if (!providerPlanId || !checkoutUrl || !validRecurring(providerRaw)) {
    return json(request, 502, { error: "provider_subscription_plan_incomplete" });
  }

  const saved = await admin
    .from("merchant_subscriptions")
    .update({
      provider_plan_id: providerPlanId,
      provider_status: "pending",
      checkout_url: checkoutUrl,
      metadata: {
        environment,
        billingModel: "provider_plan_checkout",
        planStatus: text(providerRaw.status),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscription.id)
    .select("*")
    .single();
  if (saved.error || !saved.data) {
    return json(request, 500, { error: "subscription_plan_persistence_failed" });
  }
  subscription = saved.data;

  return json(request, 201, {
    ok: true,
    accessAllowed: false,
    checkoutUrl,
    subscription: responseSubscription(),
  });
});
