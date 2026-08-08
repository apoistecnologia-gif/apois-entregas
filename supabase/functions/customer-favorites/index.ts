import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const reply = (status: number, body: JsonRecord) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" });

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return reply(401, { error: "Autenticação obrigatória.", code: "UNAUTHORIZED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return reply(500, { error: "Serviço temporariamente indisponível.", code: "SERVER_CONFIGURATION" });
  }

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    return reply(401, { error: "Sessão inválida ou expirada.", code: "UNAUTHORIZED" });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return reply(400, { error: "Requisição inválida.", code: "INVALID_REQUEST" });
  }
  if (!isRecord(payload)) return reply(400, { error: "Requisição inválida.", code: "INVALID_REQUEST" });

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (payload.action === "list") {
    const { data, error } = await client
      .from("customer_favorites")
      .select(`
        merchant_id,
        created_at,
        merchants (
          id,
          name,
          slug,
          logo_url,
          cover_url,
          description,
          delivery_fee,
          delivery_min_minutes,
          delivery_max_minutes,
          rating,
          review_count,
          city,
          state,
          neighborhood,
          is_open
        )
      `)
      .eq("customer_user_id", authData.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("customer-favorites list failed", { code: error.code });
      return reply(500, { error: "Não foi possível carregar seus favoritos.", code: "LIST_FAILED" });
    }
    return reply(200, { favorites: data ?? [] });
  }

  const merchantId = payload.merchantId;
  if (typeof merchantId !== "string" || !UUID_RE.test(merchantId)) {
    return reply(400, { error: "Estabelecimento inválido.", code: "INVALID_MERCHANT_ID" });
  }

  if (payload.action === "status") {
    const { data, error } = await client
      .from("customer_favorites")
      .select("merchant_id")
      .eq("customer_user_id", authData.user.id)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (error) return reply(500, { error: "Não foi possível consultar o favorito.", code: "STATUS_FAILED" });
    return reply(200, { favorite: Boolean(data) });
  }

  if (payload.action === "toggle") {
    const { data: existing, error: existingError } = await client
      .from("customer_favorites")
      .select("merchant_id")
      .eq("customer_user_id", authData.user.id)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (existingError) return reply(500, { error: "Não foi possível atualizar o favorito.", code: "TOGGLE_FAILED" });

    if (existing) {
      const { error } = await client
        .from("customer_favorites")
        .delete()
        .eq("customer_user_id", authData.user.id)
        .eq("merchant_id", merchantId);
      if (error) return reply(500, { error: "Não foi possível remover dos favoritos.", code: "DELETE_FAILED" });
      return reply(200, { favorite: false });
    }

    const { error } = await client.from("customer_favorites").insert({
      customer_user_id: authData.user.id,
      merchant_id: merchantId,
    });
    if (error) {
      const inactive = error.code === "42501";
      return reply(inactive ? 409 : 500, {
        error: inactive ? "Este estabelecimento não está disponível para favoritar." : "Não foi possível adicionar aos favoritos.",
        code: inactive ? "MERCHANT_UNAVAILABLE" : "INSERT_FAILED",
      });
    }
    return reply(200, { favorite: true });
  }

  return reply(400, { error: "Ação inválida.", code: "INVALID_ACTION" });
});
