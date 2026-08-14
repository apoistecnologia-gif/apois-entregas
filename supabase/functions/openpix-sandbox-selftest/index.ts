import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

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

Deno.serve(async (request: Request) => {
  if (request.method !== "GET") {
    return response(405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) {
    return response(401, { ok: false, code: "AUTH_REQUIRED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return response(500, { ok: false, code: "SERVER_CONFIGURATION" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    return response(401, { ok: false, code: "INVALID_SESSION" });
  }

  const { data: adminRole, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (roleError) {
    return response(500, { ok: false, code: "AUTHORIZATION_CHECK_FAILED" });
  }
  if (!adminRole) {
    return response(403, { ok: false, code: "ADMIN_REQUIRED" });
  }

  const appId = Deno.env.get("OPENPIX_APP_ID_SANDBOX")?.trim();
  if (!appId) {
    return response(503, { ok: false, code: "OPENPIX_APP_ID_SANDBOX_MISSING" });
  }

  try {
    const webhookUrl = `${supabaseUrl}/functions/v1/openpix-webhook`;
    const providerResponse = await fetch(
      `https://api.woovi-sandbox.com/api/v1/webhook?url=${encodeURIComponent(webhookUrl)}`,
      {
        headers: { Authorization: appId, Accept: "application/json" },
      },
    );
    const payload: unknown = await providerResponse.json().catch(() => null);
    if (!providerResponse.ok || !isRecord(payload)) {
      return response(502, {
        ok: false,
        code: "OPENPIX_AUTH_FAILED",
        providerStatus: providerResponse.status,
      });
    }

    const webhooks = Array.isArray(payload.webhooks) ? payload.webhooks.filter(isRecord) : [];
    const events = webhooks
      .map((item) => text(item.event))
      .filter((value): value is string => Boolean(value))
      .sort();
    return response(200, {
      ok: true,
      providerStatus: providerResponse.status,
      webhookCount: webhooks.length,
      events,
    });
  } catch {
    return response(502, { ok: false, code: "OPENPIX_NETWORK_FAILED" });
  }
});
