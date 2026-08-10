import { Fragment, type ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BOUND_USER_KEY = "apois_bound_user_id";
const CART_OWNER_KEY = "apois_cart_owner_id";
const SENSITIVE_SESSION_KEYS = ["apois_active_pix", "apois_checkout_attempt"] as const;
const CART_STORAGE_KEYS = ["apois_cart", "apois_merchant"] as const;

function clearSensitiveCheckoutState() {
  for (const key of SENSITIVE_SESSION_KEYS) sessionStorage.removeItem(key);
}

function clearUserCartState() {
  for (const key of CART_STORAGE_KEYS) localStorage.removeItem(key);
  localStorage.removeItem(CART_OWNER_KEY);
}

function hasPersistedCart() {
  return Boolean(localStorage.getItem("apois_cart") || localStorage.getItem("apois_merchant"));
}

/**
 * Keeps browser-persisted operational state scoped to the authenticated account.
 *
 * A tab or device browser can be reused by another person. Without this boundary,
 * sessionStorage could still contain the previous customer's PIX QR code and checkout
 * attempt, while localStorage could contain their cart. The application waits for the
 * current Supabase session before mounting route content, clears stale state when the
 * account changes, and remounts the route tree under the new identity.
 */
export function AuthSessionIsolation({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const bindIdentity = (nextUserId: string | null) => {
      const previousTabUserId = sessionStorage.getItem(BOUND_USER_KEY);
      const persistedCartOwnerId = localStorage.getItem(CART_OWNER_KEY);

      if (!nextUserId) {
        clearSensitiveCheckoutState();

        // This also protects a fresh browser session: sessionStorage may already have
        // expired, while an authenticated user's cart can still exist in localStorage.
        if (previousTabUserId || persistedCartOwnerId) clearUserCartState();
        sessionStorage.removeItem(BOUND_USER_KEY);
      } else {
        if (!previousTabUserId || previousTabUserId !== nextUserId) {
          clearSensitiveCheckoutState();
        }

        if (persistedCartOwnerId && persistedCartOwnerId !== nextUserId) {
          clearUserCartState();
        }

        sessionStorage.setItem(BOUND_USER_KEY, nextUserId);

        // A cart with no owner marker is treated as a genuine guest cart and may follow
        // the guest through login. From this point onward it is bound to this account.
        if (hasPersistedCart()) localStorage.setItem(CART_OWNER_KEY, nextUserId);
      }

      if (!disposed) {
        setUserId(nextUserId);
        setReady(true);
      }
    };

    void supabase.auth
      .getSession()
      .then(({ data }) => bindIdentity(data.session?.user.id ?? null))
      .catch(() => bindIdentity(null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      bindIdentity(session?.user.id ?? null);
    });

    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <div className="grid min-h-dvh w-full place-items-center bg-black" role="status">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="sr-only">Validando sessão</span>
      </div>
    );
  }

  return <Fragment key={userId ?? "anonymous"}>{children}</Fragment>;
}
