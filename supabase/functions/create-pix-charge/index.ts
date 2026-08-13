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

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return response(405, { error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return response(401, { error: "Autenticação obrigatória.", code: "UNAUTHORIZED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response(500, {
      error: "Serviço temporariamente indisponível.",
      code: "SERVER_CONFIGURATION",
    });
  }

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return response(401, { error: "Sessão inválida ou expirada.", code: "UNAUTHORIZED" });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return response(400, { error: "Requisição inválida.", code: "INVALID_REQUEST" });
  }
  const orderId = isRecord(payload) ? text(payload.orderId) : null;
  if (!orderId || !UUID_RE.test(orderId)) {
    return response(400, { error: "Pedido inválido.", code: "INVALID_ORDER_ID" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: providerSetting, error: providerSettingError } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "order_payment_provider")
    .maybeSingle();
  if (providerSettingError || providerSetting?.value !== "openpix") {
    return response(409, {
      error: "OpenPix ainda não é o provedor ativo para novos pedidos.",
      code: "PAYMENT_PROVIDER_INACTIVE",
    });
  }

  const { data: environmentSetting } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "openpix_environment")
    .maybeSingle();
  const configuredEnvironment =
    typeof environmentSetting?.value === "string" ? environmentSetting.value.trim().toLowerCase() : "sandbox";
  if (!["sandbox", "production"].includes(configuredEnvironment)) {
    return response(503, {
      error: "Ambiente OpenPix inválido.",
      code: "PAYMENT_ENVIRONMENT_INVALID",
    });
  }
  const production = configuredEnvironment === "production";
  const appId = production
    ? Deno.env.get("OPENPIX_APP_ID_PRODUCTION")?.trim()
    : Deno.env.get("OPENPIX_APP_ID_SANDBOX")?.trim();
  if (!appId) {
    return response(503, {
      error: "OpenPix ainda não está configurada para este ambiente.",
      code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
    });
  }
  const apiBase = production ? OPENPIX_PRODUCTION_BASE : OPENPIX_SANDBOX_BASE;

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id,customer_user_id,total,payment_status,payment_method,status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) {
    console.error("create-pix-charge order lookup failed", { code: orderError.code, orderId });
    return response(500, { error: "Não foi possível consultar o pedido.", code: "ORDER_LOOKUP_FAILED" });
  }
  if (!order) return response(404, { error: "Pedido não encontrado.", code: "ORDER_NOT_FOUND" });
  if (order.customer_user_id !== authData.user.id) {
    return response(403, { error: "Este pedido não pertence à sua conta.", code: "FORBIDDEN" });
  }
  if (order.payment_method !== "pix") {
    return response(409, { error: "O pedido não está configurado para PIX.", code: "PAYMENT_METHOD_MISMATCH" });
  }
  if (["cancelled", "refunded"].includes(order.status)) {
    return response(409, { error: "Este pedido não aceita novas cobranças.", code: "ORDER_NOT_PAYABLE" });
  }

  const amount = Number(order.total);
  const amountCents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount <= 0 || amountCents <= 0) {
    return response(409, { error: "Valor do pedido inválido.", code: "INVALID_ORDER_AMOUNT" });
  }

  const environment = configuredEnvironment;
  const idempotencyKey = `openpix:order:${order.id}:pix:${environment}`;
  const correlationID = `apois-entrega-order-${order.id}`;

  const { data: allOrderPayments, error: allPaymentsError } = await admin
    .from("payments")
    .select(
      "id,provider,provider_charge_id,status,amount,qr_code_text,qr_code_image_url,expires_at,paid_at,idempotency_key",
    )
    .eq("order_id", order.id)
    .order("created_at", { ascending: false });
  if (allPaymentsError) {
    console.error("create-pix-charge payment lookup failed", { code: allPaymentsError.code, orderId });
    return response(500, { error: "Não foi possível consultar o pagamento.", code: "PAYMENT_LOOKUP_FAILED" });
  }

  const payments = (allOrderPayments ?? []) as LocalPayment[];
  const alreadyPaid = payments.find((item) => item.status === "paid");
  if (order.payment_status === "paid" || alreadyPaid) {
    if (alreadyPaid?.provider === "openpix") {
      return response(200, { payment: publicPayment(alreadyPaid), reused: true });
    }
    return response(409, {
      error: "Este pedido já foi pago por outro fluxo.",
      code: "ORDER_ALREADY_PAID",
    });
  }

  const conflictingPending = payments.find(
    (item) => item.provider !== "openpix" && ["pending", "processing"].includes(item.status),
  );
  if (conflictingPending) {
    return response(409, {
      error: "Existe uma cobrança anterior ainda pendente para este pedido.",
      code: "PENDING_PAYMENT_PROVIDER_CONFLICT",
    });
  }

  let localPayment = payments.find((item) => item.idempotency_key === idempotencyKey) ?? null;
  if (!localPayment) {
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
      if (insertError.code !== "23505") {
        console.error("create-pix-charge payment insert failed", { code: insertError.code, orderId });
        return response(500, { error: "Não foi possível preparar a cobrança.", code: "PAYMENT_CREATE_FAILED" });
      }
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

  if (!localPayment) {
    return response(500, { error: "Não foi possível preparar a cobrança.", code: "PAYMENT_CREATE_FAILED" });
  }

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
    console.error("create-pix-charge OpenPix error", {
      status: providerResponse.status,
      orderId,
      environment,
    });
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
    console.error("create-pix-charge OpenPix amount mismatch", {
      orderId,
      expected: amountCents,
      received: providerValue,
    });
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
  if (updateError || !updatedPayment) {
    console.error("create-pix-charge local update failed", { code: updateError?.code, orderId });
    return response(500, { error: "Não foi possível salvar a cobrança.", code: "PAYMENT_SAVE_FAILED" });
  }

  if (paid) {
    const { error: orderUpdateError } = await admin
      .from("orders")
      .update({ payment_status: "paid" })
      .eq("id", order.id)
      .not("status", "in", '("cancelled","refunded")');
    if (orderUpdateError) {
      console.error("create-pix-charge order paid update failed", { code: orderUpdateError.code, orderId });
      return response(500, { error: "Pagamento confirmado, aguardando conciliação.", code: "ORDER_SYNC_FAILED" });
    }
    const { error: reserveError } = await admin.rpc("reserve_paid_order_merchant_net", {
      _order_id: order.id,
    });
    if (reserveError) {
      console.error("create-pix-charge merchant reserve failed", { code: reserveError.code, orderId });
      return response(500, {
        error: "Pagamento confirmado, aguardando conciliação financeira.",
        code: "WALLET_SYNC_FAILED",
      });
    }
  }

  return response(200, {
    payment: publicPayment(updatedPayment as LocalPayment),
    reused: Boolean((providerPayload as JsonRecord).reused),
  });
});
