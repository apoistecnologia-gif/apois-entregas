import { Fragment, type ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BOUND_USER_KEY = "apois_bound_user_id";
const SENSITIVE_SESSION_KEYS = ["apois_active_pix", "apois_checkout_attempt"] as const;
const CART_STORAGE_KEYS = ["apois_cart", "apois_merchant"] as const;

function clearSensitiveCheckoutState() {
  for (const key of SENSITIVE_SESSION_KEYS) sessionStorage.removeItem(key);
}

function clearUserCartState() {
  for (const key of CART_STORAGE_KEYS) localStorage.removeItem(key);
}

/**
 * Keeps browser-persisted operational state scoped to the authenticated account.
 *
 * A tab can be reused after logout/login by another person. Without this boundary,
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
      const previousUserId = sessionStorage.getItem(BOUND_USER_KEY);

      if (!nextUserId) {
        clearSensitiveCheckoutState();
        if (previousUserId) clearUserCartState();
        sessionStorage.removeItem(BOUND_USER_KEY);
      } else {
        if (!previousUserId) {
          // Protect tabs created before this isolation marker existed. The active PIX
          // can be regenerated safely, while a guest cart may continue into login.
          clearSensitiveCheckoutState();
        } else if (previousUserId !== nextUserId) {
          clearSensitiveCheckoutState();
          clearUserCartState();
        }
        sessionStorage.setItem(BOUND_USER_KEY, nextUserId);
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
