import { createClient } from "npm:@supabase/supabase-js@2.112.1";
import {
  validateAcceptancePayload,
  isActiveLegalDocument,
  requiredAcceptanceAction,
  resolvePreviousAcceptance,
} from "./rules.mjs";

// Implementação preparada em branch de homologação. Não implantar até aprovar
// os documentos, executar/testar a migration e configurar APOIS_LEGAL_ALLOWED_ORIGINS.
// Supabase secret key deve permanecer EXCLUSIVAMENTE no servidor.

type JsonRecord = Record<string, unknown>;

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return response(req, 400, { error: "invalid_json" });
  }
  const parsed = validateAcceptancePayload(body);
  if (!parsed.ok) return response(req, 400, { error: parsed.error });
  const { documentId, requestId, action, checksum, appVersion } = parsed.value;

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
  if (!isActiveLegalDocument(document)) {
    return response(req, 409, { error: "document_not_active" });
  }
  if (checksum !== document.content_sha256) {
    return response(req, 409, { error: "document_changed_reload_required" });
  }
  const requiredAction = requiredAcceptanceAction(document.document_key);
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
    // A request_id collision and an already-accepted document are distinct cases.
    // Resolve the request_id first, or a reused ID could be accepted for another act.
    const { data: byRequestId, error: requestError } = await admin
      .from("legal_acceptance_events")
      .select("id,document_version_id,action,occurred_at")
      .eq("user_id", userId)
      .eq("request_id", requestId)
      .maybeSingle();
    if (requestError) return response(req, 503, { error: "evidence_lookup_failed" });

    let byDocument = null;
    if (!byRequestId) {
      const prior = await admin
        .from("legal_acceptance_events")
        .select("id,document_version_id,action,occurred_at")
        .eq("user_id", userId)
        .eq("document_version_id", documentId)
        .eq("action", action)
        .maybeSingle();
      if (prior.error) return response(req, 503, { error: "evidence_lookup_failed" });
      byDocument = prior.data;
    }
    const decision = resolvePreviousAcceptance(byRequestId, byDocument, documentId, action);
    if (decision.kind === "conflict") {
      return response(req, 409, { error: "request_id_already_used" });
    }
    if (decision.kind === "existing") {
      return response(req, 200, {
        id: decision.event.id,
        document_version_id: decision.event.document_version_id,
        version: document.version,
        content_sha256: document.content_sha256,
        action: decision.event.action,
        occurred_at: decision.event.occurred_at,
        accepted_from_server: true,
        already_recorded: true,
      });
    }
    return response(req, 503, { error: "evidence_lookup_failed" });
  }
  return response(req, 503, { error: "evidence_not_recorded" });
});
