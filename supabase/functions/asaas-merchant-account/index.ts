import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...cors, "Content-Type": "application/json; charset=utf-8" };
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function encryptSecret(secret: string, passphrase: string) {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(passphrase));
  const key = await crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(secret),
  );
  return { encrypted: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
}

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
  const encryptionKey = Deno.env.get("ASAAS_SUBACCOUNT_ENCRYPTION_KEY");
  const apiBase =
    environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  if (!supabaseUrl || !anonKey || !serviceKey || !apiKey || !encryptionKey) {
    return reply(503, {
      error: "Integração Asaas ainda não configurada.",
      code: "ASAAS_NOT_CONFIGURED",
    });
  }

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
  const merchantId = typeof body?.merchantId === "string" ? body.merchantId : null;
  if (!merchantId) return reply(400, { error: "Estabelecimento obrigatório." });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: member } = await admin
    .from("merchant_members")
    .select("merchant_id,status")
    .eq("merchant_id", merchantId)
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .maybeSingle();
  const { data: isAdmin } = await admin.rpc("has_role", {
    _user_id: authData.user.id,
    _role: "admin",
  });
  if (!member && !isAdmin) return reply(403, { error: "Acesso negado." });

  const { data: merchant } = await admin
    .from("merchants")
    .select("id,name,approval_status")
    .eq("id", merchantId)
    .single();
  if (!merchant || merchant.approval_status !== "approved")
    return reply(409, {
      error: "O estabelecimento precisa estar aprovado antes da abertura da conta Asaas.",
    });

  const { data: existing } = await admin
    .from("merchant_asaas_accounts")
    .select("asaas_account_id,asaas_wallet_id,status")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (existing?.asaas_wallet_id && existing.status === "active")
    return reply(200, { account: existing, reused: true });

  const { data: profile } = await admin
    .from("merchant_financial_profiles")
    .select("*")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!profile)
    return reply(409, {
      error: "Complete os dados financeiros do estabelecimento antes de criar a subconta.",
      code: "FINANCIAL_PROFILE_REQUIRED",
    });

  const payload: Record<string, unknown> = {
    name: profile.legal_name,
    email: profile.email,
    cpfCnpj: String(profile.cpf_cnpj).replace(/\D/g, ""),
    mobilePhone: String(profile.mobile_phone).replace(/\D/g, ""),
    incomeValue: Number(profile.income_value),
    address: profile.address,
    addressNumber: profile.address_number,
    complement: profile.complement || undefined,
    province: profile.province,
    postalCode: String(profile.postal_code).replace(/\D/g, ""),
  };
  if (profile.holder_type === "individual") payload.birthDate = profile.birth_date;
  else payload.companyType = profile.company_type;

  const response = await fetch(`${apiBase}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", access_token: apiKey },
    body: JSON.stringify(payload),
  });
  const provider = await response.json().catch(() => null);
  if (!response.ok || !provider?.id || !provider?.walletId || !provider?.apiKey) {
    await admin
      .from("merchant_asaas_accounts")
      .upsert(
        {
          merchant_id: merchantId,
          holder_type: profile.holder_type,
          status: "error",
          last_error: JSON.stringify(provider)?.slice(0, 1500),
        },
        { onConflict: "merchant_id" },
      );
    return reply(502, {
      error: "O Asaas recusou a criação da subconta.",
      providerStatus: response.status,
      provider,
    });
  }

  const encrypted = await encryptSecret(provider.apiKey, encryptionKey);
  const row = {
    merchant_id: merchantId,
    asaas_account_id: provider.id,
    asaas_wallet_id: provider.walletId,
    encrypted_api_key: encrypted.encrypted,
    api_key_iv: encrypted.iv,
    holder_type: profile.holder_type,
    status: "active",
    last_error: null,
  };
  const { error: saveError } = await admin
    .from("merchant_asaas_accounts")
    .upsert(row, { onConflict: "merchant_id" });
  if (saveError)
    return reply(500, {
      error: "Subconta criada, mas não foi possível salvar os identificadores com segurança.",
    });

  return reply(200, {
    account: {
      asaas_account_id: provider.id,
      asaas_wallet_id: provider.walletId,
      status: "active",
    },
    reused: false,
    environment,
  });
});
