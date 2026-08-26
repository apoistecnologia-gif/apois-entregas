import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-apois-payout-dispatch-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const headers = {
  ...cors,
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PIX_TYPES = new Set(["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"]);
const MAX_ATTEMPTS = 8;
const isRetryableProviderStatus = (status: number) =>
  status === 408 || status === 425 || status === 429 || status >= 500;
type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const json = (status: number, body: Json) =>
  new Response(JSON.stringify(body), { status, headers });
async function readJson(r: Response): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

function receiver(pixType: string, pixKey: string): Json | null {
  // Mercado Pago's public OpenAPI exposes receiver as an object but leaves the
  // Pix-key member provider-controlled. Fail closed until the approved field is
  // supplied as configuration; never guess a destination schema in production.
  const field = Deno.env.get("MERCADO_PAGO_PAYOUT_RECEIVER_FIELD")?.trim();
  if (!field || !/^[a-z][a-z0-9_]{1,31}$/.test(field)) return null;
  return { [field]: pixKey, type: pixType };
}

async function authenticate(
  request: Request,
  admin: ReturnType<typeof createClient>,
  anonKey: string,
) {
  const runtime = request.headers.get("x-apois-payout-dispatch-key")?.trim();
  if (runtime) {
    const { data, error } = await admin.rpc("verify_payout_dispatch_runtime_key", {
      _candidate: runtime,
    });
    if (!error && data === true) return { id: "runtime", admin: true };
  }
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  const auth = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: role } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profile?.is_active !== true) return null;
  return { id: data.user.id, admin: Boolean(role) };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json(405, { code: "METHOD_NOT_ALLOWED" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !anonKey || !serviceRoleKey)
    return json(500, { code: "SERVER_CONFIGURATION" });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const identity = await authenticate(request, admin, anonKey);
  if (!identity) return json(401, { code: "UNAUTHORIZED" });
  if (!identity.admin) return json(403, { code: "DISPATCH_ADMIN_OR_RUNTIME_REQUIRED" });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "INVALID_REQUEST" });
  }
  const payoutId = isRecord(body) ? text(body.payoutId) : null;
  if (!payoutId || !UUID_RE.test(payoutId)) return json(400, { code: "INVALID_PAYOUT_ID" });

  const mode = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "courier_payout_mode")
    .maybeSingle();
  if (mode.data?.value !== "marketplace_direct_live")
    return json(409, { code: "PAYOUT_MODE_BLOCKED" });
  if ((Deno.env.get("MERCADO_PAGO_PAYOUT_ENABLED") ?? "false").trim().toLowerCase() !== "true")
    return json(409, { code: "MERCADO_PAGO_PAYOUT_DISABLED" });
  const accessToken = Deno.env.get("MERCADO_PAGO_PAYOUT_ACCESS_TOKEN")?.trim();
  const base = (
    Deno.env.get("MERCADO_PAGO_BASE_URL")?.trim() || "https://api.mercadopago.com"
  ).replace(/\/+$/, "");
  if (!accessToken) return json(503, { code: "MERCADO_PAGO_PAYOUT_CREDENTIAL_MISSING" });

  const { data: payout, error } = await admin
    .from("payouts")
    .select(
      "id,wallet_id,amount,status,provider,provider_payout_id,pix_key_snapshot,pix_key_type_snapshot,dispatch_attempts",
    )
    .eq("id", payoutId)
    .maybeSingle();
  if (error) return json(500, { code: "PAYOUT_LOOKUP_FAILED" });
  if (!payout) return json(404, { code: "PAYOUT_NOT_FOUND" });
  if (payout.status === "paid")
    return json(200, {
      payoutId,
      status: "paid",
      providerPayoutId: payout.provider_payout_id,
      reused: true,
    });
  if (!["pending", "processing"].includes(payout.status))
    return json(409, { code: "PAYOUT_FINALIZED" });
  if (payout.provider && payout.provider !== "mercadopago")
    return json(409, { code: "PAYOUT_PROVIDER_MISMATCH" });
  const pixType = text(payout.pix_key_type_snapshot)?.toUpperCase();
  const pixKey = text(payout.pix_key_snapshot);
  const amount = Number(payout.amount);
  if (!pixKey || !pixType || !PIX_TYPES.has(pixType) || !Number.isFinite(amount) || amount <= 0)
    return json(409, { code: "PAYOUT_DESTINATION_OR_AMOUNT_INVALID" });
  const target = receiver(pixType, pixKey);
  if (!target) return json(503, { code: "MERCADO_PAGO_PAYOUT_RECEIVER_SCHEMA_UNCONFIGURED" });
  const attempts = Number(payout.dispatch_attempts ?? 0);
  if (attempts >= MAX_ATTEMPTS) return json(409, { code: "PAYOUT_RETRY_EXHAUSTED" });

  // Atomic claim prevents two workers from dispatching the same payout.
  const claimed = await admin
    .from("payouts")
    .update({
      dispatch_attempts: attempts + 1,
      dispatch_locked_at: new Date().toISOString(),
      provider: "mercadopago",
      dispatch_last_error: null,
    })
    .eq("id", payoutId)
    .in("status", ["pending", "processing"])
    .eq("dispatch_attempts", attempts)
    .select("id")
    .maybeSingle();
  if (claimed.error || !claimed.data) return json(409, { code: "PAYOUT_ALREADY_CLAIMED" });
  const correlation = `apois-entrega-payout-${payoutId}`;
  const requestBody = {
    external_reference: correlation,
    point_of_interaction: { type: "PIX" },
    transaction: { amount: Number(amount.toFixed(2)), currency_id: "BRL", receiver: target },
  };
  let providerResponse: Response;
  let providerPayload: unknown;
  try {
    providerResponse = await fetch(`${base}/v1/transaction-intents/process`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": correlation,
      },
      body: JSON.stringify(requestBody),
    });
    providerPayload = await readJson(providerResponse);
  } catch (e) {
    await admin
      .from("payouts")
      .update({
        dispatch_last_error: "provider_timeout",
        next_dispatch_at: new Date(
          Date.now() + Math.min(3600, 2 ** attempts * 30) * 1000,
        ).toISOString(),
        dispatch_locked_at: null,
      })
      .eq("id", payoutId);
    return json(502, { code: "PAYOUT_PROVIDER_UNCERTAIN" });
  }
  const providerId = isRecord(providerPayload) ? text(providerPayload.id) : null;
  const permanentReject =
    providerResponse.status >= 400 &&
    providerResponse.status < 500 &&
    !isRetryableProviderStatus(providerResponse.status);
  if (permanentReject) {
    await admin
      .from("payouts")
      .update({
        dispatch_last_error: `provider_4xx_${providerResponse.status}`,
        dispatch_locked_at: null,
      })
      .eq("id", payoutId);
    await admin.rpc("settle_payout", {
      _payout_id: payoutId,
      _new_status: "failed",
      _provider: "mercadopago",
      _provider_payout_id: providerId ?? correlation,
      _failure_reason: `Mercado Pago HTTP ${providerResponse.status}`,
    });
    return json(409, { code: "PAYOUT_PROVIDER_REJECTED" });
  }
  if (!providerResponse.ok || !providerId) {
    const exhausted = attempts + 1 >= MAX_ATTEMPTS;
    await admin
      .from("payouts")
      .update({
        dispatch_last_error: `provider_retryable_${providerResponse.status}`,
        next_dispatch_at: new Date(
          Date.now() + Math.min(3600, 2 ** attempts * 30) * 1000,
        ).toISOString(),
        dispatch_locked_at: null,
      })
      .eq("id", payoutId);
    if (exhausted)
      await admin.rpc("settle_payout", {
        _payout_id: payoutId,
        _new_status: "failed",
        _provider: "mercadopago",
        _provider_payout_id: correlation,
        _failure_reason: "Mercado Pago retry limit exhausted",
      });
    return json(502, { code: exhausted ? "PAYOUT_RETRY_EXHAUSTED" : "PAYOUT_PROVIDER_UNCERTAIN" });
  }
  await admin
    .from("payouts")
    .update({
      provider_payout_id: providerId,
      dispatch_locked_at: null,
      next_dispatch_at: new Date(Date.now() + 30000).toISOString(),
    })
    .eq("id", payoutId);
  const status = text(isRecord(providerPayload) ? providerPayload.status : null)?.toLowerCase();
  if (["paid", "processed", "confirmed", "completed"].includes(status ?? "")) {
    const settled = await admin.rpc("settle_payout", {
      _payout_id: payoutId,
      _new_status: "paid",
      _provider: "mercadopago",
      _provider_payout_id: providerId,
      _failure_reason: null,
    });
    if (settled.error) return json(500, { code: "PAYOUT_SETTLEMENT_FAILED" });
    return json(200, { payoutId, status: "paid", providerPayoutId: providerId });
  }
  const processing = await admin.rpc("settle_payout", {
    _payout_id: payoutId,
    _new_status: "processing",
    _provider: "mercadopago",
    _provider_payout_id: providerId,
    _failure_reason: null,
  });
  if (processing.error) return json(500, { code: "PAYOUT_SETTLEMENT_FAILED" });
  return json(202, { payoutId, status: "processing", providerPayoutId: providerId });
});
