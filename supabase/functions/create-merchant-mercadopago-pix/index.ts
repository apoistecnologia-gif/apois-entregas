import { createClient } from "npm:@supabase/supabase-js@2.112.1";

type JsonRecord = Record<string, unknown>;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function json(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}
function fromB64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
async function keyFromEnv() {
  const raw = Deno.env.get("MERCADO_PAGO_OAUTH_TOKEN_KEY_BASE64")?.trim();
  if (!raw) throw new Error("missing_token_key");
  const bytes = fromB64(raw);
  if (bytes.byteLength !== 32) throw new Error("invalid_token_key");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["decrypt"]);
}
async function decrypt(value: string, iv: string, key: CryptoKey) {
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(iv) },
    key,
    fromB64(value),
  );
  return new TextDecoder().decode(clear);
}
function publicPayment(p: any) {
  return {
    id: p.id,
    status: p.status,
    amount: Number(p.amount),
    qrCodeText: p.qr_code_text,
    qrCodeImageUrl: p.qr_code_image_url,
    expiresAt: p.expires_at,
    providerChargeId: p.provider_charge_id,
  };
}
// Divide um nome completo em nome/sobrenome para o objeto `payer` da Orders API.
// Usa somente o full_name real já coletado no cadastro (user_metadata) — nunca inventa dado.
function splitFullName(fullName: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const jwt = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!jwt) return json(401, { error: "authentication_required" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return json(500, { error: "server_configuration" });
  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const user = userData.user;
  if (userError || !user) return json(401, { error: "invalid_session" });
  const body = await req.json().catch(() => null);
  const orderId = isRecord(body) ? text(body.orderId) : null;
  if (!orderId) return json(400, { error: "invalid_order_id" });
  const deviceId = isRecord(body) ? text((body as JsonRecord).deviceId) : null;
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(
      "id,customer_user_id,merchant_id,total,payment_method,payment_status,status,order_items(product_name,product_description,unit_price,quantity)",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) return json(500, { error: "order_lookup_failed" });
  if (!order) return json(404, { error: "order_not_found" });
  if (order.customer_user_id !== user.id) return json(403, { error: "forbidden" });
  if (order.payment_method !== "pix") return json(409, { error: "payment_method_mismatch" });
  if (["cancelled", "refunded"].includes(order.status))
    return json(409, { error: "order_not_payable" });
  const { data: mpAccount } = await admin
    .from("merchant_mercadopago_accounts")
    .select("*")
    .eq("merchant_id", order.merchant_id)
    .eq("status", "connected")
    .maybeSingle();
  if (!mpAccount)
    return json(409, {
      error: "merchant_mercadopago_not_connected",
      message: "Este estabelecimento ainda não configurou o recebimento pelo Mercado Pago.",
    });
  // Gate de mensalidade ativa: só é dispensado para a conta explicitamente marcada
  // orders_api_enabled=true — a mesma flag de isolamento da migração 20260825190000,
  // usada exclusivamente pelo estabelecimento de teste desta homologação da Orders API.
  // Nenhum estabelecimento real (flag default false) é afetado por este bypass.
  if (mpAccount.orders_api_enabled !== true) {
    const { data: subscription } = await admin
      .from("merchant_subscriptions")
      .select("provider_status,current_period_end,last_payment_status,metadata")
      .eq("merchant_id", order.merchant_id)
      .maybeSingle();
    const accessAllowed = Boolean(
      subscription?.last_payment_status === "approved" &&
      subscription?.current_period_end &&
      new Date(subscription.current_period_end).getTime() > Date.now(),
    );
    if (!accessAllowed)
      return json(409, {
        error: "merchant_subscription_inactive",
        message: "Este estabelecimento está temporariamente indisponível para novos pedidos.",
      });
  }
  let token: string;
  try {
    const key = await keyFromEnv();
    token = await decrypt(mpAccount.encrypted_access_token, mpAccount.token_iv, key);
  } catch {
    return json(503, { error: "merchant_payment_credentials_unavailable" });
  }
  const amount = Number(order.total);
  if (!Number.isFinite(amount) || amount <= 0) return json(409, { error: "invalid_order_amount" });
  const existing = await admin
    .from("payments")
    .select("*")
    .eq("order_id", order.id)
    .order("created_at", { ascending: false });
  const rows = existing.data ?? [];
  const paid = rows.find((p: any) => p.status === "paid");
  if (order.payment_status === "paid" || paid) {
    if (paid?.provider === "mercadopago_merchant")
      return json(200, { payment: publicPayment(paid), reused: true });
    return json(409, { error: "order_already_paid" });
  }
  const prefix = `mercadopago_merchant:order:${order.id}:pix`;
  let local = rows.find(
    (p: any) =>
      p.provider === "mercadopago_merchant" &&
      ["pending", "processing"].includes(p.status) &&
      (!p.expires_at || new Date(p.expires_at).getTime() > Date.now()),
  );
  if (!local) {
    const attempt =
      rows.filter((p: any) => String(p.idempotency_key ?? "").startsWith(prefix)).length + 1;
    const idempotencyKey = `${prefix}:attempt:${attempt}`;
    const ins = await admin
      .from("payments")
      .insert({
        order_id: order.id,
        provider: "mercadopago_merchant",
        method: "pix",
        status: "pending",
        amount,
        currency: "BRL",
        idempotency_key: idempotencyKey,
        merchant_mercadopago_account_id: mpAccount.id,
        provider_seller_id: mpAccount.provider_user_id,
      })
      .select("*")
      .single();
    if (ins.error) {
      const raced = await admin
        .from("payments")
        .select("*")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      local = raced.data;
    } else local = ins.data;
  }
  if (!local) return json(500, { error: "payment_create_failed" });
  const notificationUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/merchant-mercadopago-webhook`;
  // Isolamento de homologação: só contas explicitamente marcadas com
  // orders_api_enabled=true (ver migração 20260825190000) usam a Orders API nova.
  // Todo estabelecimento real conectado hoje (flag default false) continua no
  // caminho legado /v1/payments, sem nenhuma mudança de comportamento.
  const useOrdersApi = mpAccount.orders_api_enabled === true;
  let providerId: string | null;
  let qr: string | null;
  let qrBase64: string | null;
  let ticket: string | null;
  let paidNow: boolean;
  let expiresAt: string | null;
  if (useOrdersApi) {
    const { firstName, lastName } = splitFullName(
      text((user.user_metadata as JsonRecord | undefined)?.full_name),
    );
    const items = (
      Array.isArray((order as JsonRecord).order_items)
        ? ((order as JsonRecord).order_items as JsonRecord[])
        : []
    ).map((i) => ({
      title: text(i.product_name) ?? "Item",
      description: text(i.product_description) ?? undefined,
      quantity: Number(i.quantity) || 1,
      unit_price: Number(i.unit_price) || 0,
    }));
    // Notificações da Orders API são configuradas uma vez no nível da aplicação (Notifications
    // do painel / mcp save_webhook), não por requisição — por isso não há `notification_url`
    // nem `application_fee` no corpo abaixo (este último nem existe para /v1/orders; o
    // recebimento de 100% pelo estabelecimento já é garantido por usar o access_token OAuth
    // dele como collector, sem nenhum mecanismo de split aplicado).
    const providerBody: JsonRecord = {
      type: "online",
      processing_mode: "automatic",
      total_amount: amount.toFixed(2),
      external_reference: `apois-entregas-order-${order.id}`,
      payer: {
        email: user.email ?? undefined,
        first_name: firstName ?? undefined,
        last_name: lastName ?? undefined,
      },
      additional_info: items.length ? { items } : undefined,
      transactions: {
        payments: [
          {
            amount: amount.toFixed(2),
            payment_method: {
              id: "pix",
              type: "bank_transfer",
              statement_descriptor: "APOIS ENTREGAS",
            },
          },
        ],
      },
    };
    const mpHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Idempotency-Key": local.idempotency_key,
    };
    if (deviceId) mpHeaders["X-meli-session-id"] = deviceId;
    const mpRes = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: mpHeaders,
      body: JSON.stringify(providerBody),
    });
    const raw: unknown = await mpRes.json().catch(() => null);
    if (!mpRes.ok || !isRecord(raw)) {
      await admin
        .from("payments")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: `mercadopago_http_${mpRes.status}`,
        })
        .eq("id", local.id)
        .neq("status", "paid");
      return json(502, {
        error: "payment_provider_error",
        message: "O Mercado Pago não conseguiu gerar o PIX agora.",
      });
    }
    const payments =
      isRecord(raw.transactions) && Array.isArray((raw.transactions as JsonRecord).payments)
        ? ((raw.transactions as JsonRecord).payments as JsonRecord[])
        : [];
    const firstPayment = payments[0] && isRecord(payments[0]) ? payments[0] : null;
    const pm =
      firstPayment && isRecord(firstPayment.payment_method) ? firstPayment.payment_method : null;
    providerId = raw.id != null ? String(raw.id) : null;
    qr = text(pm?.qr_code);
    qrBase64 = text(pm?.qr_code_base64);
    ticket = text(pm?.ticket_url);
    const providerStatus = text(raw.status) ?? "pending";
    const providerStatusDetail = text(raw.status_detail) ?? "";
    paidNow = providerStatus === "processed" && providerStatusDetail === "accredited";
    expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  } else {
    const providerBody = {
      transaction_amount: amount,
      description: `APOIS Entregas - pedido ${order.id}`,
      payment_method_id: "pix",
      payer: { email: user.email ?? undefined },
      external_reference: `apois-entregas-order-${order.id}`,
      notification_url: notificationUrl,
      application_fee: 0,
    };
    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Idempotency-Key": local.idempotency_key,
      },
      body: JSON.stringify(providerBody),
    });
    const raw: unknown = await mpRes.json().catch(() => null);
    if (!mpRes.ok || !isRecord(raw)) {
      await admin
        .from("payments")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: `mercadopago_http_${mpRes.status}`,
        })
        .eq("id", local.id)
        .neq("status", "paid");
      return json(502, {
        error: "payment_provider_error",
        message: "O Mercado Pago não conseguiu gerar o PIX agora.",
      });
    }
    const tx =
      isRecord(raw.point_of_interaction) && isRecord(raw.point_of_interaction.transaction_data)
        ? raw.point_of_interaction.transaction_data
        : null;
    providerId = raw.id != null ? String(raw.id) : null;
    qr = text(tx?.qr_code);
    qrBase64 = text(tx?.qr_code_base64);
    ticket = text(tx?.ticket_url);
    const providerStatus = text(raw.status) ?? "pending";
    paidNow = providerStatus === "approved";
    expiresAt = text(raw.date_of_expiration);
  }
  if (!providerId || (!qr && !paidNow)) {
    await admin
      .from("payments")
      .update({
        status: "failed",
        failure_reason: "mercadopago_missing_pix_data",
        failed_at: new Date().toISOString(),
      })
      .eq("id", local.id);
    return json(502, { error: "invalid_provider_response" });
  }
  const upd = await admin
    .from("payments")
    .update({
      provider_charge_id: providerId,
      status: paidNow ? "paid" : "pending",
      qr_code_text: qr,
      qr_code_image_url: qrBase64 ? `data:image/png;base64,${qrBase64}` : ticket,
      expires_at: expiresAt,
      paid_at: paidNow ? new Date().toISOString() : null,
      failed_at: null,
      failure_reason: null,
      merchant_mercadopago_account_id: mpAccount.id,
      provider_seller_id: mpAccount.provider_user_id,
    })
    .eq("id", local.id)
    .select("*")
    .single();
  if (upd.error || !upd.data) return json(500, { error: "payment_save_failed" });
  await admin
    .from("orders")
    .update({ payment_status: paidNow ? "paid" : "pending" })
    .eq("id", order.id)
    .neq("status", "cancelled")
    .neq("status", "refunded");
  return json(200, {
    payment: publicPayment(upd.data),
    reused: false,
    recipient: "merchant",
    applicationFee: 0,
  });
});
