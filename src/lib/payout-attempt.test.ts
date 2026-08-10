import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { clearPayoutAttemptKey, getPayoutAttemptKey } from "./payout-attempt";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const storage = new MemoryStorage();
const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: storage },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
    return;
  }

  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    configurable: true,
    writable: true,
  });
});

describe("payout attempt idempotency", () => {
  test("reuses the same key for the same payout fingerprint", () => {
    const first = getPayoutAttemptKey("courier", "wallet-1", 25);
    const second = getPayoutAttemptKey("courier", "wallet-1", 25);

    expect(second).toBe(first);
  });

  test("creates a new key when the amount changes", () => {
    const first = getPayoutAttemptKey("merchant", "wallet-1", 25);
    const second = getPayoutAttemptKey("merchant", "wallet-1", 30);

    expect(second).not.toBe(first);
  });

  test("keeps merchant and courier attempts isolated", () => {
    const merchant = getPayoutAttemptKey("merchant", "wallet-1", 25);
    const courier = getPayoutAttemptKey("courier", "wallet-1", 25);

    expect(courier).not.toBe(merchant);
  });

  test("clears only the matching successful attempt", () => {
    const first = getPayoutAttemptKey("courier", "wallet-1", 25);
    clearPayoutAttemptKey("courier", "wallet-1", "different-key");
    expect(getPayoutAttemptKey("courier", "wallet-1", 25)).toBe(first);

    clearPayoutAttemptKey("courier", "wallet-1", first);
    expect(getPayoutAttemptKey("courier", "wallet-1", 25)).not.toBe(first);
  });
});
