import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  courierNextStatus,
  customerCanCancel,
  isTerminalOrderStatus,
  merchantNextStatuses,
  paymentAllowsFulfillment,
} from "./order-machine";
import {
  decideDispatchOutcome,
  payoutCorrelation,
  retryDelaySeconds,
} from "./mercadopago-payout-policy";

const readRepo = (relativePath: string) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

const mercadoPagoWebhook = readRepo("supabase/functions/mercadopago-webhook/index.ts");
const mercadoPagoPayout = readRepo("supabase/functions/mercadopago-payout/index.ts");
const openPixPayout = readRepo("supabase/functions/openpix-payout/index.ts");
const processRefund = readRepo("supabase/functions/process-refund/index.ts");
const syncPaymentStatus = readRepo("supabase/functions/sync-payment-status/index.ts");
const createOrder = readRepo("supabase/functions/create-order/index.ts");
const latePaidRefund = readRepo(
  "supabase/migrations/20260814133942_ensure_cancelled_paid_order_refund.sql",
);
const repairSettlement = readRepo(
  "supabase/migrations/20260814152000_repair_partial_delivered_order_settlement.sql",
);

describe("money + state-machine hardening", () => {
  test("rejects invalid/backward order transitions in the pure state machine", () => {
    expect(merchantNextStatuses("ready")).toEqual([]);
    expect(merchantNextStatuses("delivered")).toEqual([]);
    expect(merchantNextStatuses("cancelled")).toEqual([]);
    expect(courierNextStatus("arrived_destination")).toBeNull();
    expect(courierNextStatus("delivered")).toBeNull();
    expect(customerCanCancel("preparing")).toBe(false);
    expect(customerCanCancel("delivered")).toBe(false);
    expect(paymentAllowsFulfillment("refunded")).toBe(false);
    expect(isTerminalOrderStatus("refunded")).toBe(true);
  });

  test("retry policy is bounded and keeps one stable payout correlation", () => {
    expect(payoutCorrelation("payout-1")).toBe(payoutCorrelation("payout-1"));
    expect(retryDelaySeconds(0)).toBe(30);
    expect(retryDelaySeconds(20)).toBe(3600);
    expect(
      decideDispatchOutcome({ httpStatus: 500, hasProviderId: false, attemptsBeforeIncrement: 0 }),
    ).toEqual({ action: "retry", delaySeconds: 30 });
  });
});

describe("webhook idempotency and ordering contracts", () => {
  test("same provider event twice is deduplicated before financial mutation", () => {
    expect(mercadoPagoWebhook).toContain('.eq("provider_event_id", eventId)');
    expect(mercadoPagoWebhook).toContain("if (existingEvent) return response(200, { accepted: true, duplicate: true })");
    expect(mercadoPagoWebhook).toContain('eventError?.code === "23505"');
  });

  test("out-of-order provider states cannot regress refunded/paid state", () => {
    expect(mercadoPagoWebhook).toContain('.neq("status", "refunded")');
    expect(mercadoPagoWebhook).toContain('.in("status", ["pending", "processing"])');
    expect(mercadoPagoWebhook).toContain('.eq("status", "pending")');
    expect(mercadoPagoWebhook).toContain('!["cancelled", "refunded"].includes(internalOrder.status)');
  });

  test("financial state is reconciled from provider + authoritative database amount", () => {
    expect(mercadoPagoWebhook).toContain("const providerAmount = Number(providerOrder.total_amount)");
    expect(mercadoPagoWebhook).toContain("Math.round(Number(payment.amount) * 100)");
    expect(mercadoPagoWebhook).toContain('return response(409, { error: "amount_mismatch" })');
    expect(mercadoPagoWebhook).toContain('eventType = signatureValid');
    expect(mercadoPagoWebhook).toContain('"order.reconciled"');
  });
});

