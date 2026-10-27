import { expect, test } from "bun:test";
import { merchantSubscriptionDateWarnings, paymentProviderBlockingOrders } from "./courier-operation-readiness";

test("Safe2Pay selected but disabled must not be shown as ready", () => {
  expect(paymentProviderBlockingOrders("safe2pay_marketplace", false)).toBe(true);
  expect(paymentProviderBlockingOrders("safe2pay_marketplace", null)).toBe(true);
  expect(paymentProviderBlockingOrders("safe2pay_marketplace", true)).toBe(false);
  expect(paymentProviderBlockingOrders("other", false)).toBe(false);
});

test("an old approved monthly payment is not a valid current subscription", () => {
  const merchants = [
    { id: "a", name: "Estabelecimento A", is_active: true, approval_status: "approved", delivery_enabled: true },
    { id: "b", name: "Estabelecimento B", is_active: true, approval_status: "approved", delivery_enabled: false },
    { id: "c", name: "Estabelecimento C", is_active: true, approval_status: "approved", delivery_enabled: true },
  ];
  const payments = [
    { merchant_id: "a", created_at: "2026-08-10T00:00:00Z", current_period_end: "2026-09-10T00:00:00Z", last_payment_status: "approved" },
    { merchant_id: "c", created_at: "2026-10-01T00:00:00Z", current_period_end: "2026-11-10T00:00:00Z", last_payment_status: "approved" },
  ];
  expect(merchantSubscriptionDateWarnings(merchants, payments, Date.parse("2026-10-27T12:00:00Z"))).toEqual(["Estabelecimento A"]);
});

test("unknown payment date must be shown as unresolved, never silently active", () => {
  const merchants = [{ id: "a", name: "A", is_active: true, approval_status: "approved", delivery_enabled: true }];
  expect(merchantSubscriptionDateWarnings(merchants, [{
    merchant_id: "a", created_at: "2026-10-20T00:00:00Z", current_period_end: null, last_payment_status: "approved",
  }])).toEqual(["A"]);
});
