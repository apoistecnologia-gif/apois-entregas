/// <reference types="@types/google.maps" />
import { APIProvider, AdvancedMarker, ColorScheme, Map, useMap } from "@vis.gl/react-google-maps";
import { Crosshair, ExternalLink, MapPin, Navigation, PackageCheck, Store } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CourierPosition = {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  recordedAt: number;
};

type LatLng = { lat: number; lng: number };

type RouteMetrics = {
  distanceMeters: number;
  durationSeconds: number;
};

const BRAND_GOLD = "#F6BE1C";

const parseCoordinate = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const distanceMeters = (a: LatLng, b: LatLng) => {
  const radius = 6371000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const formatDistance = (meters: number | null) => {
  if (!meters || meters <= 0) return "Calculando...";
  return meters < 1000
    ? `${Math.max(1, Math.round(meters))} m`
    : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
};

const formatDuration = (seconds: number | null) => {
  if (!seconds || seconds <= 0) return "Calculando...";
  return `${Math.max(1, Math.round(seconds / 60))} min`;
};

function RouteMapContent({
  currentPosition,
  target,
  jobId,
  onMetrics,
}: {
  currentPosition: CourierPosition | null;
  target: LatLng;
  jobId: string;
  onMetrics: (metrics: RouteMetrics) => void;
}) {
  const map = useMap();
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const fallbackLineRef = useRef<google.maps.Polyline | null>(null);
  const lastRouteRef = useRef<{ origin: LatLng; target: LatLng; at: number } | null>(null);
  const lastPersistedRef = useRef<RouteMetrics | null>(null);
  const [routeState, setRouteState] = useState<"idle" | "loading" | "ready" | "fallback">("idle");

  useEffect(() => {
    if (!map || !currentPosition || !window.google?.maps) {
      if (map && !currentPosition) map.panTo(target);
      return;
    }

    const origin = { lat: currentPosition.lat, lng: currentPosition.lng };
    const previous = lastRouteRef.current;
    const targetChanged = previous ? distanceMeters(previous.target, target) > 5 : true;
    const moved = previous ? distanceMeters(previous.origin, origin) : Number.POSITIVE_INFINITY;
    const elapsed = previous ? Date.now() - previous.at : Number.POSITIVE_INFINITY;
    if (!targetChanged && moved < 50 && elapsed < 30_000) return;

    let disposed = false;
    setRouteState("loading");

    const clearRoute = () => {
      polylinesRef.current.forEach((polyline) => polyline.setMap(null));
      polylinesRef.current = [];
      fallbackLineRef.current?.setMap(null);
      fallbackLineRef.current = null;
    };

    void (async () => {
      try {
        const routesLibrary = (await google.maps.importLibrary("routes")) as any;
        const { routes } = await routesLibrary.Route.computeRoutes({
          origin,
          destination: target,
          travelMode: "DRIVING",
          routingPreference: "TRAFFIC_AWARE",
          fields: ["path", "distanceMeters", "durationMillis"],
        });
        if (disposed) return;
        if (!routes?.length) throw new Error("no route returned");

        const route = routes[0];
        clearRoute();
        polylinesRef.current = route.createPolylines({
          polylineOptions: {
            strokeColor: BRAND_GOLD,
            strokeOpacity: 0.98,
            strokeWeight: 7,
          },
        });
        polylinesRef.current.forEach((polyline: google.maps.Polyline) => polyline.setMap(map));
        lastRouteRef.current = { origin, target, at: Date.now() };

        const bounds = new google.maps.LatLngBounds();
        bounds.extend(origin);
        bounds.extend(target);
        route.path?.forEach((point: google.maps.LatLngLiteral) => bounds.extend(point));
        map.fitBounds(bounds, { top: 64, right: 38, bottom: 72, left: 38 });

        const metrics: RouteMetrics = {
          distanceMeters: Math.max(0, Math.round(Number(route.distanceMeters ?? 0))),
          durationSeconds: Math.max(0, Math.round(Number(route.durationMillis ?? 0) / 1000)),
        };
        if (metrics.distanceMeters > 5000) {
          map.panTo(origin);
          map.setZoom(13);
        } else if (metrics.distanceMeters > 1800) {
          map.panTo(origin);
          map.setZoom(14);
        }
        if (metrics.distanceMeters > 0 && metrics.durationSeconds > 0) {
          onMetrics(metrics);
          const previousPersisted = lastPersistedRef.current;
          const distanceDelta = previousPersisted
            ? Math.abs(previousPersisted.distanceMeters - metrics.distanceMeters)
            : Number.POSITIVE_INFINITY;
          const durationDelta = previousPersisted
            ? Math.abs(previousPersisted.durationSeconds - metrics.durationSeconds)
            : Number.POSITIVE_INFINITY;
          if (!previousPersisted || distanceDelta >= 100 || durationDelta >= 30) {
            lastPersistedRef.current = metrics;
            const { error } = await (supabase.rpc as any)("update_courier_delivery_route_metrics", {
              _delivery_job_id: jobId,
              _distance_meters: metrics.distanceMeters,
              _duration_seconds: metrics.durationSeconds,
            });
            if (error) console.warn("courier route metrics persist failed", error.message);
          }
        }

        setRouteState("ready");
      } catch (error) {
        if (disposed) return;
        console.warn("Não foi possível calcular a rota interna do entregador:", error);
        clearRoute();
        fallbackLineRef.current = new google.maps.Polyline({
          map,
          path: [origin, target],
          geodesic: true,
          strokeColor: BRAND_GOLD,
          strokeOpacity: 0.78,
          strokeWeight: 5,
        });
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(origin);
        bounds.extend(target);
        map.fitBounds(bounds, { top: 64, right: 38, bottom: 72, left: 38 });
        lastRouteRef.current = { origin, target, at: Date.now() };
        setRouteState("fallback");
      }
    })();

    return () => {
      disposed = true;
    };
  }, [currentPosition, jobId, map, onMetrics, target]);

  useEffect(
    () => () => {
      polylinesRef.current.forEach((polyline) => polyline.setMap(null));
      polylinesRef.current = [];
      fallbackLineRef.current?.setMap(null);
      fallbackLineRef.current = null;
    },
    [],
  );

  return (
    <>
      {currentPosition ? (
        <AdvancedMarker position={{ lat: currentPosition.lat, lng: currentPosition.lng }}>
          <div className="grid h-10 w-10 place-items-center rounded-full border-[3px] border-white bg-primary shadow-[0_8px_25px_rgba(0,0,0,0.65)] ring-4 ring-primary/20">
            <Navigation className="h-5 w-5 fill-white text-white" />
          </div>
        </AdvancedMarker>
      ) : null}
      <AdvancedMarker position={target}>
        <div className="grid h-12 w-12 place-items-center rounded-full border-2 border-white bg-accent text-white shadow-[0_10px_28px_rgba(0,0,0,0.7)] ring-4 ring-accent/25">
          <MapPin className="h-7 w-7 fill-white/10" />
        </div>
      </AdvancedMarker>
      {routeState === "fallback" ? (
        <div className="absolute bottom-3 left-3 right-3 z-20 rounded-xl border border-amber-500/20 bg-black/90 px-3 py-2 text-center text-[10px] font-bold text-amber-300 backdrop-blur-xl">
          Trajeto aproximado exibido. Use “Rotas” para orientação curva a curva.
        </div>
      ) : null}
    </>
  );
}

type CourierMapMerchant = {
  id: string;
  name: string;
  latitude: number | string | null;
  longitude: number | string | null;
  is_open?: boolean | null;
};

function RecenterControl({ position }: { position: LatLng }) {
  const map = useMap();
  return (
    <button
      type="button"
      onClick={() => {
        map?.panTo(position);
        map?.setZoom(15);
      }}
      aria-label="Recentralizar mapa"
      className="absolute right-3 top-3 z-20 grid h-11 w-11 place-items-center rounded-full border border-accent/40 bg-black/90 text-white shadow-xl backdrop-blur active:scale-95"
    >
      <Crosshair className="h-5 w-5" />
    </button>
  );
}

export function CourierLiveMap({
  currentPosition,
  merchants,
  activeOfferMerchantIds,
}: {
  currentPosition: CourierPosition | null;
  merchants: CourierMapMerchant[];
  activeOfferMerchantIds: string[];
}) {
  const browserKey = (import.meta as any).env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const mapId = (import.meta as any).env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;
  const activeOfferSet = useMemo(() => new Set(activeOfferMerchantIds), [activeOfferMerchantIds]);
  const nearbyMerchants = useMemo(() => {
    if (!currentPosition) return [];
    const origin = { lat: currentPosition.lat, lng: currentPosition.lng };
    return merchants
      .map((merchant) => {
        const lat = parseCoordinate(merchant.latitude);
        const lng = parseCoordinate(merchant.longitude);
        if (lat === null || lng === null) return null;
        const position = { lat, lng };
        return {
          ...merchant,
          position,
          distanceMeters: distanceMeters(origin, position),
          hasActiveOffer: activeOfferSet.has(merchant.id),
        };
      })
      .filter(Boolean)
      .filter((merchant: any) => merchant.distanceMeters <= 8000)
      .sort((a: any, b: any) => a.distanceMeters - b.distanceMeters)
      .slice(0, 30) as any[];
  }, [activeOfferSet, currentPosition, merchants]);

  return (
    <section className="overflow-hidden rounded-[1.9rem] border border-accent/25 bg-zinc-950 shadow-[0_24px_65px_rgba(0,0,0,0.5)]">
      <div className="border-b border-accent/20 bg-black/70 px-4 py-3.5">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-accent">
          Mapa em tempo real
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {currentPosition
            ? `${nearbyMerchants.length} parceiros APOIS em até 8 km`
            : "Obtendo sua localização..."}
        </p>
      </div>
      {browserKey && mapId && currentPosition ? (
        <APIProvider apiKey={browserKey}>
          <div className="relative h-[23rem] min-h-[52vh] max-h-[31rem] w-full bg-zinc-900">
            <Map
              center={{ lat: currentPosition.lat, lng: currentPosition.lng }}
              zoom={14}
              gestureHandling="greedy"
              disableDefaultUI
              mapId={mapId}
              colorScheme={ColorScheme.DARK}
            >
              {nearbyMerchants.map((merchant: any) => (
                <AdvancedMarker
                  key={merchant.id}
                  position={merchant.position}
                  title={merchant.name}
                >
                  <div
                    className={`grid h-9 w-9 place-items-center rounded-full border-2 border-black ${merchant.hasActiveOffer ? "bg-primary text-white" : "bg-zinc-200 text-black"} shadow-xl`}
                  >
                    {merchant.hasActiveOffer ? (
                      <PackageCheck className="h-4 w-4" />
                    ) : (
                      <Store className="h-4 w-4" />
                    )}
                  </div>
                </AdvancedMarker>
              ))}
              <AdvancedMarker position={{ lat: currentPosition.lat, lng: currentPosition.lng }}>
                <div className="grid h-11 w-11 place-items-center rounded-full border-4 border-white bg-primary text-white shadow-2xl ring-4 ring-primary/20">
                  <Navigation className="h-5 w-5 fill-white text-white" />
                </div>
              </AdvancedMarker>
              <RecenterControl position={{ lat: currentPosition.lat, lng: currentPosition.lng }} />
            </Map>
          </div>
        </APIProvider>
      ) : (
        <div className="grid h-64 place-items-center px-6 text-center text-sm text-zinc-500">
          {browserKey && mapId
            ? "Aguardando o GPS retornar sua posição atual."
            : "Mapa indisponível: configuração do Google Maps não foi carregada."}
        </div>
      )}
    </section>
  );
}

export function CourierRouteMap({
  job,
  currentPosition,
}: {
  job: any;
  currentPosition: CourierPosition | null;
}) {
  const browserKey = (import.meta as any).env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const mapId = (import.meta as any).env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;
  const goingToDelivery = ["picked_up", "on_the_way", "arrived_destination"].includes(job.status);
  const [metrics, setMetrics] = useState<RouteMetrics>({
    distanceMeters: Number(job.estimated_distance_meters ?? 0),
    durationSeconds: Number(job.estimated_duration_seconds ?? 0),
  });
  const target = useMemo(() => {
    const latitude = parseCoordinate(goingToDelivery ? job.delivery_latitude : job.pickup_latitude);
    const longitude = parseCoordinate(
      goingToDelivery ? job.delivery_longitude : job.pickup_longitude,
    );
    return latitude === null || longitude === null ? null : { lat: latitude, lng: longitude };
  }, [
    goingToDelivery,
    job.delivery_latitude,
    job.delivery_longitude,
    job.pickup_latitude,
    job.pickup_longitude,
  ]);

  const openNavigation = () => {
    if (!target) return;
    const destination = `${target.lat},${target.lng}`;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  if (!target) {
    return (
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
        A localização geográfica desta etapa não está disponível. Confira o endereço antes de
        seguir.
      </div>
    );
  }

  const expanded = goingToDelivery;

  return (
    <section className="overflow-hidden rounded-[1.9rem] border border-accent/25 bg-black shadow-[0_22px_60px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between gap-3 border-b border-accent/15 bg-black/95 p-3">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-accent">
            {goingToDelivery ? "Rota até o cliente" : "Rota até o estabelecimento"}
          </p>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {currentPosition
              ? "Rota atualizada pela sua localização"
              : "Aguardando sua localização para traçar a rota"}
          </p>
        </div>
        <button
          type="button"
          onClick={openNavigation}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-accent/40 bg-gradient-to-br from-primary to-accent px-3 text-[11px] font-black text-white shadow-[0_8px_22px_rgba(200,138,8,0.24)] active:scale-95"
        >
          <ExternalLink className="h-4 w-4" /> Rotas
        </button>
      </div>

      <div className="grid grid-cols-2 divide-x divide-zinc-800 border-b border-zinc-900 bg-black">
        <div className="px-4 py-3">
          <p className="text-[9px] font-black uppercase text-zinc-600">Distância restante</p>
          <p className="mt-1 text-lg font-black text-white">
            {formatDistance(metrics.distanceMeters)}
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[9px] font-black uppercase text-zinc-600">Tempo estimado</p>
          <p className="mt-1 text-lg font-black text-primary">
            {formatDuration(metrics.durationSeconds)}
          </p>
        </div>
      </div>

      {browserKey && mapId ? (
        <APIProvider apiKey={browserKey}>
          <div
            className={`relative w-full bg-zinc-900 ${expanded ? "h-[36rem] min-h-[72vh] max-h-[44rem]" : "h-[29rem] min-h-[62vh] max-h-[36rem]"}`}
          >
            <Map
              defaultCenter={
                currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : target
              }
              defaultZoom={14}
              gestureHandling="greedy"
              disableDefaultUI
              mapId={mapId}
              colorScheme={ColorScheme.DARK}
            >
              <RouteMapContent
                currentPosition={currentPosition}
                target={target}
                jobId={String(job.id)}
                onMetrics={setMetrics}
              />
              {currentPosition ? (
                <RecenterControl
                  position={{ lat: currentPosition.lat, lng: currentPosition.lng }}
                />
              ) : null}
            </Map>
          </div>
        </APIProvider>
      ) : (
        <div className="grid h-72 place-items-center px-6 text-center text-sm text-zinc-500">
          Mapa indisponível: configuração do Google Maps não foi carregada.
        </div>
      )}
    </section>
  );
}