describe("late payment, refund and reconciliation", () => {
  test("approved payment after cancellation creates/reuses one refund", () => {
    expect(latePaidRefund).toContain("for update");
    expect(latePaidRefund).toContain("if v_order.status <> 'cancelled'");
    expect(latePaidRefund).toContain("if v_refund_id is not null then");
    expect(latePaidRefund).toContain("return v_refund_id");
    expect(latePaidRefund).toContain("Pagamento confirmado após cancelamento do pedido");
    expect(syncPaymentStatus).toContain('order.status !== "cancelled"');
    expect(syncPaymentStatus).toContain('"ensure_cancelled_paid_order_refund"');
    expect(syncPaymentStatus).toContain('code: "REFUND_RECONCILIATION_FAILED"');
  });

  test("refund is idempotent and verifies provider state before retrying", () => {
    expect(processRefund).toContain('if (refund.status === "completed")');
    expect(processRefund).toContain("reused: true");
    expect(processRefund).toContain('const idempotencyKey = `mercadopago:refund:${refund.id}:v2`');
    expect(processRefund).toContain('"X-Idempotency-Key": idempotencyKey');
    expect(processRefund).toContain("const verified = await readProviderOrder()");
    expect(processRefund).toContain('code: "REFUND_LOCAL_SYNC_FAILED"');
  });

  test("refund amount and owner are derived/verified server-side", () => {
    expect(processRefund).toContain("order.customer_user_id === authData.user.id");
    expect(processRefund).toContain("refund.requested_by === authData.user.id");
    expect(processRefund).toContain('code: "FORBIDDEN"');
    expect(processRefund).toContain("Math.round(Number(payment.amount) * 100)");
    expect(processRefund).toContain("Math.round(Number(refund.amount) * 100)");
    expect(processRefund).toContain('code: "REFUND_AMOUNT_CONFLICT"');
  });
});

describe("payout duplicate, concurrency and partial failure", () => {
  test("duplicate payout returns the existing provider settlement", () => {
    expect(mercadoPagoPayout).toContain('if (payout.status === "paid")');
    expect(mercadoPagoPayout).toContain("reused: true");
    expect(mercadoPagoPayout).toContain('const correlation = `apois-entrega-payout-${payoutId}`');
    expect(mercadoPagoPayout).toContain('"X-Idempotency-Key": correlation');
  });

  test("concurrent payout workers use an atomic compare-and-claim", () => {
    expect(mercadoPagoPayout).toContain("Atomic claim prevents two workers from dispatching the same payout");
    expect(mercadoPagoPayout).toContain('.eq("dispatch_attempts", attempts)');
    expect(mercadoPagoPayout).toContain('code: "PAYOUT_ALREADY_CLAIMED"');
  });

  test("provider uncertainty schedules retry instead of inventing paid state", () => {
    expect(mercadoPagoPayout).toContain('dispatch_last_error: "provider_timeout"');
    expect(mercadoPagoPayout).toContain("next_dispatch_at");
    expect(mercadoPagoPayout).toContain('code: "PAYOUT_PROVIDER_UNCERTAIN"');
    expect(mercadoPagoPayout).toContain('"Mercado Pago retry limit exhausted"');
  });

  test("OpenPix payout authorizes the actual merchant/courier wallet owner", () => {
    expect(openPixPayout).toContain('.eq("user_id", authData.user.id)');
    expect(openPixPayout).toContain("merchantOwner?.owner_user_id === authData.user.id");
    expect(openPixPayout).toContain("courierOwner?.user_id === authData.user.id");
    expect(openPixPayout).toContain('code: "FORBIDDEN"');
    expect(openPixPayout).toContain("const amount = Number(payout.amount)");
  });

  test("partial settlement can be repaired without duplicating ledger legs", () => {
    expect(repairSettlement).toContain("for update");
    expect(repairSettlement).toContain("A partially settled order must");
    expect(repairSettlement).toContain("order-merchant:");
    expect(repairSettlement).toContain("order-platform:");
    expect(repairSettlement).toContain("order-courier:");
    expect(repairSettlement).toContain("perform public.post_wallet_transaction");
  });
});

describe("frontend is never authoritative for money", () => {
  test("create-order only accepts identity/cart intent and reloads authoritative snapshot", () => {
    expect(createOrder).toContain("const merchantId = payload.merchantId");
    expect(createOrder).toContain("const paymentMethod = payload.paymentMethod");
    expect(createOrder).not.toContain("const total = payload.total");
    expect(createOrder).not.toContain("const paymentStatus = payload.paymentStatus");
    expect(createOrder).toContain('adminClient.rpc("create_order_for_checkout_intent_v2"');
    expect(createOrder).toContain("p_customer_user_id: userData.user.id");
    expect(createOrder).toContain('from("orders")');
    expect(createOrder).toContain("could not load authoritative snapshot");
  });
});
