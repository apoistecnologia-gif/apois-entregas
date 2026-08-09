import { APIProvider, AdvancedMarker, Map } from "@vis.gl/react-google-maps";
import { Bike, Loader2, MapPin, Navigation } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type CourierLocation = {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  recorded_at: string;
};

type DeliveryJob = {
  id: string;
  courier_id: string | null;
  status: string;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
};

const activeTrackingStatuses = new Set([
  "accepted",
  "arriving_pickup",
  "at_pickup",
  "picked_up",
  "on_the_way",
  "arrived_destination",
]);

export function CustomerDeliveryMap({ job }: { job: DeliveryJob | null | undefined }) {
  const [location, setLocation] = useState<CourierLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const browserKey = (import.meta as any).env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;

  const target = useMemo(() => {
    const lat = Number(job?.delivery_latitude);
    const lng = Number(job?.delivery_longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }, [job?.delivery_latitude, job?.delivery_longitude]);

  useEffect(() => {
    if (!job?.courier_id || !activeTrackingStatuses.has(job.status)) {
      setLocation(null);
      setUnavailable(false);
      return;
    }

    let disposed = false;
    setLoading(true);
    setUnavailable(false);

    const loadLocation = async () => {
      const { data, error } = await (supabase.from as any)("courier_locations")
        .select("latitude,longitude,accuracy_meters,recorded_at")
        .eq("courier_id", job.courier_id)
        .maybeSingle();

      if (disposed) return;
      if (error) {
        console.warn("Localização do entregador indisponível para o cliente:", error.code);
        setUnavailable(true);
        setLocation(null);
      } else {
        setLocation((data as CourierLocation | null) ?? null);
      }
      setLoading(false);
    };

    void loadLocation();

    const channel = supabase
      .channel(`customer_courier_location_${job.courier_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "courier_locations",
          filter: `courier_id=eq.${job.courier_id}`,
        },
        (payload) => {
          if (disposed) return;
          const next = payload.new as CourierLocation | Record<string, never>;
          if (next && "latitude" in next && "longitude" in next) {
            setLocation(next as CourierLocation);
            setUnavailable(false);
          }
        },
      )
      .subscribe();

    return () => {
      disposed = true;
      void supabase.removeChannel(channel);
    };
  }, [job?.courier_id, job?.status]);

  if (!job?.courier_id || !activeTrackingStatuses.has(job.status)) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-900 p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Bike className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-black">Acompanhe seu entregador</p>
            <p className="text-[10px] text-zinc-500">
              {location
                ? `Atualizado ${new Date(location.recorded_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                : "Aguardando a primeira localização"}
            </p>
          </div>
        </div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
      </div>

      {browserKey && (location || target) ? (
        <APIProvider apiKey={browserKey}>
          <div className="h-64 w-full bg-zinc-900">
            <Map
              defaultCenter={
                location
                  ? { lat: Number(location.latitude), lng: Number(location.longitude) }
                  : target ?? { lat: -8.0476, lng: -34.877 }
              }
              defaultZoom={14}
              gestureHandling="greedy"
              disableDefaultUI
              mapId="DEMO_MAP_ID"
            >
              {location ? (
                <AdvancedMarker
                  position={{ lat: Number(location.latitude), lng: Number(location.longitude) }}
                >
                  <div className="grid h-9 w-9 place-items-center rounded-full border-4 border-white bg-primary text-black shadow-xl">
                    <Navigation className="h-4 w-4 fill-black" />
                  </div>
                </AdvancedMarker>
              ) : null}
              {target ? (
                <AdvancedMarker position={target}>
                  <div className="grid h-9 w-9 place-items-center rounded-full border-2 border-black bg-white text-black shadow-xl">
                    <MapPin className="h-5 w-5" />
                  </div>
                </AdvancedMarker>
              ) : null}
            </Map>
          </div>
        </APIProvider>
      ) : (
        <div className="p-5 text-center text-xs text-zinc-500">
          {unavailable
            ? "A localização do entregador ainda não está disponível para este pedido."
            : "O mapa ficará disponível assim que a localização da entrega estiver pronta."}
        </div>
      )}
    </section>
  );
}
