export const MAX_MERCADO_PAGO_PAYOUT_ATTEMPTS = 8;

export function payoutCorrelation(payoutId: string) {
  return `apois-entrega-payout-${payoutId}`;
}

export function retryDelaySeconds(attempt: number) {
  return Math.min(3600, 2 ** Math.max(0, attempt) * 30);
}

export function isRetryableProviderStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function shouldFinalizeAfterAttempt(attempt: number) {
  return attempt >= MAX_MERCADO_PAGO_PAYOUT_ATTEMPTS;
}

export function mapProviderStatus(
  status: string | null | undefined,
): "paid" | "processing" | "failed" {
  const normalized = (status ?? "").trim().toLowerCase();
  if (["paid", "processed", "confirmed", "completed"].includes(normalized)) return "paid";
  if (["failed", "rejected", "cancelled", "canceled", "denied"].includes(normalized))
    return "failed";
  return "processing";
}

export type PayoutDispatchOutcome =
  | { action: "proceed" }
  | { action: "reject"; reason: string }
  | { action: "exhausted"; reason: string }
  | { action: "retry"; delaySeconds: number };

/**
 * Single source of truth for what a dispatch attempt should do next, given the
 * provider's HTTP response. httpStatus 0 means no response was received at all
 * (network error/timeout). Kept separate from mapProviderStatus, which only
 * applies once this returns { action: "proceed" }.
 */
export function decideDispatchOutcome(params: {
  httpStatus: number;
  hasProviderId: boolean;
  attemptsBeforeIncrement: number;
}): PayoutDispatchOutcome {
  const { httpStatus, hasProviderId, attemptsBeforeIncrement } = params;
  const attemptsAfterIncrement = attemptsBeforeIncrement + 1;

  if (httpStatus >= 200 && httpStatus < 300 && hasProviderId) return { action: "proceed" };

  const permanentReject =
    httpStatus >= 400 && httpStatus < 500 && !isRetryableProviderStatus(httpStatus);
  if (permanentReject) return { action: "reject", reason: `Mercado Pago HTTP ${httpStatus}` };

  if (shouldFinalizeAfterAttempt(attemptsAfterIncrement)) {
    return {
      action: "exhausted",
      reason:
        httpStatus === 0
          ? "Mercado Pago provider timeout — retry limit exhausted"
          : `Mercado Pago retry limit exhausted (last HTTP ${httpStatus})`,
    };
  }
  return { action: "retry", delaySeconds: retryDelaySeconds(attemptsBeforeIncrement) };
}
