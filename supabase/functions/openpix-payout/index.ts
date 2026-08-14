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
const PIX_KEY_TYPES = new Set(["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"]);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function response(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function normalizePixKey(type: string, value: string) {
  const trimmed = value.trim();
  if (type === "EMAIL" || type === "EVP") return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (type === "PHONE") {
    if (trimmed.startsWith("+")) return `+${digits}`;
    if (digits.startsWith("55") && [12, 13].includes(digits.length)) return `+${digits}`;
    if ([10, 11].includes(digits.length)) return `+55${digits}`;
  }
  return digits;
}

function openPixAliasType(type: string) {
  return type === "EVP" ? "RANDOM" : type;
}

async function readJson(providerResponse: Response): Promise<unknown> {
  try {
    return await providerResponse.json();
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response(400, { error: "Requisição inválida.", code: "INVALID_REQUEST" });
  }
  const payoutId = isRecord(body) ? text(body.payoutId) : null;
  if (!payoutId || !UUID_RE.test(payoutId)) {
    return response(400, { error: "Saque inválido.", code: "INVALID_PAYOUT_ID" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: providerSetting } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "order_payment_provider")
    .maybeSingle();
  if (providerSetting?.value !== "openpix") {
    return response(409, {
      error: "OpenPix ainda não é o provedor financeiro ativo.",
      code: "PAYMENT_PROVIDER_INACTIVE",
    });
  }

  const { data: environmentSetting } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "openpix_environment")
    .maybeSingle();
  const environment =
    typeof environmentSetting?.value === "string"
      ? environmentSetting.value.trim().toLowerCase()
      : "sandbox";
  if (!["sandbox", "production"].includes(environment)) {
    return response(503, {
      error: "Ambiente OpenPix inválido.",
      code: "PAYMENT_ENVIRONMENT_INVALID",
    });
  }
  const production = environment === "production";
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

  const { data: payout, error: payoutError } = await admin
    .from("payouts")
    .select(
      "id,wallet_id,payout_account_id,amount,status,provider,provider_payout_id,idempotency_key,requested_by,pix_key_snapshot,pix_key_type_snapshot",
    )
    .eq("id", payoutId)
    .maybeSingle();
  if (payoutError) {
    return response(500, {
      error: "Não foi possível consultar o saque.",
      code: "PAYOUT_LOOKUP_FAILED",
    });
  }
  if (!payout) return response(404, { error: "Saque não encontrado.", code: "PAYOUT_NOT_FOUND" });
  if (payout.status === "paid") {
    return response(200, {
      payoutId: payout.id,
      providerPayoutId: payout.provider_payout_id,
      status: "paid",
      reused: true,
    });
  }
  if (!["pending", "processing"].includes(payout.status)) {
    return response(409, {
      error: "Este saque não pode ser processado.",
      code: "PAYOUT_FINALIZED",
    });
  }

  const { data: wallet } = await admin
    .from("wallets")
    .select("id,merchant_id,courier_id")
    .eq("id", payout.wallet_id)
    .maybeSingle();
  if (!wallet || (!wallet.merchant_id && !wallet.courier_id)) {
    return response(409, {
      error: "Carteira de saque inválida.",
      code: "INVALID_WALLET_OWNER",
    });
  }

  const [{ data: activeProfile }, { data: adminRole }] = await Promise.all([
    admin.from("profiles").select("is_active").eq("id", authData.user.id).maybeSingle(),
    admin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .eq("role", "admin")
      .maybeSingle(),
  ]);
  if (activeProfile?.is_active !== true) {
    return response(403, { error: "Conta bloqueada.", code: "ACCOUNT_BLOCKED" });
  }

  let ownerAuthorized = false;
  let ownerType: "merchant" | "courier";
  let ownerId: string;

  if (wallet.merchant_id) {
    ownerType = "merchant";
    ownerId = wallet.merchant_id;
    const [{ data: merchantOwner }, { data: membership }] = await Promise.all([
      admin.from("merchants").select("owner_user_id").eq("id", wallet.merchant_id).maybeSingle(),
      admin
        .from("merchant_members")
        .select("role")
        .eq("merchant_id", wallet.merchant_id)
        .eq("user_id", authData.user.id)
        .eq("status", "active")
        .in("role", ["owner", "manager"])
        .maybeSingle(),
    ]);
    ownerAuthorized = merchantOwner?.owner_user_id === authData.user.id || Boolean(membership);
  } else {
    ownerType = "courier";
    ownerId = wallet.courier_id as string;
    const { data: courierOwner } = await admin
      .from("couriers")
      .select("user_id,status,is_active")
      .eq("id", wallet.courier_id)
      .maybeSingle();
    ownerAuthorized =
      courierOwner?.user_id === authData.user.id &&
      courierOwner?.status === "approved" &&
      courierOwner?.is_active === true;
  }

  if (!ownerAuthorized && !adminRole) {
    return response(403, { error: "Acesso negado.", code: "FORBIDDEN" });
  }

  const payoutPixKey = text(payout.pix_key_snapshot);
  const pixKeyType = text(payout.pix_key_type_snapshot)?.toUpperCase() ?? null;
  if (!payoutPixKey || !pixKeyType || !PIX_KEY_TYPES.has(pixKeyType)) {
    return response(409, {
      error: "O destino PIX congelado para este saque está incompleto.",
      code: "PAYOUT_DESTINATION_SNAPSHOT_REQUIRED",
    });
  }

  const amount = Number(payout.amount);
  const amountCents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount <= 0 || amountCents <= 0) {
    return response(409, {
      error: "Valor do saque inválido.",
      code: "INVALID_PAYOUT_AMOUNT",
    });
  }

  const correlationID = `apois-entrega-payout-${payout.id}`;
  const providerHeaders = { Authorization: appId, Accept: "application/json" };

  const lookupPayment = async () => {
    const providerResponse = await fetch(
      `${apiBase}/api/v1/payment/${encodeURIComponent(correlationID)}`,
      {
        headers: providerHeaders,
      },
    );
    return { providerResponse, providerPayload: await readJson(providerResponse) };
  };

  let providerPayload: unknown = null;
  try {
    const lookup = await lookupPayment();
    if (lookup.providerResponse.ok && isRecord(lookup.providerPayload)) {
      providerPayload = lookup.providerPayload;
    } else {
      const createResponse = await fetch(`${apiBase}/api/v1/payment`, {
        method: "POST",
        headers: { ...providerHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "PIX_KEY",
          value: amountCents,
          destinationAlias: normalizePixKey(pixKeyType, payoutPixKey),
          destinationAliasType: openPixAliasType(pixKeyType),
          correlationID,
          comment: `Saque APOIS Entregas ${payout.id}`,
          autoApprove: true,
          metadata: {
            payoutId: payout.id,
            ownerType,
            ownerId,
          },
        }),
      });
      const created = await readJson(createResponse);
      if (!createResponse.ok || !isRecord(created)) {
        const verified = await lookupPayment();
        if (!verified.providerResponse.ok || !isRecord(verified.providerPayload)) {
          console.error("openpix-payout provider state uncertain", {
            payoutId: payout.id,
            createStatus: createResponse.status,
            lookupStatus: verified.providerResponse.status,
          });
          return response(502, {
            error:
              "Não foi possível confirmar o estado da transferência na OpenPix. Tente novamente.",
            code: "PAYOUT_PROVIDER_UNCERTAIN",
          });
        }
        providerPayload = verified.providerPayload;
      } else {
        providerPayload = created;
      }
    }
  } catch (error) {
    console.error("openpix-payout provider request failed", {
      payoutId: payout.id,
      message: error instanceof Error ? error.message : "unknown",
    });
    return response(502, {
      error: "Não foi possível confirmar o estado do saque na OpenPix. Tente novamente.",
      code: "PAYOUT_PROVIDER_UNCERTAIN",
    });
  }

  const providerPayment =
    isRecord(providerPayload) && isRecord(providerPayload.payment) ? providerPayload.payment : null;
  if (!providerPayment) {
    return response(502, {
      error: "Resposta inválida da OpenPix.",
      code: "INVALID_PROVIDER_RESPONSE",
    });
  }

  const providerCorrelationID = text(providerPayment.correlationID);
  if (providerCorrelationID && providerCorrelationID !== correlationID) {
    return response(409, {
      error: "Referência do saque divergente na OpenPix.",
      code: "PAYOUT_CORRELATION_MISMATCH",
    });
  }

  const providerValue = typeof providerPayment.value === "number" ? providerPayment.value : null;
  if (providerValue !== null && Math.round(providerValue) !== amountCents) {
    return response(409, {
      error: "Valor do saque divergente na OpenPix.",
      code: "PAYOUT_AMOUNT_MISMATCH",
    });
  }

  const providerStatus = (text(providerPayment.status) ?? "CREATED").toUpperCase();
  const transaction =
    isRecord(providerPayload) && isRecord(providerPayload.transaction)
      ? providerPayload.transaction
      : null;
  const providerPayoutId = text(transaction?.endToEndId) ?? correlationID;

  if (providerStatus === "CONFIRMED") {
    const { error: settleError } = await admin.rpc("settle_payout", {
      _payout_id: payout.id,
      _new_status: "paid",
      _provider: "openpix",
      _provider_payout_id: providerPayoutId,
      _failure_reason: null,
    });
    if (settleError) {
      return response(500, {
        error: "Saque confirmado; conciliação pendente.",
        code: "PAYOUT_SETTLEMENT_FAILED",
      });
    }
    return response(200, {
      payoutId: payout.id,
      providerPayoutId,
      status: "paid",
      reused: payout.status === "processing",
    });
  }

  if (["FAILED", "REMOVED", "CANCELLED", "CANCELED", "DENIED"].includes(providerStatus)) {
    const finalStatus =
      providerStatus === "FAILED" || providerStatus === "DENIED" ? "failed" : "cancelled";
    const { error: settleError } = await admin.rpc("settle_payout", {
      _payout_id: payout.id,
      _new_status: finalStatus,
      _provider: "openpix",
      _provider_payout_id: providerPayoutId,
      _failure_reason: `OpenPix status ${providerStatus}`,
    });
    if (settleError) {
      return response(500, {
        error: "Transferência rejeitada; conciliação pendente.",
        code: "PAYOUT_SETTLEMENT_FAILED",
      });
    }
    return response(409, {
      error: "A transferência PIX não foi concluída.",
      code: "PAYOUT_PROVIDER_REJECTED",
      payoutId: payout.id,
      status: finalStatus,
    });
  }

  const { error: processingError } = await admin.rpc("settle_payout", {
    _payout_id: payout.id,
    _new_status: "processing",
    _provider: "openpix",
    _provider_payout_id: providerPayoutId,
    _failure_reason: null,
  });
  if (processingError) {
    return response(500, {
      error: "Não foi possível atualizar o saque.",
      code: "PAYOUT_SETTLEMENT_FAILED",
    });
  }

  return response(200, {
    payoutId: payout.id,
    providerPayoutId,
    status: "processing",
    providerStatus,
    reused: payout.status === "processing",
  });
});
