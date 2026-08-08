import { createClient } from "npm:@supabase/supabase-js@2.112.1";

type JsonRecord = Record<string, unknown>;
type OrderItemInput = { productId: string; quantity: number; options: Array<{ optionId: string }> };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_METHODS = new Set(["pix", "credit", "debit", "cash", "wallet"]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function badRequest(message: string, code = "INVALID_REQUEST") {
  return new Response(JSON.stringify({ error: message, code }), { status: 400, headers: jsonHeaders });
}

function parseItems(value: unknown): OrderItemInput[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;
  const items: OrderItemInput[] = [];
  for (const rawItem of value) {
    if (!isRecord(rawItem)) return null;
    const productId = rawItem.productId;
    const quantity = rawItem.quantity;
    const rawOptions = rawItem.options ?? [];
    if (typeof productId !== "string" || !UUID_RE.test(productId)) return null;
    if (!Number.isInteger(quantity) || Number(quantity) <= 0 || Number(quantity) > 99) return null;
    if (!Array.isArray(rawOptions) || rawOptions.length > 50) return null;
    const options: Array<{ optionId: string }> = [];
    for (const rawOption of rawOptions) {
      if (!isRecord(rawOption)) return null;
      const optionId = rawOption.optionId;
      if (typeof optionId !== "string" || !UUID_RE.test(optionId)) return null;
      options.push({ optionId });
    }
    items.push({ productId, quantity: Number(quantity), options });
  }
  return items;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function deriveRequestKey(seed: string, payload: unknown): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${seed}:${stable(payload)}`),
  ));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function mapOrderError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("merchant is closed")) return { status: 409, code: "MERCHANT_CLOSED", error: "O estabelecimento está fechado no momento." };
  if (normalized.includes("merchant is inactive") || normalized.includes("merchant not found")) return { status: 409, code: "MERCHANT_UNAVAILABLE", error: "O estabelecimento não está disponível." };
  if (normalized.includes("group") || normalized.includes("selection")) return { status: 409, code: "CUSTOMIZATION_INVALID", error: "Revise as opções de personalização do pedido." };
  if (normalized.includes("unavailable") || normalized.includes("product") || normalized.includes("option")) return { status: 409, code: "ITEM_UNAVAILABLE", error: "Um item ou adicional não está mais disponível. Revise a sacola." };
  return { status: 409, code: "ORDER_CREATION_FAILED", error: "Não foi possível criar o pedido. Tente novamente." };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" }), { status: 405, headers: jsonHeaders });

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Autenticação obrigatória.", code: "UNAUTHORIZED" }), { status: 401, headers: jsonHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("create-order: Supabase environment is incomplete");
    return new Response(JSON.stringify({ error: "Serviço temporariamente indisponível.", code: "SERVER_CONFIGURATION" }), { status: 500, headers: jsonHeaders });
  }

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return new Response(JSON.stringify({ error: "Sessão inválida ou expirada.", code: "UNAUTHORIZED" }), { status: 401, headers: jsonHeaders });

  let payload: unknown;
  try { payload = await request.json(); } catch { return badRequest("Corpo da requisição inválido."); }
  if (!isRecord(payload)) return badRequest("Dados do pedido inválidos.");

  const merchantId = payload.merchantId;
  const requestKey = payload.requestKey;
  const paymentMethod = payload.paymentMethod;
  const deliveryAddress = payload.deliveryAddress;
  const observation = payload.observation;
  const items = parseItems(payload.items);

  if (typeof merchantId !== "string" || !UUID_RE.test(merchantId)) return badRequest("Estabelecimento inválido.");
  if (typeof requestKey !== "string" || !UUID_RE.test(requestKey)) return badRequest("Identificador da tentativa inválido.");
  if (typeof paymentMethod !== "string" || !PAYMENT_METHODS.has(paymentMethod)) return badRequest("Forma de pagamento inválida.");
  if (!isRecord(deliveryAddress)) return badRequest("Endereço de entrega inválido.");
  if (observation !== undefined && observation !== null && typeof observation !== "string") return badRequest("Observação inválida.");
  if (typeof observation === "string" && observation.length > 1000) return badRequest("A observação é muito longa.");
  if (!items) return badRequest("A sacola contém itens inválidos.");

  // A chave idempotente passa a depender também do conteúdo real da tentativa.
  // Assim, voltar à sacola e alterar itens/endereço não reaproveita um pedido antigo.
  const normalizedItems = [...items]
    .map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      options: [...item.options].map((option) => ({ optionId: option.optionId })).sort((a, b) => a.optionId.localeCompare(b.optionId)),
    }))
    .sort((a, b) => `${a.productId}:${a.options.map((o) => o.optionId).join(",")}`.localeCompare(`${b.productId}:${b.options.map((o) => o.optionId).join(",")}`));

  const effectiveRequestKey = await deriveRequestKey(requestKey, {
    merchantId,
    paymentMethod,
    deliveryAddress,
    observation: typeof observation === "string" ? observation : null,
    items: normalizedItems,
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await adminClient.rpc("create_order_atomic", {
    p_customer_user_id: userData.user.id,
    p_merchant_id: merchantId,
    p_items: items,
    p_payment_method: paymentMethod,
    p_delivery_address: deliveryAddress,
    p_request_key: effectiveRequestKey,
    p_observation: typeof observation === "string" ? observation : null,
  });

  if (error) {
    console.error("create-order RPC failed", { code: error.code, requestKey: effectiveRequestKey });
    const mapped = mapOrderError(error.message);
    return new Response(JSON.stringify({ error: mapped.error, code: mapped.code }), { status: mapped.status, headers: jsonHeaders });
  }

  const created = Array.isArray(data) ? data[0] : null;
  if (!created?.order_id || created.order_number === undefined) {
    console.error("create-order RPC returned an invalid response", { requestKey: effectiveRequestKey });
    return new Response(JSON.stringify({ error: "Resposta inválida ao criar pedido.", code: "INVALID_BACKEND_RESPONSE" }), { status: 500, headers: jsonHeaders });
  }

  const { data: snapshot, error: snapshotError } = await adminClient
    .from("orders")
    .select(`id,order_number,created_at,status,payment_method,payment_status,subtotal,delivery_fee,discount,total,observation,order_items(id,product_id,product_name,product_description,base_price,unit_price,quantity,line_total,selected_options)`)
    .eq("id", created.order_id)
    .single();

  if (snapshotError || !snapshot) {
    console.error("create-order could not load authoritative snapshot", { code: snapshotError?.code, requestKey: effectiveRequestKey });
    return new Response(JSON.stringify({ error: "Pedido criado, mas não foi possível carregar o resumo.", code: "SNAPSHOT_FAILED" }), { status: 500, headers: jsonHeaders });
  }

  return new Response(JSON.stringify({
    orderId: snapshot.id,
    orderNumber: snapshot.order_number,
    createdAt: snapshot.created_at,
    status: snapshot.status,
    paymentMethod: snapshot.payment_method,
    paymentStatus: snapshot.payment_status,
    subtotal: snapshot.subtotal,
    deliveryFee: snapshot.delivery_fee,
    discount: snapshot.discount,
    total: snapshot.total,
    observation: snapshot.observation,
    items: snapshot.order_items,
  }), { status: 200, headers: jsonHeaders });
});
