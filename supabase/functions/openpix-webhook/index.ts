import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function response(status: number, body: JsonRecord) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function expectedWebhookAuthorization(appId: string): Promise<string> {
  return `Bearer ${await sha256Hex(`apois-entregas-openpix-webhook:${appId}`)}`;
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return result === 0;
}

function orderIdFromCorrelation(correlationID: string | null): string | null {
  if (!correlationID?.startsWith("apois-entrega-order-")) return null;
  const value = correlationID.slice("apois-entrega-order-".length);
  return UUID_RE.test(value) ? value : null;
}

function payoutIdFromCorrelation(correlationID: string | null): string | null {
  if (!correlationID?.startsWith("apois-entrega-payout-")) return null;
  const value = correlationID.slice("apois-entrega-payout-".length);
  return UUID_RE.test(value) ? value : null;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return response(405, { error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" });
  }

  const receivedAuthorization = request.headers.get("Authorization")?.trim() ?? "";
  const appIds = [
    Deno.env.get("OPENPIX_APP_ID_SANDBOX")?.trim(),
    Deno.env.get("OPENPIX_APP_ID_PRODUCTION")?.trim(),
  ].filter((value): value is string => Boolean(value));
  if (appIds.length === 0) {
    return response(503, { error: "OpenPix não configurada.", code: "PAYMENT_PROVIDER_NOT_CONFIGURED" });
  }

  let authenticated = false;
  for (const appId of appIds) {
    const expected = await expectedWebhookAuthorization(appId);
    if (safeEqual(receivedAuthorization, expected)) {
      authenticated = true;
      break;
    }
  }
  if (!authenticated) {
    return response(401, { error: "Webhook OpenPix não autenticado.", code: "INVALID_WEBHOOK_AUTH" });
  }

  const rawBody = await request.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return response(400, { error: "Payload inválido.", code: "INVALID_JSON" });
  }
  if (!isRecord(payload)) {
    return response(400, { error: "Payload inválido.", code: "INVALID_PAYLOAD" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return response(500, { error: "Configuração indisponível.", code: "SERVER_CONFIGURATION" });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const event = text(payload.event);
  const charge = isRecord(payload.charge) ? payload.charge : null;
  const pix = isRecord(payload.pix) ? payload.pix : null;
  const outgoingPayment = isRecord(payload.payment) ? payload.payment : null;
  const outgoingTransaction = isRecord(payload.transaction) ? payload.transaction : null;
  const fallbackHash = await sha256Hex(rawBody);
  const now = new Date().toISOString();

  const chargeCompleted =
    event === "OPENPIX:CHARGE_COMPLETED" ||
    (charge && (text(charge.status) ?? "").toUpperCase() === "COMPLETED");

  if (chargeCompleted && charge) {
    const nestedPixCharge = pix && isRecord(pix.charge) ? pix.charge : null;
    const correlationID = text(charge.correlationID) ?? text(nestedPixCharge?.correlationID);
    const orderId = orderIdFromCorrelation(correlationID);
    const providerChargeId = text(charge.globalID) ?? text(charge.id) ?? correlationID;
    const providerTransactionId = text(pix?.transactionID) ?? text(charge.transactionID);
    const eventId = `charge-completed:${providerTransactionId ?? providerChargeId ?? fallbackHash}`;

    const { data: existingEvent } = await admin
      .from("payment_events")
      .select("id,status")
      .eq("provider", "openpix")
      .eq("provider_event_id", eventId)
      .maybeSingle();
    if (existingEvent?.status === "processed" || existingEvent?.status === "ignored") {
      return response(200, { ok: true, reused: true });
    }

    let payment: JsonRecord | null = null;
    if (providerChargeId) {
      const { data } = await admin
        .from("payments")
        .select("id,order_id,status,amount,provider_charge_id,paid_at")
        .eq("provider", "openpix")
        .eq("provider_charge_id", providerChargeId)
        .maybeSingle();
      payment = isRecord(data) ? data : null;
    }
    if (!payment && orderId) {
      const { data } = await admin
        .from("payments")
        .select("id,order_id,status,amount,provider_charge_id,paid_at")
        .eq("provider", "openpix")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      payment = isRecord(data) ? data : null;
    }

    const eventRow = {
      provider: "openpix",
      provider_event_id: eventId,
      event_type: "OPENPIX:CHARGE_COMPLETED",
      payment_id: text(payment?.id),
      payload,
      status: "received",
      error_message: null,
      processed_at: null,
    };
    if (existingEvent) {
      await admin.from("payment_events").update(eventRow).eq("id", existingEvent.id);
    } else {
      await admin.from("payment_events").insert(eventRow);
    }

    if (!payment) {
      await admin
        .from("payment_events")
        .update({ status: "failed", error_message: "payment_not_found" })
        .eq("provider", "openpix")
        .eq("provider_event_id", eventId);
      return response(500, { error: "Pagamento local ainda não encontrado.", code: "PAYMENT_NOT_FOUND" });
    }

    const paymentId = text(payment.id);
    const localOrderId = text(payment.order_id);
    const localAmount = numberValue(payment.amount);
    if (!paymentId || !localOrderId || localAmount === null) {
      return response(500, { error: "Pagamento local inválido.", code: "INVALID_LOCAL_PAYMENT" });
    }

    const paidValueCents = numberValue(pix?.value) ?? numberValue(charge.value);
    const expectedCents = Math.round(localAmount * 100);
    if (paidValueCents === null || Math.round(paidValueCents) !== expectedCents) {
      await admin
        .from("payment_events")
        .update({ status: "failed", error_message: "amount_mismatch", payment_id: paymentId })
        .eq("provider", "openpix")
        .eq("provider_event_id", eventId);
      return response(409, { error: "Valor do webhook divergente.", code: "PAYMENT_AMOUNT_MISMATCH" });
    }

    const { data: order } = await admin
      .from("orders")
      .select("id,status,payment_status")
      .eq("id", localOrderId)
      .maybeSingle();
    if (!order) {
      await admin
        .from("payment_events")
        .update({ status: "failed", error_message: "order_not_found", payment_id: paymentId })
        .eq("provider", "openpix")
        .eq("provider_event_id", eventId);
      return response(500, { error: "Pedido local não encontrado.", code: "ORDER_NOT_FOUND" });
    }

    if (payment.status === "refunded" || ["cancelled", "refunded"].includes(order.status)) {
      await admin
        .from("payment_events")
        .update({
          status: "ignored",
          error_message: "order_or_payment_finalized",
          payment_id: paymentId,
          processed_at: now,
        })
        .eq("provider", "openpix")
        .eq("provider_event_id", eventId);
      return response(200, { ok: true, ignored: true });
    }

    const { error: paymentUpdateError } = await admin
      .from("payments")
      .update({
        status: "paid",
        paid_at: text(payment.paid_at) ?? now,
        provider_charge_id: providerChargeId ?? text(payment.provider_charge_id),
        failed_at: null,
        failure_reason: null,
      })
      .eq("id", paymentId)
      .neq("status", "refunded");
    if (paymentUpdateError) {
      await admin
        .from("payment_events")
        .update({ status: "failed", error_message: "payment_update_failed", payment_id: paymentId })
        .eq("provider", "openpix")
        .eq("provider_event_id", eventId);
      return response(500, { error: "Falha ao confirmar pagamento.", code: "PAYMENT_UPDATE_FAILED" });
    }

    const { error: orderUpdateError } = await admin
      .from("orders")
      .update({ payment_status: "paid" })
      .eq("id", order.id)
      .neq("status", "cancelled")
      .neq("status", "refunded");
    if (orderUpdateError) {
      await admin
        .from("payment_events")
        .update({ status: "failed", error_message: "order_update_failed", payment_id: paymentId })
        .eq("provider", "openpix")
        .eq("provider_event_id", eventId);
      return response(500, { error: "Falha ao sincronizar pedido.", code: "ORDER_UPDATE_FAILED" });
    }

    if (providerTransactionId) {
      await admin.from("payment_transactions").upsert(
        {
          payment_id: paymentId,
          provider_transaction_id: providerTransactionId,
          transaction_type: "charge",
          amount: localAmount,
          status: "completed",
          processed_at: now,
        },
        { onConflict: "payment_id,provider_transaction_id,transaction_type" },
      );
    }

    const { error: reserveError } = await admin.rpc("reserve_paid_order_merchant_net", {
      _order_id: order.id,
    });
    if (reserveError) {
      await admin
        .from("payment_events")
        .update({ status: "failed", error_message: "wallet_reserve_failed", payment_id: paymentId })
        .eq("provider", "openpix")
        .eq("provider_event_id", eventId);
      console.error("openpix-webhook merchant reserve failed", { code: reserveError.code, orderId: order.id });
      return response(500, {
        error: "Pagamento confirmado; conciliação financeira pendente.",
        code: "WALLET_SYNC_FAILED",
      });
    }

    await admin
      .from("payment_events")
      .update({ status: "processed", error_message: null, payment_id: paymentId, processed_at: now })
      .eq("provider", "openpix")
      .eq("provider_event_id", eventId);
    return response(200, { ok: true, paymentId, orderId: order.id });
  }

  if (
    outgoingPayment &&
    ["OPENPIX:MOVEMENT_CONFIRMED", "OPENPIX:MOVEMENT_FAILED", "OPENPIX:MOVEMENT_REMOVED"].includes(
      event ?? "",
    )
  ) {
    const correlationID = text(outgoingPayment.correlationID);
    const payoutId = payoutIdFromCorrelation(correlationID);
    const transactionId = text(outgoingTransaction?.endToEndId) ?? correlationID;
    const eventId = `${event}:${transactionId ?? fallbackHash}`;

    const { data: existingEvent } = await admin
      .from("payment_events")
      .select("id,status")
      .eq("provider", "openpix")
      .eq("provider_event_id", eventId)
      .maybeSingle();
    if (existingEvent?.status === "processed" || existingEvent?.status === "ignored") {
      return response(200, { ok: true, reused: true });
    }

    const eventRow = {
      provider: "openpix",
      provider_event_id: eventId,
      event_type: event ?? "OPENPIX:MOVEMENT",
      payment_id: null,
      payload,
      status: "received",
      error_message: null,
      processed_at: null,
    };
    if (existingEvent) await admin.from("payment_events").update(eventRow).eq("id", existingEvent.id);
    else await admin.from("payment_events").insert(eventRow);

    if (!payoutId) {
      await admin
        .from("payment_events")
        .update({ status: "ignored", error_message: "unknown_payout_correlation", processed_at: now })
        .eq("provider", "openpix")
        .eq("provider_event_id", eventId);
      return response(200, { ok: true, ignored: true });
    }

    const { data: payout } = await admin
      .from("payouts")
      .select("id,amount,status")
      .eq("id", payoutId)
      .maybeSingle();
    if (!payout) {
      await admin
        .from("payment_events")
        .update({ status: "failed", error_message: "payout_not_found" })
        .eq("provider", "openpix")
        .eq("provider_event_id", eventId);
      return response(500, { error: "Saque local não encontrado.", code: "PAYOUT_NOT_FOUND" });
    }

    const providerAmountCents = numberValue(outgoingPayment.value);
    if (
      providerAmountCents !== null &&
      Math.round(providerAmountCents) !== Math.round(Number(payout.amount) * 100)
    ) {
      await admin
        .from("payment_events")
        .update({ status: "failed", error_message: "payout_amount_mismatch" })
        .eq("provider", "openpix")
        .eq("provider_event_id", eventId);
      return response(409, { error: "Valor do saque divergente.", code: "PAYOUT_AMOUNT_MISMATCH" });
    }

    if (["paid", "failed", "cancelled"].includes(payout.status)) {
      await admin
        .from("payment_events")
        .update({ status: "processed", processed_at: now })
        .eq("provider", "openpix")
        .eq("provider_event_id", eventId);
      return response(200, { ok: true, reused: true });
    }

    const newStatus =
      event === "OPENPIX:MOVEMENT_CONFIRMED"
        ? "paid"
        : event === "OPENPIX:MOVEMENT_FAILED"
          ? "failed"
          : "cancelled";
    const errorRecord = isRecord(payload.error) ? payload.error : null;
    const failureReason = text(errorRecord?.description) ?? text(outgoingTransaction?.providerRejectedReason);
    const { error: settleError } = await admin.rpc("settle_payout", {
      _payout_id: payout.id,
      _new_status: newStatus,
      _provider: "openpix",
      _provider_payout_id: transactionId,
      _failure_reason: failureReason,
    });
    if (settleError) {
      await admin
        .from("payment_events")
        .update({ status: "failed", error_message: "payout_settlement_failed" })
        .eq("provider", "openpix")
        .eq("provider_event_id", eventId);
      console.error("openpix-webhook payout settlement failed", { code: settleError.code, payoutId: payout.id });
      return response(500, { error: "Falha ao conciliar saque.", code: "PAYOUT_SETTLEMENT_FAILED" });
    }

    await admin
      .from("payment_events")
      .update({ status: "processed", error_message: null, processed_at: now })
      .eq("provider", "openpix")
      .eq("provider_event_id", eventId);
    return response(200, { ok: true, payoutId: payout.id, status: newStatus });
  }

  const ignoredEventId = `${event ?? "unknown"}:${fallbackHash}`;
  await admin.from("payment_events").upsert(
    {
      provider: "openpix",
      provider_event_id: ignoredEventId,
      event_type: event ?? "unknown",
      payment_id: null,
      payload,
      status: "ignored",
      processed_at: now,
      error_message: "unsupported_event",
    },
    { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
  );
  return response(200, { ok: true, ignored: true });
});
