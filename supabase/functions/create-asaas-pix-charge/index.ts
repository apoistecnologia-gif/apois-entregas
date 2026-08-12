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

const normalizeExpiration = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) {
    return new Date(Date.now() + 30 * 60 * 1000).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
    : parsed.toISOString();
};

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
  const customerExternalReference = `apois-user-${authData.user.id}`;
  const listCustomerResponse = await fetch(
    `${apiBase}/customers?externalReference=${encodeURIComponent(customerExternalReference)}&limit=1`,
    { headers: { access_token: apiKey } },
  );
  if (listCustomerResponse.ok) {
    const listed = await listCustomerResponse.json().catch(() => null);
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
        externalReference: customerExternalReference,
        notificationDisabled: true,
      }),
    });
    const customer = await customerResponse.json().catch(() => null);
    if (!customerResponse.ok || !customer?.id)
      return reply(502, {
        error: "Não foi possível cadastrar o pagador no Asaas.",
        providerStatus: customerResponse.status,
        provider: customer,
      });
    customerId = customer.id;
  }

  const paymentExternalReference = `apois-order-${order.id}`;
  let paymentProvider: any = null;
  let reusedRemoteCharge = false;

  // First recover any charge that Asaas already created for this order. This closes the
  // duplication gap when a prior QR-Code request failed after POST /payments succeeded.
  const listPaymentResponse = await fetch(
    `${apiBase}/payments?externalReference=${encodeURIComponent(paymentExternalReference)}&limit=20`,
    { headers: { access_token: apiKey } },
  );
  if (listPaymentResponse.ok) {
    const listedPayments = await listPaymentResponse.json().catch(() => null);
    const candidates = Array.isArray(listedPayments?.data) ? listedPayments.data : [];
    paymentProvider =
      candidates.find(
        (candidate: any) =>
          candidate?.billingType === "PIX" &&
          !["REFUNDED", "REFUND_REQUESTED", "DELETED"].includes(String(candidate?.status ?? "")),
      ) ?? null;
    reusedRemoteCharge = Boolean(paymentProvider?.id);
  }

  if (!paymentProvider?.id) {
    const dueDate = new Date().toISOString().slice(0, 10);
    const splits =
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
        externalReference: paymentExternalReference,
        splits,
      }),
    });
    paymentProvider = await paymentResponse.json().catch(() => null);
    if (!paymentResponse.ok || !paymentProvider?.id)
      return reply(502, {
        error: "O Asaas recusou a geração da cobrança PIX.",
        providerStatus: paymentResponse.status,
        provider: paymentProvider,
      });
  }

  const providerChargeId = String(paymentProvider.id);
  const idempotencyKey = `asaas:order:${order.id}:pix:${environment}`;

  // Persist the provider payment ID before requesting the QR Code so the webhook can
  // reconcile PAYMENT_CREATED immediately and retries can reuse the same charge.
  let localPayment = existing ?? null;
  if (!localPayment) {
    const { data: inserted, error: insertError } = await admin
      .from("payments")
      .insert({
        order_id: order.id,
        provider: "asaas",
        provider_charge_id: providerChargeId,
        method: "pix",
        status: "processing",
        amount,
        currency: "BRL",
        idempotency_key: idempotencyKey,
      })
      .select("id,status,amount,qr_code_text,qr_code_image_url,expires_at,provider_charge_id")
      .single();

    if (insertError?.code === "23505") {
      const { data: raced } = await admin
        .from("payments")
        .select("id,status,amount,qr_code_text,qr_code_image_url,expires_at,provider_charge_id")
        .eq("order_id", order.id)
        .eq("provider", "asaas")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      localPayment = raced ?? null;
    } else if (insertError || !inserted) {
      return reply(500, {
        error: "Cobrança criada, mas não foi possível registrar o pagamento localmente.",
        code: "PAYMENT_PERSISTENCE_FAILED",
      });
    } else {
      localPayment = inserted;
    }
  } else if (localPayment.provider_charge_id !== providerChargeId) {
    const { data: updated, error: providerIdError } = await admin
      .from("payments")
      .update({ provider_charge_id: providerChargeId, status: "processing" })
      .eq("id", localPayment.id)
      .select("id,status,amount,qr_code_text,qr_code_image_url,expires_at,provider_charge_id")
      .single();
    if (providerIdError || !updated)
      return reply(500, { error: "Não foi possível vincular a cobrança Asaas ao pedido." });
    localPayment = updated;
  }

  if (localPayment?.qr_code_text) {
    return reply(200, {
      payment: {
        id: localPayment.id,
        status: localPayment.status,
        amount: Number(localPayment.amount),
        qrCodeText: localPayment.qr_code_text,
        qrCodeImageUrl: localPayment.qr_code_image_url,
        expiresAt: localPayment.expires_at,
        providerChargeId,
      },
      orderAmount: amount,
      testMode: environment !== "production",
      reused: true,
    });
  }

  const qrResponse = await fetch(`${apiBase}/payments/${providerChargeId}/pixQrCode`, {
    method: "GET",
    headers: { access_token: apiKey, Accept: "application/json" },
  });
  const qrText = await qrResponse.text();
  let qr: any = null;
  try {
    qr = qrText ? JSON.parse(qrText) : null;
  } catch {
    qr = null;
  }

  if (!qrResponse.ok || typeof qr?.payload !== "string" || !qr.payload.trim()) {
    await admin
      .from("payments")
      .update({
        status: "processing",
        failure_reason: `QR_CODE_FETCH_${qrResponse.status}`,
      })
      .eq("id", localPayment.id);

    return reply(502, {
      error: "A cobrança foi criada, mas o Asaas não retornou o QR Code PIX.",
      code: "ASAAS_PIX_QR_NOT_RETURNED",
      providerChargeId,
      providerStatus: qrResponse.status,
      provider: qr ?? { raw: qrText.slice(0, 1000) },
      reusedRemoteCharge,
    });
  }

  const expiresAt = normalizeExpiration(qr.expirationDate);
  const { data: saved, error: saveError } = await admin
    .from("payments")
    .update({
      status: "pending",
      qr_code_text: qr.payload.trim(),
      qr_code_image_url:
        typeof qr.encodedImage === "string" && qr.encodedImage.trim()
          ? `data:image/png;base64,${qr.encodedImage.trim()}`
          : null,
      expires_at: expiresAt,
      failure_reason: null,
    })
    .eq("id", localPayment.id)
    .select("id,status,amount,qr_code_text,qr_code_image_url,expires_at,provider_charge_id")
    .single();
  if (saveError || !saved)
    return reply(500, {
      error: "QR Code recebido, mas não foi possível salvar os dados do PIX localmente.",
      code: "PIX_QR_PERSISTENCE_FAILED",
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
    reused: Boolean(existing?.id) || reusedRemoteCharge,
  });
});
