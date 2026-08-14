import {
  Clock3,
  Loader2,
  MapPin,
  PackageCheck,
  Route as RouteIcon,
  Store,
  Truck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import logoAsset from "@/assets/logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { getApoisProductMode } from "@/lib/product-routing";

type OfferAddress = {
  name?: string | null;
  address_line?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
};

type OfferArea = {
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
};

type IncomingOffer = {
  id: string;
  delivery_job_id: string;
  status: string;
  offered_at: string;
  expires_at: string;
  order_number: number | string | null;
  item_count: number | string | null;
  merchant_id: string;
  merchant_name: string | null;
  merchant_logo_url: string | null;
  pickup_address: OfferAddress | null;
  delivery_area: OfferArea | null;
  pickup_distance_meters: number | string | null;
  delivery_distance_meters: number | string | null;
  total_distance_meters: number | string | null;
  estimated_duration_seconds: number | string | null;
  estimated_earnings: number | string | null;
};

const from = (table: string) => (supabase.from as any)(table);
const rpc = (name: string, args?: Record<string, unknown>) =>
  (supabase.rpc as any)(name, args ?? {});

function money(value: unknown) {
  return `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;
}

function distance(value: unknown) {
  const meters = Number(value);
  if (!Number.isFinite(meters) || meters <= 0) return "A calcular";
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

function duration(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "A calcular";
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function CourierIncomingOfferOverlay() {
  const enabled = getApoisProductMode() === "courier";
  const [courierId, setCourierId] = useState<string | null>(null);
  const [offers, setOffers] = useState<IncomingOffer[]>([]);
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [now, setNow] = useState(Date.now());
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const alertIntervalRef = useRef<number | null>(null);

  const offer = offers[0] ?? null;

  const stopAlert = useCallback(() => {
    if (alertIntervalRef.current !== null) {
      window.clearInterval(alertIntervalRef.current);
      alertIntervalRef.current = null;
    }
    if (navigator.vibrate) navigator.vibrate(0);
  }, []);

  const playAlertPulse = useCallback(() => {
    if (navigator.vibrate) navigator.vibrate([420, 120, 420, 120, 650]);

    const context = audioContextRef.current;
    if (!context || !audioUnlockedRef.current) return;
    if (context.state === "suspended") void context.resume();

    const startAt = context.currentTime + 0.03;
    [0, 0.2, 0.4].forEach((offset, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(index === 1 ? 1120 : 920, startAt + offset);
      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.26, startAt + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.16);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt + offset);
      oscillator.stop(startAt + offset + 0.18);
    });
  }, []);

  const loadOffers = useCallback(async () => {
    const { data, error } = await rpc("get_courier_incoming_offers");
    if (error) {
      console.warn("courier incoming offers load failed", error.message);
      return;
    }
    setOffers(Array.isArray(data) ? (data as IncomingOffer[]) : []);
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
          setOffers([]);
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
      if (id) await loadOffers();
      else setOffers([]);
    };

    void resolveCourier();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => void resolveCourier());

    return () => {
      disposed = true;
      authListener.subscription.unsubscribe();
    };
  }, [enabled, loadOffers]);

  useEffect(() => {
    if (!enabled || !courierId) return;
    const refresh = () => void loadOffers();
    const offerChannel = supabase
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
    const availabilityChannel = supabase
      .channel(`courier_incoming_offer_availability_${courierId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "courier_availability",
          filter: `courier_id=eq.${courierId}`,
        },
        refresh,
      )
      .subscribe();
    const jobChannel = supabase
      .channel(`courier_incoming_offer_jobs_${courierId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_jobs",
          filter: `courier_id=eq.${courierId}`,
        },
        refresh,
      )
      .subscribe();
    const interval = window.setInterval(refresh, 2500);

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(offerChannel);
      void supabase.removeChannel(availabilityChannel);
      void supabase.removeChannel(jobChannel);
    };
  }, [courierId, enabled, loadOffers]);

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
      stopAlert();
      if (audioContextRef.current) void audioContextRef.current.close();
      audioContextRef.current = null;
      audioUnlockedRef.current = false;
    };
  }, [enabled, stopAlert]);

  useEffect(() => {
    stopAlert();
    if (!offer) return;

    playAlertPulse();
    alertIntervalRef.current = window.setInterval(playAlertPulse, 2800);

    return stopAlert;
  }, [offer?.id, playAlertPulse, stopAlert]);

  useEffect(() => {
    if (!offer) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [offer]);

  useEffect(() => {
    if (!offer) return;
    if (new Date(offer.expires_at).getTime() > now) return;
    setOffers((current) => current.filter((row) => row.id !== offer.id));
    void loadOffers();
  }, [loadOffers, now, offer]);

  if (!enabled || !courierId || !offer) return null;

  const pickup = offer.pickup_address ?? {};
  const destination = offer.delivery_area ?? {};
  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(offer.expires_at).getTime() - now) / 1000),
  );
  const destinationLabel = [destination.neighborhood, destination.city, destination.state]
    .filter(Boolean)
    .join(" · ");
  const itemCount = Math.max(0, Number(offer.item_count ?? 0));

  const respond = async (action: "accept" | "reject") => {
    if (busy) return;
    setBusy(action);
    const { error } = await rpc(
      action === "accept" ? "accept_delivery_offer" : "reject_delivery_offer",
      { _offer_id: offer.id },
    );
    setBusy(null);

    if (error) {
      toast.error(
        error.message ||
          (action === "accept"
            ? "Esta entrega não está mais disponível."
            : "Não foi possível recusar a entrega."),
      );
      await loadOffers();
      return;
    }

    stopAlert();
    setOffers((current) => current.filter((row) => row.id !== offer.id));
    toast.success(action === "accept" ? "Entrega aceita." : "Oferta recusada.");
    await loadOffers();
  };

  return (
    <div className="fixed inset-0 z-[1400] flex items-end justify-center bg-black/85 p-3 backdrop-blur-md">
      <section className="w-full max-w-[390px] overflow-hidden rounded-[2rem] border border-primary/45 bg-[#080808] text-white shadow-[0_0_90px_rgba(250,204,21,0.2)]">
        <div className="border-b border-primary/20 bg-[linear-gradient(135deg,rgba(250,204,21,0.16),rgba(0,0,0,0.95)_58%)] px-5 pb-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <img src={logoAsset.url} alt="APOIS ENTREGA" className="h-11 w-auto object-contain" />
            <div
              className={`rounded-full border px-3 py-2 text-sm font-black ${
                remainingSeconds <= 15
                  ? "border-red-500/35 bg-red-500/10 text-red-300"
                  : "border-primary/30 bg-black/70 text-primary"
              }`}
            >
              {remainingSeconds}s
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-black">
                <Truck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                  Nova entrega
                </p>
                <p className="text-sm font-black text-white">Pedido #{offer.order_number ?? "—"}</p>
              </div>
            </div>
            {offers.length > 1 ? (
              <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-[10px] font-black text-zinc-400">
                +{offers.length - 1} na fila
              </span>
            ) : null}
          </div>
        </div>

        <div className="max-h-[72dvh] space-y-4 overflow-y-auto p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              {offer.merchant_logo_url ? (
                <img
                  src={offer.merchant_logo_url}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Store className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-black">
                {offer.merchant_name || pickup.name || "Estabelecimento parceiro"}
              </p>
              <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                <PackageCheck className="h-3.5 w-3.5 text-primary" />
                <span>
                  {itemCount} {itemCount === 1 ? "item" : "itens"}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase text-zinc-600">Ganho estimado</p>
              <p className="mt-1 text-xl font-black text-primary">
                {money(offer.estimated_earnings)}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black">
            <div className="flex gap-3 border-b border-zinc-900 p-4">
              <Store className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase text-primary">Retirada</p>
                <p className="mt-1 text-sm font-bold text-zinc-100">
                  {pickup.address_line || pickup.name || "Estabelecimento parceiro"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {[pickup.neighborhood, pickup.city, pickup.state].filter(Boolean).join(" · ")}
                </p>
              </div>
              <p className="shrink-0 text-xs font-black text-zinc-300">
                {distance(offer.pickup_distance_meters)}
              </p>
            </div>

            <div className="flex gap-3 p-4">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase text-primary">Entrega aproximada</p>
                <p className="mt-1 text-sm font-bold text-zinc-100">
                  {destinationLabel || "Região protegida até o aceite"}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-zinc-600">
                  O endereço exato do cliente é liberado somente após o aceite.
                </p>
              </div>
              <p className="shrink-0 text-xs font-black text-zinc-300">
                {distance(offer.delivery_distance_meters)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-center">
              <RouteIcon className="mx-auto h-4 w-4 text-primary" />
              <p className="mt-2 text-[9px] font-black uppercase text-zinc-600">Total</p>
              <p className="mt-1 text-xs font-black">{distance(offer.total_distance_meters)}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-center">
              <Clock3 className="mx-auto h-4 w-4 text-primary" />
              <p className="mt-2 text-[9px] font-black uppercase text-zinc-600">Tempo</p>
              <p className="mt-1 text-xs font-black">
                {duration(offer.estimated_duration_seconds)}
              </p>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 text-center">
              <Truck className="mx-auto h-4 w-4 text-primary" />
              <p className="mt-2 text-[9px] font-black uppercase text-zinc-600">Ganho</p>
              <p className="mt-1 text-xs font-black text-primary">
                {money(offer.estimated_earnings)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-[0.82fr_1.18fr] gap-3 pt-1">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void respond("reject")}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 text-sm font-black text-zinc-300 transition active:scale-[0.98] disabled:opacity-60"
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
              className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black text-black shadow-[0_12px_35px_rgba(250,204,21,0.25)] transition active:scale-[0.98] disabled:opacity-60"
            >
              {busy === "accept" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Truck className="h-5 w-5" />
              )}
              ACEITAR ENTREGA
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export { CourierIncomingOfferOverlay };
