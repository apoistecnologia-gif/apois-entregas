import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  classifyMercadoPagoChargeId,
  getMercadoPagoChargeRoute,
  matchMercadoPagoProviderChargeId,
} from "./mercadopago-charge-id.ts";

const HOMOLOGATION_ORDER_ID = "ORDTST01M0X2BM6MWBS6V0AQWR9TVR9H";
const OFFICIAL_ORDER_ID = "ORD01J49MMW3SSBK5PSV3DFR32959";
const LEGACY_PAYMENT_ID = "12345678901234567890";

describe("Mercado Pago charge ID classification", () => {
  test("routes a numeric legacy ID to Payments API", () => {
    assert.equal(classifyMercadoPagoChargeId(LEGACY_PAYMENT_ID), "payments");
  });

  test("routes the observed homologation ID to Orders API", () => {
    assert.equal(classifyMercadoPagoChargeId(HOMOLOGATION_ORDER_ID), "orders");
  });

  test("routes an officially observed ORD ID to Orders API", () => {
    assert.equal(classifyMercadoPagoChargeId(OFFICIAL_ORDER_ID), "orders");
  });

  test("fails closed for unknown IDs instead of assuming Payments API", () => {
    assert.equal(classifyMercadoPagoChargeId("ordinary-string"), null);
    assert.equal(classifyMercadoPagoChargeId("ORD-not-a-supported-order-id"), null);
    assert.equal(classifyMercadoPagoChargeId("payment_123"), null);
    assert.equal(getMercadoPagoChargeRoute("ordinary-string"), null);
  });
});

describe("Mercado Pago charge ID preservation", () => {
  test("uses ILIKE for the database without changing the external ID", () => {
    const receivedId = "ordtst01M0X2BM6MWBS6V0AQWR9TVR9H";
    const calls: Array<{ column: string; pattern: string }> = [];
    const result = matchMercadoPagoProviderChargeId(
      {
        ilike(column, pattern) {
          calls.push({ column, pattern });
          return "query-result";
        },
      },
      receivedId,
    );
    const route = getMercadoPagoChargeRoute(receivedId);

    assert.equal(result, "query-result");
    assert.deepEqual(calls, [{ column: "provider_charge_id", pattern: receivedId }]);
    assert.equal(route?.chargeId, receivedId);
    assert.equal(route?.lookupUrl, `https://api.mercadopago.com/v1/orders/${receivedId}`);
  });
});

describe("Mercado Pago sync routing", () => {
  test("syncs an ORD ID through Orders API", () => {
    assert.equal(
      getMercadoPagoChargeRoute(OFFICIAL_ORDER_ID)?.lookupUrl,
      `https://api.mercadopago.com/v1/orders/${OFFICIAL_ORDER_ID}`,
    );
  });

  test("syncs a numeric ID through Payments API", () => {
    assert.equal(
      getMercadoPagoChargeRoute(LEGACY_PAYMENT_ID)?.lookupUrl,
      `https://api.mercadopago.com/v1/payments/${LEGACY_PAYMENT_ID}`,
    );
  });
});

describe("Mercado Pago refund routing", () => {
  test("refunds an ORD ID through Orders API", () => {
    assert.equal(
      getMercadoPagoChargeRoute(OFFICIAL_ORDER_ID)?.refundUrl,
      `https://api.mercadopago.com/v1/orders/${OFFICIAL_ORDER_ID}/refund`,
    );
  });

  test("refunds a numeric ID through Payments API", () => {
    assert.equal(
      getMercadoPagoChargeRoute(LEGACY_PAYMENT_ID)?.refundUrl,
      `https://api.mercadopago.com/v1/payments/${LEGACY_PAYMENT_ID}/refunds`,
    );
  });
});
