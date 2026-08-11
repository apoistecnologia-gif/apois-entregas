import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const headers = { "Content-Type": "application/json; charset=utf-8" };
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN")?.trim();
  if (!supabaseUrl || !serviceKey || !webhookToken)
    return reply(500, { error: "server_configuration" });

  const receivedToken = req.headers.get("asaas-access-token")?.trim();
  if (!receivedToken || receivedToken !== webhookToken)
    return reply(401, { error: "invalid_token" });

  const payload = await req.json().catch(() => null);
  const eventId = typeof payload?.id === "string" ? payload.id : null;
  const eventType = typeof payload?.event === "string" ? payload.event : null;
  const providerPaymentId = typeof payload?.payment?.id === "string" ? payload.payment.id : null;
  const providerTransferId = typeof payload?.transfer?.id === "string" ? payload.transfer.id : null;
  if (!eventId || !eventType) return reply(400, { error: "invalid_payload" });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: existing } = await admin
    .from("asaas_webhook_events")
    .select("id,processed_at")
    .eq("event_id", eventId)
    .maybeSingle();
  if (existing?.processed_at) return reply(200, { accepted: true, duplicate: true });

  let eventRowId = existing?.id ?? null;
  if (!eventRowId) {
    const { data: inserted, error } = await admin
      .from("asaas_webhook_events")
      .insert({
        event_id: eventId,
        event_type: eventType,
        resource_type: providerPaymentId ? "payment" : providerTransferId ? "transfer" : null,
        resource_id: providerPaymentId ?? providerTransferId ?? null,
        payload,
      })
      .select("id")
      .single();
    if (error?.code === "23505") return reply(200, { accepted: true, duplicate: true });
    if (error || !inserted) return reply(500, { error: "event_persistence_failed" });
    eventRowId = inserted.id;
  }

  const now = new Date().toISOString();

  if (providerTransferId && eventType.startsWith("TRANSFER_")) {
    let payoutId: string | null = null;
    const { data: payoutByProvider } = await admin
      .from("payouts")
      .select("id,status")
      .eq("provider", "asaas")
      .eq("provider_payout_id", providerTransferId)
      .maybeSingle();
    payoutId = payoutByProvider?.id ?? null;

    if (!payoutId) {
      const externalReference =
        typeof payload?.transfer?.externalReference === "string"
          ? payload.transfer.externalReference
          : typeof payload?.transfer?.external_reference === "string"
            ? payload.transfer.external_reference
            : null;
      const match = externalReference?.match(/^apois-payout-([0-9a-f-]{36})$/i);
      payoutId = match?.[1] ?? null;
    }

    if (!payoutId) {
      await admin
        .from("asaas_webhook_events")
        .update({ processing_error: "payout_not_ready" })
        .eq("id", eventRowId);
      return reply(503, { error: "payout_not_ready" });
    }

    if (eventType === "TRANSFER_DONE") {
      await admin.rpc("settle_payout", {
        _payout_id: payoutId,
        _new_status: "paid",
        _provider: "asaas",
        _provider_payout_id: providerTransferId,
        _failure_reason: null,
      });
    } else if (eventType === "TRANSFER_FAILED") {
      await admin.rpc("settle_payout", {
        _payout_id: payoutId,
        _new_status: "failed",
        _provider: "asaas",
        _provider_payout_id: providerTransferId,
        _failure_reason: String(payload?.transfer?.failReason || eventType),
      });
    } else if (eventType === "TRANSFER_CANCELLED") {
      await admin.rpc("settle_payout", {
        _payout_id: payoutId,
        _new_status: "cancelled",
        _provider: "asaas",
        _provider_payout_id: providerTransferId,
        _failure_reason: eventType,
      });
    } else {
      await admin.rpc("settle_payout", {
        _payout_id: payoutId,
        _new_status: "processing",
        _provider: "asaas",
        _provider_payout_id: providerTransferId,
        _failure_reason: eventType === "TRANSFER_BLOCKED" ? eventType : null,
      });
    }

    await admin
      .from("asaas_webhook_events")
      .update({ processed_at: now, processing_error: null })
      .eq("id", eventRowId);
    return reply(200, { accepted: true, processed: eventType, payoutId });
  }

  if (!providerPaymentId) {
    await admin.from("asaas_webhook_events").update({ processed_at: now }).eq("id", eventRowId);
    return reply(200, { accepted: true, ignored: true });
  }

  const { data: payment, error: lookupError } = await admin
    .from("payments")
    .select("id,order_id,status,amount")
    .eq("provider", "asaas")
    .eq("provider_charge_id", providerPaymentId)
    .maybeSingle();
  if (lookupError) return reply(500, { error: "payment_lookup_failed" });
  if (!payment) {
    await admin
      .from("asaas_webhook_events")
      .update({ processing_error: "payment_not_ready" })
      .eq("id", eventRowId);
    return reply(503, { error: "payment_not_ready" });
  }

  const providerValue = Number(payload?.payment?.value);
  if (
    Number.isFinite(providerValue) &&
    Math.round(providerValue * 100) !== Math.round(Number(payment.amount) * 100)
  ) {
    await admin
      .from("asaas_webhook_events")
      .update({ processing_error: "amount_mismatch" })
      .eq("id", eventRowId);
    return reply(409, { error: "amount_mismatch" });
  }

  const paidEvents = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
  const failedEvents = new Set([
    "PAYMENT_OVERDUE",
    "PAYMENT_DELETED",
    "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
  ]);
  const refundedEvents = new Set(["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED"]);

  const { data: existingPaymentEvent } = await admin
    .from("payment_events")
    .select("id")
    .eq("provider", "asaas")
    .eq("provider_event_id", eventId)
    .maybeSingle();
  if (!existingPaymentEvent) {
    await admin.from("payment_events").insert({
      provider: "asaas",
      provider_event_id: eventId,
      event_type: eventType,
      payment_id: payment.id,
      payload,
      status: "received",
    });
  }

  if (paidEvents.has(eventType)) {
    await admin
      .from("payments")
      .update({ status: "paid", paid_at: now, failed_at: null, failure_reason: null })
      .eq("id", payment.id)
      .neq("status", "refunded");
    const { data: order } = await admin
      .from("orders")
      .select("status")
      .eq("id", payment.order_id)
      .maybeSingle();
    if (order && !["cancelled", "refunded"].includes(order.status)) {
      await admin.from("orders").update({ payment_status: "paid" }).eq("id", payment.order_id);
    }
  } else if (refundedEvents.has(eventType)) {
    await admin.from("payments").update({ status: "refunded" }).eq("id", payment.id);
    await admin.from("orders").update({ payment_status: "refunded" }).eq("id", payment.order_id);
  } else if (failedEvents.has(eventType) && payment.status !== "paid") {
    await admin
      .from("payments")
      .update({ status: "failed", failed_at: now, failure_reason: eventType })
      .eq("id", payment.id)
      .in("status", ["pending", "processing"]);
    await admin
      .from("orders")
      .update({ payment_status: "failed" })
      .eq("id", payment.order_id)
      .neq("payment_status", "paid");
  }

  await admin
    .from("payment_events")
    .update({ status: "processed", processed_at: now })
    .eq("provider", "asaas")
    .eq("provider_event_id", eventId);
  await admin
    .from("asaas_webhook_events")
    .update({ processed_at: now, processing_error: null })
    .eq("id", eventRowId);
  return reply(200, { accepted: true, processed: eventType });
});
