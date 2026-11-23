import { createClient } from "npm:@supabase/supabase-js@2.112.1";

type Rec = Record<string, unknown>;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const json = (status: number, body: Rec) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
const fromB64 = (v: string) => Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
const toB64 = (v: Uint8Array) => btoa(String.fromCharCode(...v));
async function keyFromEnv() {
  const raw = Deno.env.get("MERCADO_PAGO_OAUTH_TOKEN_KEY_BASE64")?.trim();
  if (!raw) throw new Error("missing_token_key");
  const bytes = fromB64(raw);
  if (bytes.byteLength !== 32) throw new Error("invalid_token_key");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function decrypt(value: string, iv: string, key: CryptoKey) {
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(iv) },
    key,
    fromB64(value),
  );
  return new TextDecoder().decode(clear);
}
async function encrypt(value: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  return { value: toB64(new Uint8Array(cipher)), iv: toB64(iv) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const jwt = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!jwt) return json(401, { error: "authentication_required" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL"),
    serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return json(500, { error: "server_configuration" });
  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ud = await admin.auth.getUser(jwt);
  if (ud.error || !ud.data.user) return json(401, { error: "invalid_session" });
  const payload: unknown = await req.json().catch(() => null);
  const merchantId = isRec(payload) ? text(payload.merchantId) : null;
  if (!merchantId) return json(400, { error: "merchant_required" });
  const mr = await admin
    .from("merchants")
    .select("id,is_active,approval_status")
    .eq("id", merchantId)
    .maybeSingle();
  const merchant = mr.data;
  if (!merchant || !merchant.is_active || merchant.approval_status !== "approved")
    return json(200, {
      ready: false,
      code: "merchant_unavailable",
      message: "Este estabelecimento está indisponível no momento.",
    });
  const sr = await admin
    .from("merchant_subscriptions")
    .select("last_payment_status,current_period_end")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  const subscription = sr.data;
  const subscriptionCurrent = Boolean(
    subscription?.last_payment_status === "approved" &&
    subscription?.current_period_end &&
    new Date(subscription.current_period_end).getTime() > Date.now(),
  );
  if (!subscriptionCurrent)
    return json(200, {
      ready: false,
      code: "merchant_subscription_inactive",
      message: "Este estabelecimento está temporariamente indisponível para novos pedidos.",
    });
  let ar = await admin
    .from("merchant_mercadopago_accounts")
    .select("*")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  let account = ar.data;
  if (!account || account.status !== "connected")
    return json(200, {
      ready: false,
      code: "merchant_mercadopago_not_connected",
      message:
        "Este estabelecimento ainda não habilitou o recebimento por PIX. Tente novamente mais tarde.",
    });
  const expiry = account.access_token_expires_at
    ? new Date(account.access_token_expires_at).getTime()
    : Number.POSITIVE_INFINITY;
  const shouldRefresh = expiry < Date.now() + 7 * 24 * 3600 * 1000;
  if (shouldRefresh) {
    try {
      if (!account.encrypted_refresh_token || !account.refresh_token_iv)
        throw new Error("refresh_token_missing");
      const clientId =
        Deno.env.get("MERCADO_PAGO_OAUTH_CLIENT_ID")?.trim() ||
        Deno.env.get("MERCADO_PAGO_CLIENT_ID")?.trim();
      const clientSecret =
        Deno.env.get("MERCADO_PAGO_OAUTH_CLIENT_SECRET")?.trim() ||
        Deno.env.get("MERCADO_PAGO_CLIENT_SECRET")?.trim();
      if (!clientId || !clientSecret) throw new Error("oauth_credentials_missing");
      const key = await keyFromEnv();
      const refreshToken = await decrypt(
        account.encrypted_refresh_token,
        account.refresh_token_iv,
        key,
      );
      const res = await fetch("https://api.mercadopago.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });
      const raw: unknown = await res.json().catch(() => null);
      if (!res.ok || !isRec(raw) || !text(raw.access_token))
        throw new Error(`refresh_http_${res.status}`);
      const access = await encrypt(text(raw.access_token)!, key);
      const newRefresh = text(raw.refresh_token)
        ? await encrypt(text(raw.refresh_token)!, key)
        : null;
      const expiresIn = Math.max(60, Number(raw.expires_in ?? 15552000));
      const now = new Date().toISOString();
      await admin
        .from("merchant_mercadopago_accounts")
        .update({
          encrypted_access_token: access.value,
          token_iv: access.iv,
          encrypted_refresh_token: newRefresh?.value ?? account.encrypted_refresh_token,
          refresh_token_iv: newRefresh?.iv ?? account.refresh_token_iv,
          access_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
          last_refreshed_at: now,
          status: "connected",
          last_error: null,
          updated_at: now,
        })
        .eq("id", account.id);
      ar = await admin
        .from("merchant_mercadopago_accounts")
        .select("*")
        .eq("id", account.id)
        .maybeSingle();
      account = ar.data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "refresh_failed";
      await admin
        .from("merchant_mercadopago_accounts")
        .update({
          status: "refresh_required",
          last_error: msg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id);
      return json(200, {
        ready: false,
        code: "merchant_mercadopago_refresh_required",
        message:
          "O recebimento deste estabelecimento precisa ser reconectado. Tente novamente mais tarde.",
      });
    }
  }
  if (!account || account.status !== "connected")
    return json(200, {
      ready: false,
      code: "merchant_mercadopago_refresh_required",
      message:
        "O recebimento deste estabelecimento precisa ser reconectado. Tente novamente mais tarde.",
    });
  return json(200, {
    ready: true,
    provider: "mercadopago_merchant",
    applicationFee: 0,
    tokenRefreshed: shouldRefresh,
  });
});
