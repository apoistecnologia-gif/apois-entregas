export type MercadoPagoChargeApi = "orders" | "payments";

export type MercadoPagoChargeRoute = {
  api: MercadoPagoChargeApi;
  chargeId: string;
  lookupUrl: string;
  refundUrl: string;
};

const MERCADO_PAGO_API_BASE = "https://api.mercadopago.com";

// Mercado Pago does not publish a stable regex contract for Order IDs. Keep the
// allowlist limited to the two families observed in the official API examples and
// in this project's homologation: ORD01 + 24 chars and ORDTST01 + 24 chars.
const OBSERVED_ORDER_ID = /^(?:ORD01|ORDTST01)[0-9A-Z]{24}$/i;
const LEGACY_PAYMENT_ID = /^[0-9]+$/;

export function classifyMercadoPagoChargeId(chargeId: string): MercadoPagoChargeApi | null {
  if (LEGACY_PAYMENT_ID.test(chargeId)) return "payments";
  if (OBSERVED_ORDER_ID.test(chargeId)) return "orders";
  return null;
}

export function getMercadoPagoChargeRoute(chargeId: string): MercadoPagoChargeRoute | null {
  const api = classifyMercadoPagoChargeId(chargeId);
  if (!api) return null;

  const encodedChargeId = encodeURIComponent(chargeId);
  if (api === "orders") {
    return {
      api,
      chargeId,
      lookupUrl: `${MERCADO_PAGO_API_BASE}/v1/orders/${encodedChargeId}`,
      refundUrl: `${MERCADO_PAGO_API_BASE}/v1/orders/${encodedChargeId}/refund`,
    };
  }

  return {
    api,
    chargeId,
    lookupUrl: `${MERCADO_PAGO_API_BASE}/v1/payments/${encodedChargeId}`,
    refundUrl: `${MERCADO_PAGO_API_BASE}/v1/payments/${encodedChargeId}/refunds`,
  };
}

type CaseInsensitiveQuery<T> = {
  ilike(column: string, pattern: string): T;
};

export function matchMercadoPagoProviderChargeId<T>(
  query: CaseInsensitiveQuery<T>,
  chargeId: string,
): T {
  return query.ilike("provider_charge_id", chargeId);
}
