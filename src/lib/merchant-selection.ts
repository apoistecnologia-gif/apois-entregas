/**
 * Shared merchant selection for accounts that belong to multiple establishments.
 * The selected ID is only a preference: every consumer must still load an ACTIVE
 * membership from Supabase before using that merchant.
 */
export const MERCHANT_SELECTION_EVENT = "apois:merchant-selection-changed";
const MERCHANT_SELECTION_STORAGE_PREFIX = "apois:selected-merchant:v1:";

export type MerchantMembershipCandidate = {
  merchant_id: string;
  role?: string | null;
  status?: string | null;
  created_at?: string | null;
};

function selectionStorageKey(userId: string) {
  return `${MERCHANT_SELECTION_STORAGE_PREFIX}${userId}`;
}

export function getSelectedMerchantMembership<T extends MerchantMembershipCandidate>(
  userId: string,
  memberships: T[],
): T | null {
  const active = memberships.filter(
    (member) => typeof member.merchant_id === "string" && member.merchant_id.length > 0 &&
      (!member.status || member.status === "active"),
  );
  if (active.length === 0) return null;

  let preferredId: string | null = null;
  if (typeof window !== "undefined" && userId) {
    try {
      preferredId = window.localStorage.getItem(selectionStorageKey(userId));
    } catch {
      // Private browsing and embedded WebViews can disable storage.
    }
  }

  // Never trust the cached ID unless the signed-in user still has access.
  return active.find((member) => member.merchant_id === preferredId)
    ?? active.find((member) => member.role === "owner")
    ?? active[0];
}

export function setSelectedMerchantMembership(
  userId: string,
  merchantId: string,
) {
  if (!userId || !merchantId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(selectionStorageKey(userId), merchantId);
  } catch {
    // This session still switches via the event even if persistence is blocked.
  }
  window.dispatchEvent(
    new CustomEvent(MERCHANT_SELECTION_EVENT, {
      detail: { userId, merchantId },
    }),
  );
}

export function isMerchantSelectionStorageEvent(
  event: StorageEvent,
  userId: string,
) {
  return Boolean(userId && event.key === selectionStorageKey(userId));
}
