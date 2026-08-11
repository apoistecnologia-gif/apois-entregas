import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const headers = { ...cors, "Content-Type": "application/json; charset=utf-8" };
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers });
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Método não permitido." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const environment = (Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox").toLowerCase();
  const apiKey =
    environment === "production"
      ? Deno.env.get("ASAAS_API_KEY_PRODUCTION")
      : (Deno.env.get("ASAAS_API_KEY_SANDBOX") ?? Deno.env.get("ASAAS_API_KEY"));
  const apiBase =
    environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  if (!supabaseUrl || !anonKey || !serviceKey || !apiKey)
    return reply(503, { error: "PIX Asaas ainda não configurado.", code: "ASAAS_NOT_CONFIGURED" });

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer "))
    return reply(401, { error: "Autenticação obrigatória." });
  const jwt = authorization.slice(7);
  const auth = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await auth.auth.getUser(jwt);
  if (authError || !authData.user) return reply(401, { error: "Sessão inválida." });

  const body = await req.json().catch(() => ({}));
  const orderId = typeof body?.orderId === "string" ? body.orderId : null;
  if (!orderId) return reply(400, { error: "Pedido inválido." });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(
      "id,order_number,customer_user_id,merchant_id,status,payment_method,payment_status,total,merchant_net",
    )
    .eq("id", orderId)
    .eq("customer_user_id", authData.user.id)
    .maybeSingle();
  if (orderError || !order) return reply(404, { error: "Pedido não encontrado." });
  if (order.payment_method !== "pix") return reply(409, { error: "Este pedido não utiliza PIX." });
  if (order.payment_status === "paid")
    return reply(409, { error: "Este pedido já está pago.", code: "ORDER_ALREADY_PAID" });
  if (["cancelled", "refunded"].includes(order.status))
    return reply(409, { error: "Este pedido não pode mais ser pago." });

  const amount = Number(order.total);
  const merchantNet = Number(order.merchant_net ?? 0);
  if (!Number.isFinite(amount) || amount <= 0)
    return reply(409, { error: "Valor do pedido inválido." });

  const { data: merchantAccount } = await admin
    .from("merchant_asaas_accounts")
    .select("asaas_wallet_id,status")
    .eq("merchant_id", order.merchant_id)
    .maybeSingle();
  if (!merchantAccount?.asaas_wallet_id || merchantAccount.status !== "active") {
    return reply(409, {
      error: "O estabelecimento ainda não possui conta financeira Asaas ativa.",
      code: "MERCHANT_ASAAS_ACCOUNT_REQUIRED",
    });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name,phone,cpf")
    .eq("id", authData.user.id)
    .maybeSingle();
  const cpf = digits(profile?.cpf);
  if (cpf.length !== 11)
    return reply(409, {
      error: "Informe um CPF válido nos seus dados pessoais antes de pagar por PIX.",
      code: "PAYER_DOCUMENT_REQUIRED",
    });
  const payerName = String(profile?.full_name || authData.user.email || "Cliente APOIS");

  const { data: existing } = await admin
    .from("payments")
    .select("id,status,amount,qr_code_text,qr_code_image_url,expires_at,provider_charge_id")
    .eq("order_id", order.id)
    .eq("provider", "asaas")
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.provider_charge_id && existing.qr_code_text) {
    return reply(200, {
      payment: {
        id: existing.id,
        status: existing.status,
        amount: Number(existing.amount),
        qrCodeText: existing.qr_code_text,
        qrCodeImageUrl: existing.qr_code_image_url,
        expiresAt: existing.expires_at,
        providerChargeId: existing.provider_charge_id,
      },
      orderAmount: amount,
      testMode: environment !== "production",
      reused: true,
    });
  }

  let customerId: string | null = null;
  const externalReference = `apois-user-${authData.user.id}`;
  const listResponse = await fetch(
    `${apiBase}/customers?externalReference=${encodeURIComponent(externalReference)}&limit=1`,
    {
      headers: { access_token: apiKey },
    },
  );
  if (listResponse.ok) {
    const listed = await listResponse.json().catch(() => null);
    customerId = listed?.data?.[0]?.id ?? null;
  }
  if (!customerId) {
    const customerResponse = await fetch(`${apiBase}/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: apiKey },
      body: JSON.stringify({
        name: payerName,
        cpfCnpj: cpf,
        email: authData.user.email,
        mobilePhone: digits(profile?.phone) || undefined,
        externalReference,
        notificationDisabled: true,
      }),
    });
    const customer = await customerResponse.json().catch(() => null);
    if (!customerResponse.ok || !customer?.id)
      return reply(502, {
        error: "Não foi possível cadastrar o pagador no Asaas.",
        provider: customer,
      });
    customerId = customer.id;
  }

  const dueDate = new Date().toISOString().slice(0, 10);
  const split =
    merchantNet > 0 && merchantNet <= amount
      ? [{ walletId: merchantAccount.asaas_wallet_id, fixedValue: Number(merchantNet.toFixed(2)) }]
      : undefined;
  const paymentResponse = await fetch(`${apiBase}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", access_token: apiKey },
    body: JSON.stringify({
      customer: customerId,
      billingType: "PIX",
      value: Number(amount.toFixed(2)),
      dueDate,
      description: `APOIS Entrega - pedido #${order.order_number}`,
      externalReference: `apois-order-${order.id}`,
      split,
    }),
  });
  const paymentProvider = await paymentResponse.json().catch(() => null);
  if (!paymentResponse.ok || !paymentProvider?.id)
    return reply(502, {
      error: "O Asaas recusou a geração da cobrança PIX.",
      providerStatus: paymentResponse.status,
      provider: paymentProvider,
    });

  const qrResponse = await fetch(`${apiBase}/payments/${paymentProvider.id}/pixQrCode`, {
    headers: { access_token: apiKey },
  });
  const qr = await qrResponse.json().catch(() => null);
  if (!qrResponse.ok || !qr?.payload)
    return reply(502, {
      error: "A cobrança foi criada, mas o Asaas não retornou o QR Code PIX.",
      provider: qr,
    });

  const expiresAt = qr.expirationDate
    ? new Date(qr.expirationDate).toISOString()
    : new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const idempotencyKey = `asaas:order:${order.id}:pix:${environment}:${paymentProvider.id}`;
  const { data: saved, error: saveError } = await admin
    .from("payments")
    .insert({
      order_id: order.id,
      provider: "asaas",
      provider_charge_id: paymentProvider.id,
      method: "pix",
      status: "pending",
      amount,
      currency: "BRL",
      qr_code_text: qr.payload,
      qr_code_image_url: qr.encodedImage ? `data:image/png;base64,${qr.encodedImage}` : null,
      expires_at: expiresAt,
      idempotency_key: idempotencyKey,
    })
    .select("id,status,amount,qr_code_text,qr_code_image_url,expires_at,provider_charge_id")
    .single();
  if (saveError || !saved)
    return reply(500, {
      error: "Cobrança criada, mas não foi possível registrar o pagamento localmente.",
    });

  return reply(200, {
    payment: {
      id: saved.id,
      status: saved.status,
      amount: Number(saved.amount),
      qrCodeText: saved.qr_code_text,
      qrCodeImageUrl: saved.qr_code_image_url,
      expiresAt: saved.expires_at,
      providerChargeId: saved.provider_charge_id,
    },
    orderAmount: amount,
    testMode: environment !== "production",
    reused: false,
  });
});
