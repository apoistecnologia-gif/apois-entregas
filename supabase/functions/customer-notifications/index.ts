import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const reply = (status: number, body: JsonRecord) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST")
    return reply(405, { error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" });

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return reply(401, { error: "Autenticação obrigatória.", code: "UNAUTHORIZED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return reply(500, {
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
    return reply(401, { error: "Sessão inválida ou expirada.", code: "UNAUTHORIZED" });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return reply(400, { error: "Requisição inválida.", code: "INVALID_REQUEST" });
  }
  if (!isRecord(payload))
    return reply(400, { error: "Requisição inválida.", code: "INVALID_REQUEST" });

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (payload.action === "get") {
    const { data: preference, error: preferenceError } = await client
      .from("notification_preferences")
      .select("order_updates,promotions,product_news,account_alerts")
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (preferenceError)
      return reply(500, {
        error: "Não foi possível carregar suas preferências.",
        code: "PREFERENCES_FAILED",
      });

    const { data: notifications, error: notificationsError } = await client
      .from("notifications")
      .select("id,notification_type,title,body,data,read_at,created_at")
      .eq("user_id", authData.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (notificationsError)
      return reply(500, {
        error: "Não foi possível carregar suas notificações.",
        code: "NOTIFICATIONS_FAILED",
      });

    return reply(200, {
      preferences: preference ?? {
        order_updates: true,
        promotions: false,
        product_news: false,
        account_alerts: true,
      },
      notifications: notifications ?? [],
    });
  }

  if (payload.action === "save") {
    const settings = payload.settings;
    if (!isRecord(settings))
      return reply(400, { error: "Preferências inválidas.", code: "INVALID_SETTINGS" });
    const keys = ["order_updates", "promotions", "product_news", "account_alerts"] as const;
    for (const key of keys) {
      if (typeof settings[key] !== "boolean") {
        return reply(400, { error: "Preferências inválidas.", code: "INVALID_SETTINGS" });
      }
    }

    const { error } = await client.from("notification_preferences").upsert(
      {
        user_id: authData.user.id,
        order_updates: settings.order_updates,
        promotions: settings.promotions,
        product_news: settings.product_news,
        account_alerts: settings.account_alerts,
      },
      { onConflict: "user_id" },
    );
    if (error)
      return reply(500, {
        error: "Não foi possível salvar suas preferências.",
        code: "SAVE_FAILED",
      });
    return reply(200, { saved: true });
  }

  if (payload.action === "read") {
    const notificationId = payload.notificationId;
    if (typeof notificationId !== "string")
      return reply(400, { error: "Notificação inválida.", code: "INVALID_NOTIFICATION" });
    const { error } = await client.rpc("mark_notification_read", {
      _notification_id: notificationId,
    });
    if (error)
      return reply(500, {
        error: "Não foi possível marcar a notificação como lida.",
        code: "READ_FAILED",
      });
    return reply(200, { read: true });
  }

  return reply(400, { error: "Ação inválida.", code: "INVALID_ACTION" });
});
