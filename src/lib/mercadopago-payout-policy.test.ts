import { describe, expect, test } from "bun:test";
import {
  decideDispatchOutcome,
  mapProviderStatus,
  MAX_MERCADO_PAGO_PAYOUT_ATTEMPTS,
  payoutCorrelation,
  retryDelaySeconds,
  shouldFinalizeAfterAttempt,
  isRetryableProviderStatus,
} from "./mercadopago-payout-policy";

describe("Mercado Pago payout dispatch policy", () => {
  test("builds a stable idempotency/correlation key", () => {
    expect(payoutCorrelation("payout-1")).toBe("apois-entrega-payout-payout-1");
    expect(payoutCorrelation("payout-1")).toBe(payoutCorrelation("payout-1"));
  });
  test("uses bounded exponential retry backoff", () => {
    expect(retryDelaySeconds(0)).toBe(30);
    expect(retryDelaySeconds(3)).toBe(240);
    expect(retryDelaySeconds(20)).toBe(3600);
  });
  test("classifies timeout, throttling and 5xx as retryable", () => {
    expect(isRetryableProviderStatus(408)).toBe(true);
    expect(isRetryableProviderStatus(429)).toBe(true);
    expect(isRetryableProviderStatus(500)).toBe(true);
    expect(isRetryableProviderStatus(400)).toBe(false);
  });
  test("stops after the attempt limit", () => {
    expect(shouldFinalizeAfterAttempt(7)).toBe(false);
    expect(shouldFinalizeAfterAttempt(8)).toBe(true);
  });
  test("maps provider results to the existing settlement states", () => {
    expect(mapProviderStatus("processed")).toBe("paid");
    expect(mapProviderStatus("failed")).toBe("failed");
    expect(mapProviderStatus("transaction_in_process")).toBe("processing");
  });

  describe("decideDispatchOutcome", () => {
    test("proceeds on a clean 2xx response carrying a provider id", () => {
      const outcome = decideDispatchOutcome({
        httpStatus: 200,
        hasProviderId: true,
        attemptsBeforeIncrement: 0,
      });
      expect(outcome).toEqual({ action: "proceed" });
    });

    test("rejects permanently on a non-retryable 4xx (bad request)", () => {
      const outcome = decideDispatchOutcome({
        httpStatus: 400,
        hasProviderId: false,
        attemptsBeforeIncrement: 0,
      });
      expect(outcome).toEqual({ action: "reject", reason: "Mercado Pago HTTP 400" });
    });

    test("rejects permanently on 401 unauthorized", () => {
      const outcome = decideDispatchOutcome({
        httpStatus: 401,
        hasProviderId: false,
        attemptsBeforeIncrement: 0,
      });
      expect(outcome.action).toBe("reject");
    });

    test("rejects permanently on 403 forbidden (product not enabled)", () => {
      const outcome = decideDispatchOutcome({
        httpStatus: 403,
        hasProviderId: false,
        attemptsBeforeIncrement: 0,
      });
      expect(outcome.action).toBe("reject");
    });

    test("rejects permanently when the transaction intent does not exist (404)", () => {
      const outcome = decideDispatchOutcome({
        httpStatus: 404,
        hasProviderId: false,
        attemptsBeforeIncrement: 0,
      });
      expect(outcome.action).toBe("reject");
    });

    test("retries instead of rejecting on 429 (rate limited)", () => {
      const outcome = decideDispatchOutcome({
        httpStatus: 429,
        hasProviderId: false,
        attemptsBeforeIncrement: 2,
      });
      expect(outcome).toEqual({ action: "retry", delaySeconds: retryDelaySeconds(2) });
    });

    test("retries on 500 (server error)", () => {
      const outcome = decideDispatchOutcome({
        httpStatus: 500,
        hasProviderId: false,
        attemptsBeforeIncrement: 0,
      });
      expect(outcome).toEqual({ action: "retry", delaySeconds: retryDelaySeconds(0) });
    });

    test("retries on a network failure/timeout (httpStatus 0)", () => {
      const outcome = decideDispatchOutcome({
        httpStatus: 0,
        hasProviderId: false,
        attemptsBeforeIncrement: 1,
      });
      expect(outcome).toEqual({ action: "retry", delaySeconds: retryDelaySeconds(1) });
    });

    test("retries on a 2xx response missing a provider id (out-of-order/incomplete response)", () => {
      const outcome = decideDispatchOutcome({
        httpStatus: 200,
        hasProviderId: false,
        attemptsBeforeIncrement: 0,
      });
      expect(outcome.action).toBe("retry");
    });

    test("stops retrying once the attempt limit is reached on a retryable status", () => {
      const outcome = decideDispatchOutcome({
        httpStatus: 500,
        hasProviderId: false,
        attemptsBeforeIncrement: MAX_MERCADO_PAGO_PAYOUT_ATTEMPTS - 1,
      });
      expect(outcome.action).toBe("exhausted");
    });

    test("stops retrying once the attempt limit is reached on repeated timeouts", () => {
      const outcome = decideDispatchOutcome({
        httpStatus: 0,
        hasProviderId: false,
        attemptsBeforeIncrement: MAX_MERCADO_PAGO_PAYOUT_ATTEMPTS - 1,
      });
      expect(outcome).toEqual({
        action: "exhausted",
        reason: "Mercado Pago provider timeout — retry limit exhausted",
      });
    });
  });
});
