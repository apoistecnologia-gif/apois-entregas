const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function parseSafe(response: Response) {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  if (!isRecord(payload)) return null;
  return {
    message: text(payload.message),
    error: text(payload.error),
    status: text(payload.status),
    status_detail: text(payload.status_detail),
    code: typeof payload.code === "string" || typeof payload.code === "number" ? payload.code : null,
  };
}

Deno.serve(async () => {
  const rawToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  const apiBase = (Deno.env.get("MERCADO_PAGO_API_URL") ?? "https://api.mercadopago.com").replace(/\/$/, "");

  if (!rawToken) {
    return new Response(JSON.stringify({ ok: false, reason: "secret_missing" }), { status: 500, headers: jsonHeaders });
  }

  const token = rawToken.trim();
  const metadata = {
    startsWithAppUsr: token.startsWith("APP_USR"),
    hadOuterWhitespace: rawToken !== token,
    length: token.length,
  };

  const authHeaders = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  const paymentMethodsResponse = await fetch(`${apiBase}/v1/payment_methods`, { headers: authHeaders });
  const paymentMethodsError = paymentMethodsResponse.ok ? null : await parseSafe(paymentMethodsResponse);

  const begin = "2026-08-01T00:00:00.000Z";
  const end = "2026-08-09T23:59:59.999Z";
  const ordersUrl = `${apiBase}/v1/orders?begin_date=${encodeURIComponent(begin)}&end_date=${encodeURIComponent(end)}&page=0&page_size=1`;
  const ordersResponse = await fetch(ordersUrl, { headers: authHeaders });
  const ordersError = ordersResponse.ok ? null : await parseSafe(ordersResponse);

  return new Response(JSON.stringify({
    ok: true,
    metadata,
    paymentMethods: {
      status: paymentMethodsResponse.status,
      authorized: paymentMethodsResponse.status !== 401,
      error: paymentMethodsError,
    },
    orders: {
      status: ordersResponse.status,
      authorized: ordersResponse.status !== 401,
      error: ordersError,
    },
  }), { status: 200, headers: jsonHeaders });
});
