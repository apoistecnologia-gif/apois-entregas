import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getApoisProductMode } from "@/lib/product-routing";
import { toast } from "sonner";

const ALERTED_STORAGE_KEY = "apois_merchant_alerted_paid_orders";

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

function loadAlertedOrders() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ALERTED_STORAGE_KEY) ?? "[]");
    return new Set<string>(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function persistAlertedOrders(ids: Set<string>) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ALERTED_STORAGE_KEY, JSON.stringify(Array.from(ids).slice(-100)));
}

function MerchantOrderSoundWatcher() {
  const enabled = getApoisProductMode() === "merchant";
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const alertedOrdersRef = useRef<Set<string>>(loadAlertedOrders());

  useEffect(() => {
    if (!enabled) return;

    const unlockAudio = async () => {
      if (audioUnlockedRef.current) return;
      const AudioContextCtor =
        window.AudioContext ?? (window as AudioWindow).webkitAudioContext ?? null;
      if (!AudioContextCtor) return;

      try {
        const context = audioContextRef.current ?? new AudioContextCtor();
        audioContextRef.current = context;
        if (context.state === "suspended") await context.resume();

        const oscillator = context.createOscillator();
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.00001, context.currentTime);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.01);
        audioUnlockedRef.current = context.state === "running";
      } catch {
        audioUnlockedRef.current = false;
      }
    };

    window.addEventListener("pointerdown", unlockAudio, { capture: true });
    window.addEventListener("keydown", unlockAudio, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio, { capture: true });
      window.removeEventListener("keydown", unlockAudio, { capture: true });
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    const resolveMerchant = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || disposed) return;

      const { data } = await supabase
        .from("merchant_members" as any)
        .select("merchant_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!disposed) setMerchantId(typeof data?.merchant_id === "string" ? data.merchant_id : null);
    };

    void resolveMerchant();
    const { data: listener } = supabase.auth.onAuthStateChange(() => void resolveMerchant());
    return () => {
      disposed = true;
      listener.subscription.unsubscribe();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !merchantId) return;

    const playOrderAlert = async () => {
      const context = audioContextRef.current;
      if (!context || !audioUnlockedRef.current) return false;
      try {
        if (context.state === "suspended") await context.resume();
        if (context.state !== "running") return false;

        const now = context.currentTime;
        const notes = [784, 988, 1175, 988, 1175, 1319];
        notes.forEach((frequency, index) => {
          const start = now + index * 0.18;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.32, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(start);
          oscillator.stop(start + 0.16);
        });
        return true;
      } catch {
        return false;
      }
    };

    const channel = supabase
      .channel(`merchant_paid_order_alert_${merchantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `merchant_id=eq.${merchantId}`,
        },
        (payload) => {
          const next = payload.new as Record<string, unknown> | null;
          const previous = payload.old as Record<string, unknown> | null;
          const orderId = typeof next?.id === "string" ? next.id : null;
          const paymentStatus = String(next?.payment_status ?? "").toLowerCase();
          const previousPaymentStatus = String(previous?.payment_status ?? "").toLowerCase();

          if (!orderId || paymentStatus !== "paid" || previousPaymentStatus === "paid") return;
          if (alertedOrdersRef.current.has(orderId)) return;

          alertedOrdersRef.current.add(orderId);
          persistAlertedOrders(alertedOrdersRef.current);

          const orderNumber = next?.order_number ? ` #${String(next.order_number)}` : "";
          toast.success(`Novo pedido pago${orderNumber}!`, {
            description: "O pedido já pode ser atendido pelo estabelecimento.",
            duration: 12_000,
          });

          void playOrderAlert().then((played) => {
            if (!played) {
              toast.info("Novo pedido recebido — toque no painel para ativar os alertas sonoros.", {
                duration: 12_000,
              });
            }
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, merchantId]);

  useEffect(
    () => () => {
      if (audioContextRef.current) void audioContextRef.current.close();
    },
    [],
  );

  return null;
}

export { MerchantOrderSoundWatcher };
