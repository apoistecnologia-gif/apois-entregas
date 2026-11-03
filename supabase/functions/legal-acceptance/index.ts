import { createClient } from "npm:@supabase/supabase-js@2.112.1";

// Implementação preparada em branch de homologação. Não implantar até aprovar
// os documentos, executar/testar a migration e configurar APOIS_LEGAL_ALLOWED_ORIGINS.
// Supabase secret key deve permanecer EXCLUSIVAMENTE no servidor.

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hexSha256 = /^[0-9a-f]{64}$/i;

function response(req: Request, code: number, data: JsonRecord) {
  const origin = req.headers.get("origin");
  const allowed = (Deno.env.get("APOIS_LEGAL_ALLOWED_ORIGINS") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const permitted = !origin || allowed.includes(origin);
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin && permitted) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(code === 204 ? null : JSON.stringify(data), { status: permitted ? code : 403, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return response(req, 204, {});
  if (req.method !== "POST") return response(req, 405, { error: "method_not_allowed" });

  // Rejeitar browser origins não declaradas, antes mesmo de processar a requisição.
  const origin = req.headers.get("origin");
  const origins = (Deno.env.get("APOIS_LEGAL_ALLOWED_ORIGINS") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (origin && !origins.includes(origin)) return response(req, 403, { error: "origin_denied" });

  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt || jwt === authHeader) return response(req, 401, { error: "authentication_required" });

  let body: JsonRecord | null;
  try {
    body = asRecord(await req.json());
  } catch {
    return response(req, 400, { error: "invalid_json" });
  }
  if (!body) return response(req, 400, { error: "invalid_body" });

  const documentId = asString(body.document_id);
  const requestId = asString(body.request_id);
  const action = asString(body.action);
  const checksum = asString(body.content_sha256).toLowerCase();
  const appVersion = asString(body.app_version);
  if (!uuidPattern.test(documentId) || !uuidPattern.test(requestId)
      || !hexSha256.test(checksum) || !["accepted", "acknowledged"].includes(action)
      || appVersion.length > 64) {
    return response(req, 400, { error: "invalid_evidence_request" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) return response(req, 503, { error: "service_unavailable" });

  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await admin.auth.getUser(jwt);
  const userId = auth.user?.id;
  if (authError || !userId) return response(req, 401, { error: "invalid_session" });

  // Catálogo confiável definido pelo servidor, não por raw_user_meta_data.
  const { data: document, error: docError } = await admin
    .from("legal_document_versions")
    .select("id,document_key,audience,version,content_sha256,status,effective_at")
    .eq("id", documentId)
    .maybeSingle();
  if (docError) return response(req, 503, { error: "catalog_unavailable" });
  if (!document || document.status !== "published" ||
      !document.effective_at || Date.parse(document.effective_at) > Date.now()) {
    return response(req, 409, { error: "document_not_active" });
  }
  if (checksum !== document.content_sha256) {
    return response(req, 409, { error: "document_changed_reload_required" });
  }
  const requiredAction = document.document_key === "privacy_notice"
    ? "acknowledged"
    : "accepted";
  if (action !== requiredAction) {
    return response(req, 400, { error: "invalid_legal_action" });
  }

  // A função é baseada em membros efetivamente existentes, NUNCA em role do body
  // nem em user_metadata editável.
  if (document.audience === "courier") {
    const { data, error } = await admin.from("couriers")
      .select("id").eq("user_id", userId).limit(1).maybeSingle();
    if (error) return response(req, 503, { error: "audience_lookup_failed" });
    if (!data) return response(req, 403, { error: "audience_not_allowed" });
  } else if (document.audience === "merchant") {
    const { data, error } = await admin.from("merchant_members")
      .select("id").eq("user_id", userId).limit(1).maybeSingle();
    if (error) return response(req, 503, { error: "audience_lookup_failed" });
    if (!data) return response(req, 403, { error: "audience_not_allowed" });
  } else if (document.audience === "customer") {
    const { data, error } = await admin.from("user_roles")
      .select("id").eq("user_id", userId).eq("role", "customer").limit(1).maybeSingle();
    if (error) return response(req, 503, { error: "audience_lookup_failed" });
    if (!data) return response(req, 403, { error: "audience_not_allowed" });
  } else if (document.audience !== "all") {
    return response(req, 403, { error: "audience_not_allowed" });
  }

  const { data: inserted, error: insertError } = await admin
    .from("legal_acceptance_events")
    .insert({
      user_id: userId,
      document_version_id: document.id,
      action,
      request_id: requestId,
      client_app_version: appVersion || null,
      source: "edge_function",
    })
    .select("id,document_version_id,action,occurred_at")
    .single();

  if (!insertError && inserted) {
    return response(req, 201, {
      id: inserted.id,
      document_version_id: inserted.document_version_id,
      version: document.version,
      content_sha256: document.content_sha256,
      action: inserted.action,
      occurred_at: inserted.occurred_at,
      accepted_from_server: true,
    });
  }

  if (insertError?.code === "23505") {
    const { data: prior, error: readError } = await admin
      .from("legal_acceptance_events")
      .select("id,document_version_id,action,occurred_at")
      .eq("user_id", userId)
      .or("request_id.eq." + requestId + ",document_version_id.eq." + documentId)
      .order("occurred_at", { ascending: true })
      .limit(5);
    if (readError) return response(req, 503, { error: "evidence_lookup_failed" });
    const matching = prior?.find((entry) =>
      entry.document_version_id === documentId && entry.action === action);
    if (matching) {
      return response(req, 200, {
        id: matching.id,
        document_version_id: matching.document_version_id,
        version: document.version,
        content_sha256: document.content_sha256,
        action: matching.action,
        occurred_at: matching.occurred_at,
        accepted_from_server: true,
        already_recorded: true,
      });
    }
    return response(req, 409, { error: "request_id_already_used" });
  }
  return response(req, 503, { error: "evidence_not_recorded" });
});
