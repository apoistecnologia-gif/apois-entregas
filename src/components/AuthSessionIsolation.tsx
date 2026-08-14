import { Fragment, type ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getApoisProductMode,
  getProductLandingRoute,
  isPathAllowedForProduct,
} from "@/lib/product-routing";

const CART_OWNER_KEY = "apois_cart_owner_id";
const CHECKOUT_OWNER_KEY = "apois_checkout_owner_id";
const SENSITIVE_SESSION_KEYS = ["apois_active_pix", "apois_checkout_attempt"] as const;
const CART_STORAGE_KEYS = ["apois_cart", "apois_merchant"] as const;
const CHECKOUT_BACKUP_PREFIX = "apois_persisted_";

function backupKey(key: (typeof SENSITIVE_SESSION_KEYS)[number]) {
  return `${CHECKOUT_BACKUP_PREFIX}${key}`;
}

function clearCheckoutSessionOnly() {
  for (const key of SENSITIVE_SESSION_KEYS) sessionStorage.removeItem(key);
}

function clearSensitiveCheckoutState() {
  clearCheckoutSessionOnly();
  for (const key of SENSITIVE_SESSION_KEYS) localStorage.removeItem(backupKey(key));
  localStorage.removeItem(CHECKOUT_OWNER_KEY);
}

function restoreSensitiveCheckoutState(userId: string) {
  const ownerId = localStorage.getItem(CHECKOUT_OWNER_KEY);
  if (!ownerId) return;
  if (ownerId !== userId) {
    clearSensitiveCheckoutState();
    return;
  }

  for (const key of SENSITIVE_SESSION_KEYS) {
    const persisted = localStorage.getItem(backupKey(key));
    if (persisted && !sessionStorage.getItem(key)) sessionStorage.setItem(key, persisted);
  }
}

function persistSensitiveCheckoutState(userId: string) {
  let hasState = false;
  for (const key of SENSITIVE_SESSION_KEYS) {
    const value = sessionStorage.getItem(key);
    if (value) {
      localStorage.setItem(backupKey(key), value);
      hasState = true;
    } else {
      localStorage.removeItem(backupKey(key));
    }
  }

  if (hasState) localStorage.setItem(CHECKOUT_OWNER_KEY, userId);
  else localStorage.removeItem(CHECKOUT_OWNER_KEY);
}

function clearUserCartState() {
  for (const key of CART_STORAGE_KEYS) localStorage.removeItem(key);
  localStorage.removeItem(CART_OWNER_KEY);
}

function hasPersistedCart() {
  return Boolean(localStorage.getItem("apois_cart") || localStorage.getItem("apois_merchant"));
}

/**
 * Keeps browser-persisted operational state scoped to both the authenticated account
 * and the independently shipped APOIS product.
 *
 * This is intentionally defensive for native WebViews: an upgraded APK can inherit
 * storage and the last URL from an older build. A courier build must never mount a
 * customer route or reuse customer checkout/cart state, even before auth finishes.
 */
export function AuthSessionIsolation({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const product = getApoisProductMode();
    const boundUserKey = `apois:${product}:bound_user_id`;
    const currentPath = window.location.pathname || "/";

    if (!isPathAllowedForProduct(currentPath, product)) {
      window.location.replace(getProductLandingRoute(product));
      return () => {
        disposed = true;
      };
    }

    // Customer cart/checkout state has no meaning in the courier, merchant or admin
    // products. Clear legacy unscoped keys on startup so an APK upgrade cannot leak
    // a previously rendered customer experience into another product.
    if (product !== "customer") {
      clearSensitiveCheckoutState();
      clearUserCartState();
    }

    const bindIdentity = (nextUserId: string | null) => {
      const previousTabUserId = sessionStorage.getItem(boundUserKey);
      const persistedCartOwnerId = localStorage.getItem(CART_OWNER_KEY);

      if (!nextUserId) {
        clearSensitiveCheckoutState();

        if (product === "customer" && (previousTabUserId || persistedCartOwnerId)) {
          clearUserCartState();
        }
        sessionStorage.removeItem(boundUserKey);
      } else {
        if (previousTabUserId && previousTabUserId !== nextUserId) {
          clearSensitiveCheckoutState();
        } else if (product === "customer") {
          restoreSensitiveCheckoutState(nextUserId);
        }

        if (product === "customer" && persistedCartOwnerId && persistedCartOwnerId !== nextUserId) {
          clearUserCartState();
        }

        sessionStorage.setItem(boundUserKey, nextUserId);

        if (product === "customer" && hasPersistedCart()) {
          localStorage.setItem(CART_OWNER_KEY, nextUserId);
        }
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

  useEffect(() => {
    if (getApoisProductMode() !== "customer" || !userId) return;

    const persist = () => persistSensitiveCheckoutState(userId);
    persist();
    const interval = window.setInterval(persist, 750);
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", persist);

    return () => {
      persist();
      window.clearInterval(interval);
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", persist);
    };
  }, [userId]);

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
