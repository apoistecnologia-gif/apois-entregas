const PAYOUT_ATTEMPT_PREFIX = "apois_payout_attempt_v1";

type PayoutScope = "merchant" | "courier";

type StoredPayoutAttempt = {
  fingerprint: string;
  key: string;
};

const storageKey = (scope: PayoutScope, walletId: string) =>
  `${PAYOUT_ATTEMPT_PREFIX}:${scope}:${walletId}`;

const fingerprintFor = (walletId: string, amount: number) => `${walletId}:${amount.toFixed(2)}`;

export const getPayoutAttemptKey = (scope: PayoutScope, walletId: string, amount: number) => {
  const fingerprint = fingerprintFor(walletId, amount);
  const keyName = storageKey(scope, walletId);

  try {
    const raw = window.localStorage.getItem(keyName);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredPayoutAttempt>;
      if (parsed.fingerprint === fingerprint && typeof parsed.key === "string" && parsed.key) {
        return parsed.key;
      }
    }
  } catch {
    // A falha do storage não pode impedir o saque; a chave ainda será única nesta tentativa.
  }

  const key = `${scope}:${walletId}:${crypto.randomUUID()}`;
  try {
    window.localStorage.setItem(keyName, JSON.stringify({ fingerprint, key }));
  } catch {
    // O backend continua protegendo a operação pela chave gerada nesta execução.
  }
  return key;
};

export const clearPayoutAttemptKey = (scope: PayoutScope, walletId: string, key: string) => {
  const keyName = storageKey(scope, walletId);
  try {
    const raw = window.localStorage.getItem(keyName);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<StoredPayoutAttempt>;
    if (parsed.key === key) window.localStorage.removeItem(keyName);
  } catch {
    window.localStorage.removeItem(keyName);
  }
};
