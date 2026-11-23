/** Read-only admin diagnostics. This does not authorize payments,
 * grant subscriptions or change operational settings. */
export type MerchantReadiness = {
  id: string;
  name: string;
  is_active: boolean;
  approval_status: string | null;
  delivery_enabled: boolean;
};

export type MerchantSubscriptionReadiness = {
  merchant_id: string;
  current_period_end: string | null;
  last_payment_status: string | null;
  created_at: string;
};

export function merchantSubscriptionDateWarnings(
  merchants: MerchantReadiness[],
  subscriptions: MerchantSubscriptionReadiness[],
  now = Date.now(),
): string[] {
  const latest = new Map<string, MerchantSubscriptionReadiness>();
  for (const subscription of [...subscriptions].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )) {
    if (!latest.has(subscription.merchant_id)) latest.set(subscription.merchant_id, subscription);
  }
  return merchants
    .filter(
      (merchant) =>
        merchant.is_active && merchant.approval_status === "approved" && merchant.delivery_enabled,
    )
    .filter((merchant) => {
      const subscription = latest.get(merchant.id);
      return (
        !subscription ||
        !subscription.current_period_end ||
        !Number.isFinite(Date.parse(subscription.current_period_end)) ||
        Date.parse(subscription.current_period_end) <= now ||
        subscription.last_payment_status !== "approved"
      );
    })
    .map((merchant) => merchant.name);
}

export function paymentProviderBlockingOrders(
  provider: string | null,
  enabled: boolean | null,
): boolean {
  // False is meaningful only when Safe2Pay is the selected provider. Never
  // claim other gateways are ready without checking their own configuration.
  return provider === "safe2pay_marketplace" && enabled !== true;
}
