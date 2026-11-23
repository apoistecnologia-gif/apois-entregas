import { createClient } from "npm:@supabase/supabase-js@2.112.1";
import { getMercadoPagoChargeRoute } from "../_shared/mercadopago-charge-id.ts";

type Rec = Record<string, unknown>;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: Rec) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const b64 = (v: string) => Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
async function tokenKey() {
  const raw = Deno.env.get("MERCADO_PAGO_OAUTH_TOKEN_KEY_BASE64")?.trim();
  if (!raw) throw new Error("missing_token_key");
  const bytes = b64(raw);
  if (bytes.byteLength !== 32) throw new Error("invalid_token_key");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["decrypt"]);
}
async function decrypt(value: string, iv: string, key: CryptoKey) {
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(iv) }, key, b64(value));
  return new TextDecoder().decode(clear);
}

async function finalize(
  admin: any,
  refund: any,
  order: any,
  payment: any,
  providerRefundId: string | null,
  status = "completed",
) {
  const now = new Date().toISOString();
  await admin
    .from("refunds")
    .update({
      status,
      provider_refund_id: providerRefundId,
      processed_at: status === "completed" ? now : null,
    })
    .eq("id", refund.id);
  if (status !== "completed") return;
  await admin
    .from("payments")
    .update({ status: "refunded", failed_at: null, failure_reason: null })
    .eq("id", payment.id);
  const transitioned = await admin
    .from("orders")
    .update({ payment_status: "refunded", status: "refunded" })
    .eq("id", order.id)
    .eq("status", "cancelled")
    .select("id")
    .maybeSingle();
  if (!transitioned.data)
    await admin.from("orders").update({ payment_status: "refunded" }).eq("id", order.id);
  else
    await admin.from("order_status_history").insert({
      order_id: order.id,
      status: "refunded",
      changed_by_user_id: refund.requested_by ?? null,
    });
  if (providerRefundId)
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const auth = req.headers.get("authorization")?.trim();
  const jwt = auth?.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json(401, { error: "authentication_required" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRole || !anonKey) return json(500, { error: "server_configuration" });
  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ud = await admin.auth.getUser(jwt);
  const user = ud.data.user;
  if (ud.error || !user) return json(401, { error: "invalid_session" });
  const body = await req.json().catch(() => null);
  const refundId = isRec(body) ? text(body.refundId) : null;
  if (!refundId) return json(400, { error: "invalid_refund_id" });
  const rr = await admin
    .from("refunds")
    .select(
      "id,payment_id,order_id,amount,reason,status,provider_refund_id,requested_by,processed_at",
    )
    .eq("id", refundId)
    .maybeSingle();
  if (rr.error) return json(500, { error: "refund_lookup_failed" });
  if (!rr.data) return json(404, { error: "refund_not_found" });
  const refund = rr.data;
  const [or, pr] = await Promise.all([
    admin
      .from("orders")
      .select("id,customer_user_id,merchant_id,status,payment_status,total")
      .eq("id", refund.order_id)
      .maybeSingle(),
    admin
      .from("payments")
      .select("id,provider,provider_charge_id,status,amount,merchant_mercadopago_account_id")
      .eq("id", refund.payment_id)
      .maybeSingle(),
  ]);
  if (!or.data || !pr.data) return json(409, { error: "refund_dependencies_missing" });
  const order = or.data,
    payment = pr.data;
  const [role, profile] = await Promise.all([
    admin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle(),
    admin.from("profiles").select("is_active").eq("id", user.id).maybeSingle(),
  ]);
  const activeAdmin = Boolean(role.data && profile.data?.is_active === true);
  if (order.customer_user_id !== user.id && refund.requested_by !== user.id && !activeAdmin)
    return json(403, { error: "forbidden" });
  if (refund.status === "completed")
    return json(200, {
      refund: { id: refund.id, status: "completed", providerRefundId: refund.provider_refund_id },
      reused: true,
    });
  if (payment.provider !== "mercadopago_merchant") {
    const upstream = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/process-refund`, {
      method: "POST",
      headers: { Authorization: auth!, apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refundId }),
    });
    const raw = await upstream.text();
    return new Response(raw, {
      status: upstream.status,
      headers: {
        ...cors,
        "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      },
    });
  }
  if (!payment.provider_charge_id) return json(409, { error: "provider_charge_not_found" });
  if (Math.round(Number(payment.amount) * 100) !== Math.round(Number(refund.amount) * 100))
    return json(409, { error: "refund_amount_conflict" });
  if (!["paid", "refunded"].includes(payment.status))
    return json(409, { error: "payment_not_confirmed" });
  const ar = await admin
    .from("merchant_mercadopago_accounts")
    .select("id,merchant_id,status,encrypted_access_token,token_iv")
    .eq("id", payment.merchant_mercadopago_account_id)
    .maybeSingle();
  const account = ar.data;
  if (!account || account.merchant_id !== order.merchant_id || account.status !== "connected")
    return json(409, { error: "merchant_mercadopago_account_unavailable" });
  let token: string;
  try {
    token = await decrypt(account.encrypted_access_token, account.token_iv, await tokenKey());
  } catch {
    return json(503, { error: "merchant_payment_credentials_unavailable" });
  }
  // Compatibilidade dupla com classificação fechada: IDs numéricos seguem para Payments API,
  // as famílias ORD observadas seguem para Orders API e qualquer outro formato é recusado.
  const chargeId = String(payment.provider_charge_id);
  const chargeRoute = getMercadoPagoChargeRoute(chargeId);
  if (!chargeRoute) return json(409, { error: "unsupported_provider_charge_id" });
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  let providerRefundId: string;
  let status: string;
  let reused: boolean;
  if (chargeRoute.api === "orders") {
    const lookup = await fetch(chargeRoute.lookupUrl, { headers });
    const providerOrder: unknown = await lookup.json().catch(() => null);
    if (!lookup.ok || !isRec(providerOrder)) return json(502, { error: "provider_lookup_failed" });
    const providerAmount = Number(providerOrder.total_amount);
    if (
      !Number.isFinite(providerAmount) ||
      Math.round(providerAmount * 100) !== Math.round(Number(payment.amount) * 100) ||
      text(providerOrder.external_reference) !== `apois-entregas-order-${order.id}`
    )
      return json(409, { error: "provider_payment_mismatch" });
    let providerResult: any =
      String(providerOrder.status ?? "").toLowerCase() === "refunded" ? providerOrder : null;
    reused = Boolean(providerResult);
    if (!providerResult) {
      await admin
        .from("refunds")
        .update({ status: "processing" })
        .eq("id", refund.id)
        .in("status", ["pending", "failed", "processing"]);
      const idempotency = `apois-entregas-refund-${refund.id}`;
      const result = await fetch(chargeRoute.refundUrl, {
        method: "POST",
        headers: { ...headers, "X-Idempotency-Key": idempotency },
      });
      const raw: unknown = await result.json().catch(() => null);
      if (!result.ok || !isRec(raw)) {
        await admin.from("refunds").update({ status: "failed" }).eq("id", refund.id);
        return json(502, { error: "refund_provider_error" });
      }
      providerResult = raw;
    }
    providerRefundId = chargeId;
    status = String(providerResult?.status ?? "").toLowerCase();
    if (status === "refunded") {
      await finalize(admin, refund, order, payment, providerRefundId);
      return json(200, {
        refund: { id: refund.id, status: "completed", providerRefundId },
        reused,
      });
    }
    if (["canceled", "cancelled", "expired", "failed"].includes(status)) {
      await admin
        .from("refunds")
        .update({ status: "failed", provider_refund_id: providerRefundId })
        .eq("id", refund.id);
      return json(502, { error: "refund_provider_error" });
    }
    await finalize(admin, refund, order, payment, providerRefundId, "processing");
    return json(202, { refund: { id: refund.id, status: "processing", providerRefundId }, reused });
  }
  const lookup = await fetch(chargeRoute.lookupUrl, { headers });
  const providerPayment: unknown = await lookup.json().catch(() => null);
  if (!lookup.ok || !isRec(providerPayment)) return json(502, { error: "provider_lookup_failed" });
  const providerAmount = Number(providerPayment.transaction_amount);
  if (
    !Number.isFinite(providerAmount) ||
    Math.round(providerAmount * 100) !== Math.round(Number(payment.amount) * 100) ||
    text(providerPayment.external_reference) !== `apois-entregas-order-${order.id}`
  )
    return json(409, { error: "provider_payment_mismatch" });
  const list = await fetch(chargeRoute.refundUrl, { headers });
  const existing: unknown = await list.json().catch(() => []);
  const existingRefund = Array.isArray(existing)
    ? existing.find(
        (r: any) =>
          Math.round(Number(r?.amount) * 100) === Math.round(Number(refund.amount) * 100) &&
          !["rejected", "cancelled", "canceled"].includes(String(r?.status ?? "").toLowerCase()),
      )
    : null;
  let providerRefund: any = existingRefund;
  reused = Boolean(existingRefund);
  if (!providerRefund) {
    await admin
      .from("refunds")
      .update({ status: "processing" })
      .eq("id", refund.id)
      .in("status", ["pending", "failed", "processing"]);
    const idempotency = `apois-entregas-refund-${refund.id}`;
    const result = await fetch(chargeRoute.refundUrl, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", "X-Idempotency-Key": idempotency },
      body: "{}",
    });
    const raw: unknown = await result.json().catch(() => null);
    if (!result.ok || !isRec(raw)) {
      await admin.from("refunds").update({ status: "failed" }).eq("id", refund.id);
      return json(502, { error: "refund_provider_error" });
    }
    providerRefund = raw;
  }
  providerRefundId =
    providerRefund?.id != null ? String(providerRefund.id) : `apois-entregas-refund-${refund.id}`;
  status = String(providerRefund?.status ?? "").toLowerCase();
  if (["approved", "completed", "refunded"].includes(status)) {
    await finalize(admin, refund, order, payment, providerRefundId);
    return json(200, { refund: { id: refund.id, status: "completed", providerRefundId }, reused });
  }
  if (["rejected", "cancelled", "canceled", "failed"].includes(status)) {
    await admin
      .from("refunds")
      .update({ status: "failed", provider_refund_id: providerRefundId })
      .eq("id", refund.id);
    return json(502, { error: "refund_provider_error" });
  }
  await finalize(admin, refund, order, payment, providerRefundId, "processing");
  return json(202, { refund: { id: refund.id, status: "processing", providerRefundId }, reused });
});
