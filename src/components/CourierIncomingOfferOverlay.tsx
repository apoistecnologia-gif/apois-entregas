import { Loader2, MapPin, Store, Truck, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getApoisProductMode } from "@/lib/product-routing";

type IncomingOffer = {
  id: string;
  delivery_job_id: string;
  courier_id: string;
  status: string;
  offered_at: string;
  expires_at: string;
  delivery_jobs: {
    id: string;
    merchant_id: string;
    pickup_address: Record<string, unknown> | null;
    delivery_address: Record<string, unknown> | null;
    estimated_distance_meters: number | string | null;
    estimated_earnings: number | string | null;
    status: string;
  } | null;
};

const from = (table: string) => (supabase.from as any)(table);
const rpc = (name: string, args?: Record<string, unknown>) =>
  (supabase.rpc as any)(name, args ?? {});

function money(value: unknown) {
  return `R$ ${Number(value ?? 0).toFixed(2).replace(".", ",")}`;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function CourierIncomingOfferOverlay() {
  const enabled = getApoisProductMode() === "courier";
  const [courierId, setCourierId] = useState<string | null>(null);
  const [offer, setOffer] = useState<IncomingOffer | null>(null);
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [now, setNow] = useState(Date.now());
  const alertedOfferRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);

  const loadOffer = useCallback(async (id: string) => {
    const currentIso = new Date().toISOString();
    const { data: offerRow, error: offerError } = await from("delivery_offers")
      .select("id,delivery_job_id,courier_id,status,offered_at,expires_at")
      .eq("courier_id", id)
      .eq("status", "offered")
      .gt("expires_at", currentIso)
      .order("offered_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (offerError) {
      console.warn("courier incoming offer load failed", offerError.message);
      return;
    }

    if (!offerRow) {
      setOffer(null);
      return;
    }

    const { data: jobRow, error: jobError } = await from("delivery_jobs")
      .select(
        "id,merchant_id,pickup_address,delivery_address,estimated_distance_meters,estimated_earnings,status",
      )
      .eq("id", offerRow.delivery_job_id)
      .maybeSingle();

    if (jobError) {
      console.warn("courier incoming job load failed", jobError.message);
    }

    setOffer({
      ...(offerRow as Omit<IncomingOffer, "delivery_jobs">),
      delivery_jobs: (jobRow ?? null) as IncomingOffer["delivery_jobs"],
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    const resolveCourier = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || disposed) {
        if (!disposed) {
          setCourierId(null);
          setOffer(null);
        }
        return;
      }

      const { data } = await from("couriers")
        .select("id,status,is_active")
        .eq("user_id", user.id)
        .maybeSingle();

      if (disposed) return;
      const id = data?.status === "approved" && data?.is_active ? String(data.id) : null;
      setCourierId(id);
      if (id) await loadOffer(id);
    };

    void resolveCourier();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => void resolveCourier());
    return () => {
      disposed = true;
      authListener.subscription.unsubscribe();
    };
  }, [enabled, loadOffer]);

  useEffect(() => {
    if (!enabled || !courierId) return;
    const refresh = () => void loadOffer(courierId);
    const channel = supabase
      .channel(`courier_incoming_offer_overlay_${courierId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_offers",
          filter: `courier_id=eq.${courierId}`,
        },
        refresh,
      )
      .subscribe();
    const interval = window.setInterval(refresh, 2500);
    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [courierId, enabled, loadOffer]);

  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      if (!audioContextRef.current) audioContextRef.current = new AudioContextCtor();
      if (audioContextRef.current.state === "suspended") void audioContextRef.current.resume();
      audioUnlockedRef.current = true;
    };
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
      if (audioContextRef.current) void audioContextRef.current.close();
      audioContextRef.current = null;
      audioUnlockedRef.current = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!offer || alertedOfferRef.current === offer.id) return;
    alertedOfferRef.current = offer.id;
    if (navigator.vibrate) navigator.vibrate([450, 120, 450, 120, 700]);

    const context = audioContextRef.current;
    if (!context || !audioUnlockedRef.current) return;
    if (context.state === "suspended") void context.resume();
    const startAt = context.currentTime + 0.03;
    [0, 0.22, 0.44, 0.9, 1.12, 1.34].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(index % 3 === 1 ? 1120 : 920, startAt + offset);
      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.28, startAt + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.17);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt + offset);
      oscillator.stop(startAt + offset + 0.19);
    });
  }, [offer]);

  useEffect(() => {
    if (!offer) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [offer]);

  useEffect(() => {
    if (!offer || !courierId) return;
    if (new Date(offer.expires_at).getTime() > now) return;
    setOffer(null);
    void loadOffer(courierId);
  }, [courierId, loadOffer, now, offer]);

  if (!enabled || !courierId || !offer) return null;

  const job = offer.delivery_jobs;
  const pickup = job?.pickup_address ?? {};
  const destination = job?.delivery_address ?? {};
  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(offer.expires_at).getTime() - now) / 1000),
  );
  const distanceKm = Number(job?.estimated_distance_meters ?? 0) / 1000;

  const respond = async (action: "accept" | "reject") => {
    if (busy) return;
    setBusy(action);
    const { error } = await rpc(action === "accept" ? "accept_delivery_offer" : "reject_delivery_offer", {
      _offer_id: offer.id,
    });
    setBusy(null);

    if (error) {
      toast.error(
        error.message ||
          (action === "accept"
            ? "Esta entrega não está mais disponível."
            : "Não foi possível recusar a entrega."),
      );
      if (courierId) await loadOffer(courierId);
      return;
    }

    if (navigator.vibrate) navigator.vibrate(0);
    setOffer(null);
    toast.success(action === "accept" ? "Entrega aceita." : "Oferta recusada.");
    if (courierId) await loadOffer(courierId);
  };

  return (
    <div className="fixed inset-0 z-[1400] flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm">
      <section className="w-full max-w-[390px] overflow-hidden rounded-[2rem] border border-primary/40 bg-zinc-950 text-white shadow-[0_0_80px_rgba(250,204,21,0.2)]">
        <div className="flex items-center justify-between bg-primary px-5 py-4 text-black">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-black/10">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em]">APOIS ENTREGADOR</p>
              <h2 className="text-xl font-black">NOVA ENTREGA</h2>
            </div>
          </div>
          <div className="rounded-full bg-black px-3 py-2 text-sm font-black text-primary">
            {remainingSeconds}s
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-black p-4">
            <Store className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase text-zinc-500">Retirada</p>
              <p className="mt-1 font-black">{text(pickup.name) || "Estabelecimento parceiro"}</p>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                {text(pickup.address_line) || text(pickup.street) || "Endereço disponível no aceite"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-black p-4">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-[10px] font-black uppercase text-zinc-500">Região da entrega</p>
              <p className="mt-1 font-black">
                {[text(destination.neighborhood), text(destination.city), text(destination.state)]
                  .filter(Boolean)
                  .join(" · ") || "Destino protegido até o aceite"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                O endereço exato do cliente é liberado somente após você aceitar.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-zinc-800 bg-black p-4">
              <p className="text-[10px] font-black uppercase text-zinc-500">Distância estimada</p>
              <p className="mt-1 text-lg font-black">
                {distanceKm > 0 ? `${distanceKm.toFixed(1).replace(".", ",")} km` : "A calcular"}
              </p>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-[10px] font-black uppercase text-zinc-500">Seu ganho</p>
              <p className="mt-1 text-lg font-black text-primary">{money(job?.estimated_earnings)}</p>
            </div>
          </div>

          <div className="grid grid-cols-[0.8fr_1.2fr] gap-3 pt-1">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void respond("reject")}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 text-sm font-black text-zinc-300 disabled:opacity-60"
            >
              {busy === "reject" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              RECUSAR
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void respond("accept")}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black text-black shadow-[0_12px_35px_rgba(250,204,21,0.22)] disabled:opacity-60"
            >
              {busy === "accept" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Truck className="h-5 w-5" />}
              ACEITAR ENTREGA
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export { CourierIncomingOfferOverlay };
