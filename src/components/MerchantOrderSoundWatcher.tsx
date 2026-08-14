import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getApoisProductMode } from "@/lib/product-routing";
import { toast } from "sonner";
import { MerchantOrderControlCenter } from "./MerchantOrderControlCenter";
import { Toaster } from "./ui/sonner";

const ALERTED_STORAGE_KEY = "apois_merchant_alerted_paid_orders";
const RECONCILE_INTERVAL_MS = 3500;

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

type PendingAlert = { orderId: string; orderNumber: string };

function loadAlertedOrders() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ALERTED_STORAGE_KEY) ?? "[]");
    return new Set<string>(
      Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [],
    );
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
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const unlockAudioRef = useRef<(() => Promise<boolean>) | null>(null);
  const alertedOrdersRef = useRef<Set<string>>(loadAlertedOrders());
  const pendingAlertsRef = useRef<Map<string, PendingAlert>>(new Map());

  const playOrderAlert = async () => {
    const context = audioContextRef.current;
    if (!context || !audioUnlockedRef.current || document.visibilityState !== "visible")
      return false;
    try {
      if (context.state === "suspended") await context.resume();
      if (context.state !== "running") return false;

      const now = context.currentTime + 0.03;
      const master = context.createGain();
      master.gain.setValueAtTime(0.9, now);
      master.connect(context.destination);

      const strikeCount = 42;
      const strikeInterval = 0.078;

      for (let index = 0; index < strikeCount; index += 1) {
        const start = now + index * strikeInterval;
        const stop = start + 0.064;

        const bellA = context.createOscillator();
        const bellB = context.createOscillator();
        const hammer = context.createOscillator();
        const bellAGain = context.createGain();
        const bellBGain = context.createGain();
        const hammerGain = context.createGain();

        bellA.type = "square";
        bellB.type = "triangle";
        hammer.type = "square";
        bellA.frequency.setValueAtTime(1760, start);
        bellB.frequency.setValueAtTime(2260, start);
        hammer.frequency.setValueAtTime(980, start);

        bellAGain.gain.setValueAtTime(0.0001, start);
        bellAGain.gain.exponentialRampToValueAtTime(0.32, start + 0.004);
        bellAGain.gain.exponentialRampToValueAtTime(0.0001, stop);

        bellBGain.gain.setValueAtTime(0.0001, start);
        bellBGain.gain.exponentialRampToValueAtTime(0.24, start + 0.003);
        bellBGain.gain.exponentialRampToValueAtTime(0.0001, stop);

        hammerGain.gain.setValueAtTime(0.0001, start);
        hammerGain.gain.exponentialRampToValueAtTime(0.2, start + 0.002);
        hammerGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.026);

        bellA.connect(bellAGain);
        bellB.connect(bellBGain);
        hammer.connect(hammerGain);
        bellAGain.connect(master);
        bellBGain.connect(master);
        hammerGain.connect(master);

        bellA.start(start);
        bellB.start(start);
        hammer.start(start);
        bellA.stop(stop + 0.01);
        bellB.stop(stop + 0.01);
        hammer.stop(start + 0.03);
      }

      master.gain.setValueAtTime(0.9, now + strikeCount * strikeInterval);
      master.gain.exponentialRampToValueAtTime(0.0001, now + strikeCount * strikeInterval + 0.08);
      return true;
    } catch {
      audioUnlockedRef.current = false;
      setAudioUnlocked(false);
      return false;
    }
  };

  const flushPending = async () => {
    if (!audioUnlockedRef.current || document.visibilityState !== "visible") return;
    for (const [orderId] of Array.from(pendingAlertsRef.current.entries())) {
      if (alertedOrdersRef.current.has(orderId)) {
        pendingAlertsRef.current.delete(orderId);
        continue;
      }
      const played = await playOrderAlert();
      if (!played) return;
      pendingAlertsRef.current.delete(orderId);
      alertedOrdersRef.current.add(orderId);
      persistAlertedOrders(alertedOrdersRef.current);
    }
  };

  const discardDeferredAlerts = () => {
    for (const orderId of pendingAlertsRef.current.keys()) {
      alertedOrdersRef.current.add(orderId);
    }
    pendingAlertsRef.current.clear();
    persistAlertedOrders(alertedOrdersRef.current);
  };

  const queuePaidOrder = (orderId: string, orderNumber: string) => {
    if (alertedOrdersRef.current.has(orderId) || pendingAlertsRef.current.has(orderId)) return;
    pendingAlertsRef.current.set(orderId, { orderId, orderNumber });
    const label = orderNumber ? ` #${orderNumber}` : "";
    toast.success(`Novo pedido pago${label}!`, {
      description: "O pedido já pode ser atendido pelo estabelecimento.",
      duration: 12_000,
    });
    void flushPending();
  };

  useEffect(() => {
    if (!enabled) return;

    const unlockAudio = async () => {
      const AudioContextCtor =
        window.AudioContext ?? (window as AudioWindow).webkitAudioContext ?? null;
      if (!AudioContextCtor) return false;
      try {
        const context = audioContextRef.current ?? new AudioContextCtor();
        audioContextRef.current = context;
        if (context.state === "suspended") await context.resume();
        if (context.state !== "running") return false;

        const oscillator = context.createOscillator();
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.00001, context.currentTime);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.01);
        audioUnlockedRef.current = true;
        setAudioUnlocked(true);
        return true;
      } catch {
        audioUnlockedRef.current = false;
        setAudioUnlocked(false);
        return false;
      }
    };

    unlockAudioRef.current = unlockAudio;
    const onBackgroundGesture = (event: PointerEvent | KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("button,a,input,select,textarea,[role='button']")
      ) {
        return;
      }
      void unlockAudio();
    };
    window.addEventListener("pointerdown", onBackgroundGesture, { capture: true });
    window.addEventListener("keydown", onBackgroundGesture, { capture: true });
    return () => {
      unlockAudioRef.current = null;
      window.removeEventListener("pointerdown", onBackgroundGesture, { capture: true });
      window.removeEventListener("keydown", onBackgroundGesture, { capture: true });
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
    const startedAt = new Date().toISOString();
    let disposed = false;

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
          const orderId = typeof next?.["id"] === "string" ? next["id"] : null;
          const paymentStatus = String(next?.["payment_status"] ?? "").toLowerCase();
          const previousPaymentStatus = String(previous?.["payment_status"] ?? "").toLowerCase();
          const status = String(next?.["status"] ?? "").toLowerCase();
          if (
            !orderId ||
            paymentStatus !== "paid" ||
            previousPaymentStatus === "paid" ||
            status !== "confirmed"
          )
            return;
          queuePaidOrder(orderId, next?.["order_number"] ? String(next["order_number"]) : "");
        },
      )
      .subscribe();

    const reconcile = async () => {
      const { data, error } = await supabase
        .from("orders" as any)
        .select("id,order_number,payment_status,status,created_at")
        .eq("merchant_id", merchantId)
        .eq("payment_status", "paid")
        .eq("status", "confirmed")
        .gte("created_at", startedAt)
        .order("created_at", { ascending: true })
        .limit(30);
      if (disposed || error || !Array.isArray(data)) return;
      data.forEach((order) => {
        if (typeof order?.id === "string") {
          queuePaidOrder(order.id, order?.order_number ? String(order.order_number) : "");
        }
      });
    };

    const interval = window.setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
    void reconcile();
    return () => {
      disposed = true;
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [enabled, merchantId]);

  useEffect(
    () => () => {
      if (audioContextRef.current) void audioContextRef.current.close();
    },
    [],
  );

  if (!enabled) return null;
  return (
    <>
      <Toaster position="top-center" richColors closeButton />
      <MerchantOrderControlCenter />
      <button
        type="button"
        onClick={() => {
          const unlock = unlockAudioRef.current;
          if (!unlock) {
            toast.error("O controle de áudio ainda não está disponível.");
            return;
          }
          void unlock().then(async (unlocked) => {
            if (!unlocked) {
              toast.error("O navegador bloqueou o áudio. Verifique o volume e a permissão de som.");
              return;
            }
            discardDeferredAlerts();
            const played = await playOrderAlert();
            if (played) toast.success("Som do novo pedido funcionando.");
            else toast.error("Não foi possível reproduzir o som neste dispositivo.");
          });
        }}
        className="fixed bottom-5 right-5 z-[1000] rounded-full bg-[#FFD700] px-4 py-3 text-sm font-black text-black shadow-2xl"
      >
        {audioUnlocked ? "Testar som" : "Ativar som"}
      </button>
    </>
  );
}

export { MerchantOrderSoundWatcher };
