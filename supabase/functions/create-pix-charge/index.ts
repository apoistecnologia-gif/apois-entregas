import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPENPIX_SANDBOX_BASE = "https://api.woovi-sandbox.com";
const OPENPIX_PRODUCTION_BASE = "https://api.openpix.com.br";
const OPENPIX_WEBHOOK_EVENTS = [
  "OPENPIX:CHARGE_COMPLETED",
  "OPENPIX:TRANSACTION_REFUND_RECEIVED",
  "OPENPIX:MOVEMENT_CONFIRMED",
  "OPENPIX:MOVEMENT_FAILED",
  "OPENPIX:MOVEMENT_REMOVED",
] as const;

type JsonRecord = Record<string, unknown>;
type LocalPayment = {
  id: string;
  provider: string;
  provider_charge_id: string | null;
  status: string;
  amount: number;
  qr_code_text: string | null;
  qr_code_image_url: string | null;
  expires_at: string | null;
  paid_at: string | null;
  idempotency_key: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function response(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
function publicPayment(payment: LocalPayment) {
  return {
    id: payment.id,
    status: payment.status,
    amount: Number(payment.amount),
    qrCodeText: payment.qr_code_text,
    qrCodeImageUrl: payment.qr_code_image_url,
    expiresAt: payment.expires_at,
    providerChargeId: payment.provider_charge_id,
  };
}
async function readJson(providerResponse: Response): Promise<unknown> {
  try {
    return await providerResponse.json();
  } catch {
    return null;
  }
}
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
async function webhookAuthorization(appId: string): Promise<string> {
  return `Bearer ${await sha256Hex(`apois-entregas-openpix-webhook:${appId}`)}`;
}
async function ensureOpenPixWebhooks(input: {
  apiBase: string;
  appId: string;
  webhookUrl: string;
}) {
  const expectedAuthorization = await webhookAuthorization(input.appId);
  const headers = { Authorization: input.appId, Accept: "application/json" };
  const listResponse = await fetch(
    `${input.apiBase}/api/v1/webhook?url=${encodeURIComponent(input.webhookUrl)}`,
    { headers },
  );
  const listPayload = await readJson(listResponse);
  if (!listResponse.ok || !isRecord(listPayload)) {
    throw new Error(`openpix_webhook_list_http_${listResponse.status}`);
  }
  const webhooks = Array.isArray(listPayload.webhooks) ? listPayload.webhooks.filter(isRecord) : [];

  for (const event of OPENPIX_WEBHOOK_EVENTS) {
    const exists = webhooks.some(
      (item) =>
        text(item.url) === input.webhookUrl &&
        text(item.event) === event &&
        item.isActive !== false &&
        text(item.authorization) === expectedAuthorization,
    );
    if (exists) continue;

    const createResponse = await fetch(`${input.apiBase}/api/v1/webhook`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        webhook: {
          name: `APOIS Entregas - ${event}`.slice(0, 120),
          event,
          url: input.webhookUrl,
          authorization: expectedAuthorization,
          isActive: true,
        },
      }),
    });
    if (!createResponse.ok) {
      throw new Error(`openpix_webhook_create_${event}_${createResponse.status}`);
    }
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST")
    return response(405, { error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" });

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer "))
    return response(401, { error: "Autenticação obrigatória.", code: "UNAUTHORIZED" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey)
    return response(500, {
      error: "Serviço temporariamente indisponível.",
      code: "SERVER_CONFIGURATION",
    });

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user)
    return response(401, { error: "Sessão inválida ou expirada.", code: "UNAUTHORIZED" });

  const payload = await request.json().catch(() => null);
  const orderId = isRecord(payload) ? text(payload.orderId) : null;
  if (!orderId || !UUID_RE.test(orderId))
    return response(400, { error: "Pedido inválido.", code: "INVALID_ORDER_ID" });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: providerSetting, error: providerSettingError } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "order_payment_provider")
    .maybeSingle();
  if (providerSettingError || providerSetting?.value !== "openpix")
    return response(409, {
      error: "OpenPix ainda não é o provedor ativo para novos pedidos.",
      code: "PAYMENT_PROVIDER_INACTIVE",
    });

  const { data: environmentSetting } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "openpix_environment")
    .maybeSingle();
  const environment =
    typeof environmentSetting?.value === "string"
      ? environmentSetting.value.trim().toLowerCase()
      : "sandbox";
  if (!["sandbox", "production"].includes(environment))
    return response(503, {
      error: "Ambiente OpenPix inválido.",
      code: "PAYMENT_ENVIRONMENT_INVALID",
    });

  const production = environment === "production";
  const appId = production
    ? Deno.env.get("OPENPIX_APP_ID_PRODUCTION")?.trim()
    : Deno.env.get("OPENPIX_APP_ID_SANDBOX")?.trim();
  if (!appId)
    return response(503, {
      error: "OpenPix ainda não está configurada para este ambiente.",
      code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
    });
  const apiBase = production ? OPENPIX_PRODUCTION_BASE : OPENPIX_SANDBOX_BASE;

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,customer_user_id,total,payment_status,payment_method,status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError)
    return response(500, {
      error: "Não foi possível consultar o pedido.",
      code: "ORDER_LOOKUP_FAILED",
    });
  if (!order) return response(404, { error: "Pedido não encontrado.", code: "ORDER_NOT_FOUND" });
  if (order.customer_user_id !== authData.user.id)
    return response(403, { error: "Este pedido não pertence à sua conta.", code: "FORBIDDEN" });
  if (order.payment_method !== "pix")
    return response(409, {
      error: "O pedido não está configurado para PIX.",
      code: "PAYMENT_METHOD_MISMATCH",
    });
  if (["cancelled", "refunded"].includes(order.status))
    return response(409, {
      error: "Este pedido não aceita novas cobranças.",
      code: "ORDER_NOT_PAYABLE",
    });

  const amount = Number(order.total);
  const amountCents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount <= 0 || amountCents <= 0)
    return response(409, { error: "Valor do pedido inválido.", code: "INVALID_ORDER_AMOUNT" });

  try {
    await ensureOpenPixWebhooks({
      apiBase,
      appId,
      webhookUrl: `${supabaseUrl}/functions/v1/openpix-webhook`,
    });
  } catch (error) {
    console.error("create-pix-charge OpenPix webhook bootstrap failed", {
      orderId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return response(503, {
      error: "A integração OpenPix ainda não conseguiu validar o webhook de confirmação.",
      code: "OPENPIX_WEBHOOK_NOT_READY",
    });
  }

  const idempotencyPrefix = `openpix:order:${order.id}:pix:${environment}`;
  const { data: allOrderPayments, error: allPaymentsError } = await admin
    .from("payments")
    .select(
      "id,provider,provider_charge_id,status,amount,qr_code_text,qr_code_image_url,expires_at,paid_at,idempotency_key",
    )
    .eq("order_id", order.id)
    .order("created_at", { ascending: false });
  if (allPaymentsError)
    return response(500, {
      error: "Não foi possível consultar o pagamento.",
      code: "PAYMENT_LOOKUP_FAILED",
    });

  const payments = (allOrderPayments ?? []) as LocalPayment[];
  const alreadyPaid = payments.find((item) => item.status === "paid");
  if (order.payment_status === "paid" || alreadyPaid) {
    if (alreadyPaid?.provider === "openpix")
      return response(200, { payment: publicPayment(alreadyPaid), reused: true });
    return response(409, {
      error: "Este pedido já foi pago por outro fluxo.",
      code: "ORDER_ALREADY_PAID",
    });
  }

  const conflictingPending = payments.find(
    (item) => item.provider !== "openpix" && ["pending", "processing"].includes(item.status),
  );
  if (conflictingPending)
    return response(409, {
      error: "Existe uma cobrança anterior ainda pendente para este pedido.",
      code: "PENDING_PAYMENT_PROVIDER_CONFLICT",
    });

  const environmentPayments = payments.filter(
    (item) => item.provider === "openpix" && item.idempotency_key.startsWith(idempotencyPrefix),
  );
  const nowMs = Date.now();
  let localPayment =
    environmentPayments.find((item) => {
      const expirationMs = item.expires_at ? Date.parse(item.expires_at) : Number.NaN;
      const expiredLocally = Number.isFinite(expirationMs) && expirationMs <= nowMs;
      if (["pending", "processing"].includes(item.status)) return !expiredLocally;
      return item.status === "failed" && !item.provider_charge_id;
    }) ?? null;

  let idempotencyKey = localPayment?.idempotency_key ?? null;
  if (!localPayment) {
    const legacyKeyAvailable = !environmentPayments.some(
      (item) => item.idempotency_key === idempotencyPrefix,
    );
    const attemptNumber = environmentPayments.length + 1;
    idempotencyKey = legacyKeyAvailable
      ? idempotencyPrefix
      : `${idempotencyPrefix}:attempt:${attemptNumber}`;

    const { data: insertedPayment, error: insertError } = await admin
      .from("payments")
      .insert({
        order_id: order.id,
        provider: "openpix",
        method: "pix",
        status: "pending",
        amount,
        currency: "BRL",
        idempotency_key: idempotencyKey,
      })
      .select(
        "id,provider,provider_charge_id,status,amount,qr_code_text,qr_code_image_url,expires_at,paid_at,idempotency_key",
      )
      .single();
    if (insertError) {
      if (insertError.code !== "23505")
        return response(500, {
          error: "Não foi possível preparar a cobrança.",
          code: "PAYMENT_CREATE_FAILED",
        });
      const { data: racedPayment } = await admin
        .from("payments")
        .select(
          "id,provider,provider_charge_id,status,amount,qr_code_text,qr_code_image_url,expires_at,paid_at,idempotency_key",
        )
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      localPayment = racedPayment as LocalPayment | null;
    } else {
      localPayment = insertedPayment as LocalPayment;
    }
  }
  if (!localPayment)
    return response(500, {
      error: "Não foi possível preparar a cobrança.",
      code: "PAYMENT_CREATE_FAILED",
    });

  const correlationID =
    localPayment.idempotency_key === idempotencyPrefix
      ? `apois-entrega-order-${order.id}`
      : `apois-entrega-order-${order.id}-payment-${localPayment.id}`;

  const providerResponse = await fetch(`${apiBase}/api/v1/charge?return_existing=true`, {
    method: "POST",
    headers: {
      Authorization: appId,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      correlationID,
      value: amountCents,
      comment: `APOIS Entregas - pedido ${order.id}`,
      expiresIn: 1800,
    }),
  });
  const providerPayload = await readJson(providerResponse);
  if (!providerResponse.ok || !isRecord(providerPayload) || !isRecord(providerPayload.charge)) {
    await admin
      .from("payments")
      .update({ status: "failed", failure_reason: `openpix_http_${providerResponse.status}` })
      .eq("id", localPayment.id)
      .neq("status", "paid");
    return response(502, {
      error: "A OpenPix não conseguiu gerar o PIX agora.",
      code: "PAYMENT_PROVIDER_ERROR",
    });
  }

  const charge = providerPayload.charge;
  const providerValue = numberValue(charge.value);
  if (providerValue !== null && Math.round(providerValue) !== amountCents) {
    await admin
      .from("payments")
      .update({ status: "failed", failure_reason: "openpix_amount_mismatch" })
      .eq("id", localPayment.id)
      .neq("status", "paid");
    return response(502, {
      error: "A cobrança retornou um valor divergente do pedido.",
      code: "PAYMENT_AMOUNT_MISMATCH",
    });
  }

  const providerChargeId = text(charge.globalID) ?? text(charge.id) ?? correlationID;
  const qrCodeText = text(charge.brCode);
  const qrCodeImageUrl = text(charge.qrCodeImage);
  const expiresAt = text(charge.expiresDate) ?? text(charge.expiresAt);
  const providerStatus = (text(charge.status) ?? "ACTIVE").toUpperCase();
  const paid = providerStatus === "COMPLETED";
  const now = new Date().toISOString();

  if (providerStatus === "EXPIRED") {
    await admin
      .from("payments")
      .update({
        provider_charge_id: providerChargeId,
        qr_code_text: qrCodeText,
        qr_code_image_url: qrCodeImageUrl,
        expires_at: expiresAt,
        status: "failed",
        failed_at: now,
        failure_reason: "openpix_charge_expired",
      })
      .eq("id", localPayment.id)
      .neq("status", "paid");
    if (order.payment_status !== "paid") {
      await admin
        .from("orders")
        .update({ payment_status: "failed" })
        .eq("id", order.id)
        .neq("status", "cancelled")
        .neq("status", "refunded");
    }
    return response(409, {
      error: "Este código PIX expirou. Gere um novo PIX para continuar.",
      code: "PAYMENT_EXPIRED",
    });
  }

  if (!qrCodeText && !paid) {
    await admin
      .from("payments")
      .update({ status: "failed", failure_reason: "openpix_missing_brcode" })
      .eq("id", localPayment.id)
      .neq("status", "paid");
    return response(502, {
      error: "A OpenPix não retornou o código PIX da cobrança.",
      code: "INVALID_PROVIDER_RESPONSE",
    });
  }

  const { data: updatedPayment, error: updateError } = await admin
    .from("payments")
    .update({
      provider_charge_id: providerChargeId,
      qr_code_text: qrCodeText,
      qr_code_image_url: qrCodeImageUrl,
      expires_at: expiresAt,
      status: paid ? "paid" : "pending",
      paid_at: paid ? now : null,
      failed_at: null,
      failure_reason: null,
    })
    .eq("id", localPayment.id)
    .neq("status", "refunded")
    .select(
      "id,provider,provider_charge_id,status,amount,qr_code_text,qr_code_image_url,expires_at,paid_at,idempotency_key",
    )
    .single();
  if (updateError || !updatedPayment)
    return response(500, {
      error: "Não foi possível salvar a cobrança.",
      code: "PAYMENT_SAVE_FAILED",
    });

  const { error: orderUpdateError } = await admin
    .from("orders")
    .update({ payment_status: paid ? "paid" : "pending" })
    .eq("id", order.id)
    .neq("status", "cancelled")
    .neq("status", "refunded");
  if (orderUpdateError)
    return response(500, {
      error: paid
        ? "Pagamento confirmado, aguardando conciliação."
        : "PIX gerado, mas o pedido ainda não foi sincronizado.",
      code: "ORDER_SYNC_FAILED",
    });

  if (paid) {
    const { error: reserveError } = await admin.rpc("reserve_paid_order_merchant_net", {
      _order_id: order.id,
    });
    if (reserveError)
      return response(500, {
        error: "Pagamento confirmado, aguardando conciliação financeira.",
        code: "WALLET_SYNC_FAILED",
      });
  }

  return response(200, {
    payment: publicPayment(updatedPayment as LocalPayment),
    reused: Boolean(providerPayload.reused),
  });
});
