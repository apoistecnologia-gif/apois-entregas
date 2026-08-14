import { useEffect, useRef } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getApoisProductMode } from "@/lib/product-routing";

const from = (table: string) => (supabase.from as any)(table);

export function CourierPendingPayoutProcessor() {
  const processingRef = useRef(false);

  useEffect(() => {
    if (getApoisProductMode() !== "courier") return;

    let disposed = false;

    const processPendingPayout = async () => {
      if (processingRef.current || disposed || document.visibilityState === "hidden") return;
      processingRef.current = true;

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user || disposed) return;

        const { data: courier, error: courierError } = await from("couriers")
          .select("id,status,is_active")
          .eq("user_id", user.id)
          .maybeSingle();
        if (
          courierError ||
          !courier ||
          courier.status !== "approved" ||
          courier.is_active !== true ||
          disposed
        )
          return;

        const { data: wallet, error: walletError } = await from("wallets")
          .select("id")
          .eq("courier_id", courier.id)
          .maybeSingle();
        if (walletError || !wallet || disposed) return;

        const { data: payout, error: payoutError } = await from("payouts")
          .select("id,status")
          .eq("wallet_id", wallet.id)
          .in("status", ["pending", "processing"])
          .order("requested_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (payoutError || !payout || disposed) return;

        const { error: providerError } = await supabase.functions.invoke("openpix-payout", {
          body: { payoutId: payout.id },
        });
        if (providerError) {
          console.warn("courier payout reconciliation pending", providerError.message);
        }
      } catch (error) {
        console.warn(
          "courier payout processor unavailable",
          error instanceof Error ? error.message : "unknown",
        );
      } finally {
        processingRef.current = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void processPendingPayout();
    };

    void processPendingPayout();
    const interval = window.setInterval(() => void processPendingPayout(), 10_000);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      processingRef.current = false;
    };
  }, []);

  return null;
}
