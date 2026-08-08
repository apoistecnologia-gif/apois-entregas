import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
type JsonRecord = Record<string, unknown>;
function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function response(status: number, body: JsonRecord) { return new Response(JSON.stringify(body), { status, headers: jsonHeaders }); }

function authorized(request: Request, secret: string): boolean {
  const auth = request.headers.get("Authorization")?.trim();
  const providerSecret = request.headers.get("x-webhook-secret")?.trim();
  return auth === secret || auth === `Bearer ${secret}` || providerSecret === secret;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return response(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("OPENPIX_WEBHOOK_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    console.error("openpix-webhook environment incomplete");
    return response(500, { error: "server_configuration" });
  }
  if (!authorized(request, webhookSecret)) return response(401, { error: "unauthorized" });

  let payload: unknown;
  try { payload = await request.json(); } catch { return response(400, { error: "invalid_json" }); }
  if (!isRecord(payload)) return response(400, { error: "invalid_payload" });

  const event = text(payload.event) ?? text(payload.type) ?? "OPENPIX:UNKNOWN";
  const charge = isRecord(payload.charge) ? payload.charge : null;
  if (!charge) return response(202, { accepted: true, ignored: true });

  const correlationID = text(charge.correlationID);
  const transactionID = text(charge.transactionID) ?? text(charge.identifier);
  const chargeStatus = text(charge.status) ?? "UNKNOWN";
  const value = typeof charge.value === "number" ? charge.value : Number(charge.value);
  if (!correlationID) return response(400, { error: "missing_correlation_id" });

  const providerEventId = [event, correlationID, transactionID ?? "no-tx", chargeStatus, Number.isFinite(value) ? value : "no-value"].join(":");
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .select("id,order_id,status,amount,provider_charge_id")
    .eq("idempotency_key", correlationID)
    .maybeSingle();

  if (paymentError) {
    console.error("openpix webhook payment lookup", { code: paymentError.code });
    return response(500, { error: "lookup_failed" });
  }

  const { data: existingEvent } = await admin
    .from("payment_events")
    .select("id,status")
    .eq("provider", "openpix")
    .eq("provider_event_id", providerEventId)
    .maybeSingle();
  if (existingEvent) return response(200, { accepted: true, duplicate: true });

  const eventInsert = await admin
    .from("payment_events")
    .insert({
      provider: "openpix",
      provider_event_id: providerEventId,
      event_type: event,
      payment_id: payment?.id ?? null,
      payload,
      status: payment ? "received" : "ignored",
      processed_at: payment ? null : new Date().toISOString(),
    })
    .select("id")
    .single();

  if (eventInsert.error) {
    if (eventInsert.error.code === "23505") return response(200, { accepted: true, duplicate: true });
    console.error("openpix webhook event persistence", { code: eventInsert.error.code });
    return response(500, { error: "event_persistence_failed" });
  }

  if (!payment) return response(202, { accepted: true, ignored: true });

  if (Number.isFinite(value) && Math.round(Number(payment.amount) * 100) !== Math.round(value)) {
    await admin.from("payment_events").update({ status: "failed", error_message: "amount_mismatch", processed_at: new Date().toISOString() }).eq("id", eventInsert.data.id);
    console.error("openpix webhook amount mismatch", { paymentId: payment.id });
    return response(409, { error: "amount_mismatch" });
  }

  const normalizedEvent = event.toUpperCase();
  const normalizedStatus = chargeStatus.toUpperCase();
  const completed = normalizedEvent.includes("CHARGE_COMPLETED") || normalizedStatus === "COMPLETED" || normalizedStatus === "PAID";
  const expired = normalizedEvent.includes("CHARGE_EXPIRED") || normalizedStatus === "EXPIRED";
  const failed = normalizedEvent.includes("CHARGE_FAILED") || normalizedStatus === "FAILED";

  if (completed) {
    const now = new Date().toISOString();
    const { error: updatePaymentError } = await admin
      .from("payments")
      .update({ status: "paid", paid_at: now, provider_charge_id: transactionID ?? payment.provider_charge_id, failure_reason: null })
      .eq("id", payment.id)
      .neq("status", "refunded");
    if (updatePaymentError) {
      await admin.from("payment_events").update({ status: "failed", error_message: updatePaymentError.code, processed_at: now }).eq("id", eventInsert.data.id);
      return response(500, { error: "payment_update_failed" });
    }

    const { data: order } = await admin.from("orders").select("id,status,payment_status").eq("id", payment.order_id).single();
    if (order && !["cancelled", "refunded"].includes(order.status)) {
      await admin.from("orders").update({ payment_status: "paid" }).eq("id", payment.order_id);
    }

    await admin.from("payment_transactions").upsert({
      payment_id: payment.id,
      provider_transaction_id: transactionID,
      transaction_type: "charge",
      amount: Number(payment.amount),
      status: "completed",
      processed_at: now,
    }, { onConflict: "payment_id,provider_transaction_id,transaction_type", ignoreDuplicates: true });
    await admin.from("payment_events").update({ status: "processed", processed_at: now }).eq("id", eventInsert.data.id);
    return response(200, { accepted: true, processed: "paid" });
  }

  if (expired || failed) {
    const now = new Date().toISOString();
    await admin.from("payments").update({ status: "failed", failed_at: now, failure_reason: expired ? "expired" : "provider_failed" }).eq("id", payment.id).eq("status", "pending");
    await admin.from("payment_events").update({ status: "processed", processed_at: now }).eq("id", eventInsert.data.id);
    return response(200, { accepted: true, processed: expired ? "expired" : "failed" });
  }

  await admin.from("payment_events").update({ status: "ignored", processed_at: new Date().toISOString() }).eq("id", eventInsert.data.id);
  return response(202, { accepted: true, ignored: true });
});
