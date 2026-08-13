import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const headers = { ...cors, "Content-Type": "application/json; charset=utf-8" };
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers });

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function decryptSecret(ciphertext: string, ivValue: string, passphrase: string) {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(passphrase));
  const key = await crypto.subtle.importKey("raw", material, "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivValue) },
    key,
    base64ToBytes(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

function normalizePixKey(type: string, value: string) {
  if (["CPF", "CNPJ", "PHONE"].includes(type)) return value.replace(/\D/g, "");
  return value.trim();
}

function inferPixKeyType(value: string, document: string | null) {
  const trimmed = value.trim();
  const normalized = trimmed.replace(/\D/g, "");
  const normalizedDocument = String(document ?? "").replace(/\D/g, "");
  if (trimmed.includes("@")) return "EMAIL";
  if (normalized.length === 14) return "CNPJ";
  if (normalized.length === 11 && normalized === normalizedDocument) return "CPF";
  if ([10, 11, 12, 13].includes(normalized.length)) return "PHONE";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return "EVP";
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Método não permitido." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey)
    return reply(503, { error: "Serviço financeiro temporariamente indisponível." });

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
  const payoutId = typeof body?.payoutId === "string" ? body.payoutId : null;
  if (!payoutId) return reply(400, { error: "Saque inválido." });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: providerSetting } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "order_payment_provider")
    .maybeSingle();
  const activeProvider =
    typeof providerSetting?.value === "string"
      ? providerSetting.value.trim().toLowerCase()
      : "asaas";

  // Compatibility endpoint: the merchant UI historically invokes `asaas-payout`.
  // Keep that contract stable while routing new payouts to the currently active
  // provider. This avoids forcing the large merchant workspace to know gateway names.
  if (activeProvider === "openpix") {
    const openPixResponse = await fetch(`${supabaseUrl}/functions/v1/openpix-payout`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payoutId }),
    });
    const payload = await openPixResponse.text();
    return new Response(payload, {
      status: openPixResponse.status,
      headers,
    });
  }

  if (activeProvider !== "asaas") {
    return reply(409, {
      error: "O provedor ativo ainda não possui fluxo de saque configurado.",
      code: "PAYOUT_PROVIDER_UNSUPPORTED",
    });
  }

  const environment = (Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox").toLowerCase();
  const encryptionKey = Deno.env.get("ASAAS_SUBACCOUNT_ENCRYPTION_KEY");
  const apiBase =
    environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  if (!encryptionKey) return reply(503, { error: "Integração Asaas ainda não configurada." });

  const { data: payout } = await admin
    .from("payouts")
    .select("id,wallet_id,payout_account_id,amount,status,provider_payout_id")
    .eq("id", payoutId)
    .maybeSingle();
  if (!payout) return reply(404, { error: "Saque não encontrado." });
  if (payout.status === "paid") return reply(200, { payoutId, status: "paid", reused: true });
  if (!["pending", "processing"].includes(payout.status))
    return reply(409, { error: "Este saque não pode ser processado." });

  const { data: wallet } = await admin
    .from("wallets")
    .select("id,merchant_id")
    .eq("id", payout.wallet_id)
    .maybeSingle();
  if (!wallet?.merchant_id)
    return reply(409, {
      error: "Este fluxo automático é exclusivo da carteira do estabelecimento.",
    });
  const { data: membership } = await admin
    .from("merchant_members")
    .select("merchant_id")
    .eq("merchant_id", wallet.merchant_id)
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .maybeSingle();
  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: authData.user.id,
    _role: "admin",
  });
  if (!membership && !isAdmin) return reply(403, { error: "Acesso negado." });

  const { data: destination } = await admin
    .from("payout_accounts")
    .select("pix_key,pix_key_type,document,is_active")
    .eq("id", payout.payout_account_id)
    .maybeSingle();
  if (!destination?.is_active || !destination.pix_key) {
    return reply(409, {
      error: "Cadastre uma chave PIX antes de solicitar o saque.",
      code: "PIX_KEY_REQUIRED",
    });
  }
  const pixKeyType =
    destination.pix_key_type || inferPixKeyType(destination.pix_key, destination.document);
  if (!pixKeyType) {
    return reply(409, {
      error: "Não foi possível identificar automaticamente o tipo da chave PIX.",
      code: "PIX_KEY_TYPE_REQUIRED",
    });
  }
  if (!destination.pix_key_type) {
    await admin
      .from("payout_accounts")
      .update({ pix_key_type: pixKeyType })
      .eq("id", payout.payout_account_id);
  }

  const { data: asaasAccount } = await admin
    .from("merchant_asaas_accounts")
    .select("encrypted_api_key,api_key_iv,status")
    .eq("merchant_id", wallet.merchant_id)
    .maybeSingle();
  if (
    !asaasAccount?.encrypted_api_key ||
    !asaasAccount.api_key_iv ||
    asaasAccount.status !== "active"
  ) {
    return reply(409, { error: "A subconta Asaas do estabelecimento não está ativa." });
  }

  const subaccountApiKey = await decryptSecret(
    asaasAccount.encrypted_api_key,
    asaasAccount.api_key_iv,
    encryptionKey,
  );
  const transferResponse = await fetch(`${apiBase}/transfers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", access_token: subaccountApiKey },
    body: JSON.stringify({
      value: Number(payout.amount),
      pixAddressKey: normalizePixKey(pixKeyType, destination.pix_key),
      pixAddressKeyType: pixKeyType,
      description: `Saque APOIS ${payout.id}`,
      externalReference: `apois-payout-${payout.id}`,
    }),
  });
  const transfer = await transferResponse.json().catch(() => null);
  if (!transferResponse.ok || !transfer?.id) {
    await admin.rpc("settle_payout", {
      _payout_id: payout.id,
      _new_status: "failed",
      _provider: "asaas",
      _provider_payout_id: null,
      _failure_reason:
        JSON.stringify(transfer)?.slice(0, 1000) || `HTTP ${transferResponse.status}`,
    });
    return reply(502, {
      error: "O Asaas recusou a transferência PIX.",
      providerStatus: transferResponse.status,
      provider: transfer,
    });
  }

  const providerStatus = String(transfer.status || "PENDING").toUpperCase();
  if (providerStatus === "DONE") {
    await admin.rpc("settle_payout", {
      _payout_id: payout.id,
      _new_status: "paid",
      _provider: "asaas",
      _provider_payout_id: transfer.id,
      _failure_reason: null,
    });
    return reply(200, {
      payoutId: payout.id,
      providerPayoutId: transfer.id,
      status: "paid",
      reused: false,
    });
  }

  await admin.rpc("settle_payout", {
    _payout_id: payout.id,
    _new_status: "processing",
    _provider: "asaas",
    _provider_payout_id: transfer.id,
    _failure_reason: null,
  });
  return reply(200, {
    payoutId: payout.id,
    providerPayoutId: transfer.id,
    status: "processing",
    reused: false,
  });
});
