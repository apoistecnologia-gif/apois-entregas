import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  ensureCustomerPushRegistration,
  isNativeCustomerAndroid,
  removeCustomerPushRegistration,
} from "@/lib/customer-push";

export function CustomerPushManager() {
  useEffect(() => {
    if (!isNativeCustomerAndroid()) return;
    let disposed = false;

    const register = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || disposed) return;
      const result = await ensureCustomerPushRegistration(true);
      if (disposed) return;
      if (result.status === "failed") {
        console.warn("customer push registration failed", result.message);
      }
    };

    void register();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (disposed) return;
      if (
        session &&
        (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")
      ) {
        void ensureCustomerPushRegistration(true).then((result) => {
          if (result.status === "failed") {
            console.warn("customer push registration failed", result.message);
          }
        });
      } else if (!session && event === "SIGNED_OUT") {
        void removeCustomerPushRegistration(false);
      }
    });

    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
