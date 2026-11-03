// Pure, runtime-independent validation rules for legal-acceptance.
// Used by the Edge Function and by Node's built-in test runner.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hexSha256 = /^[0-9a-f]{64}$/i;
const asString = (v) => typeof v === "string" ? v.trim() : "";

export function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateAcceptancePayload(body) {
  if (!isPlainRecord(body)) return { ok: false, error: "invalid_body" };
  const documentId = asString(body.document_id);
  const requestId = asString(body.request_id);
  const action = asString(body.action);
  const checksum = asString(body.content_sha256).toLowerCase();
  const appVersion = asString(body.app_version);
  if (!uuidPattern.test(documentId) || !uuidPattern.test(requestId) ||
      !hexSha256.test(checksum) || !["accepted", "acknowledged"].includes(action) ||
      appVersion.length > 64) {
    return { ok: false, error: "invalid_evidence_request" };
  }
  return {
    ok: true,
    value: { documentId, requestId, action, checksum, appVersion },
  };
}

export function requiredAcceptanceAction(documentKey) {
  return documentKey === "privacy_notice" ? "acknowledged" : "accepted";
}

export function isActiveLegalDocument(document, nowMs = Date.now()) {
  if (!document || document.status !== "published") return false;
  if (typeof document.effective_at !== "string") return false;
  const effectiveAt = Date.parse(document.effective_at);
  return Number.isFinite(effectiveAt) && effectiveAt <= nowMs;
}

export function resolvePreviousAcceptance(requestEvent, documentEvent, documentId, action) {
  // A request_id belongs to exactly one attempted action. Never reinterpret it
  // as proof for a different document, even if that document was accepted earlier.
  if (requestEvent) {
    if (requestEvent.document_version_id !== documentId || requestEvent.action !== action) {
      return { kind: "conflict" };
    }
    return { kind: "existing", event: requestEvent };
  }
  if (documentEvent) {
    if (documentEvent.document_version_id !== documentId || documentEvent.action !== action) {
      return { kind: "conflict" };
    }
    return { kind: "existing", event: documentEvent };
  }
  return { kind: "missing" };
}
