/// <reference types="@types/google.maps" />
import { APIProvider, AdvancedMarker, ColorScheme, Map, useMap } from "@vis.gl/react-google-maps";
import { Crosshair, ExternalLink, MapPin, Navigation, PackageCheck, Store } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type CourierPosition = {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  recordedAt: number;
};

type LatLng = { lat: number; lng: number };

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

function RouteMapContent({
  currentPosition,
  target,
}: {
  currentPosition: CourierPosition | null;
  target: LatLng;
}) {
  const map = useMap();
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const fallbackLineRef = useRef<google.maps.Polyline | null>(null);
  const lastRouteRef = useRef<{ origin: LatLng; target: LatLng; at: number } | null>(null);
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
    if (!targetChanged && moved < 80 && elapsed < 45_000) return;

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
          fields: ["path"],
        });
        if (disposed) return;
        if (!routes?.length) throw new Error("no route returned");

        clearRoute();
        polylinesRef.current = routes[0].createPolylines({
          polylineOptions: {
            strokeColor: "#FFD54A",
            strokeOpacity: 0.98,
            strokeWeight: 6,
          },
        });
        polylinesRef.current.forEach((polyline) => polyline.setMap(map));
        lastRouteRef.current = { origin, target, at: Date.now() };
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(origin);
        bounds.extend(target);
        routes[0].path?.forEach((point: google.maps.LatLngLiteral) => bounds.extend(point));
        map.fitBounds(bounds, 54);
        setRouteState("ready");
      } catch (error) {
        if (disposed) return;
        console.warn("Não foi possível calcular a rota interna do entregador:", error);
        clearRoute();
        fallbackLineRef.current = new google.maps.Polyline({
          map,
          path: [origin, target],
          geodesic: true,
          strokeColor: "#FFD54A",
          strokeOpacity: 0.78,
          strokeWeight: 4,
        });
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(origin);
        bounds.extend(target);
        map.fitBounds(bounds, 54);
        lastRouteRef.current = { origin, target, at: Date.now() };
        setRouteState("fallback");
      }
    })();

    return () => {
      disposed = true;
    };
  }, [currentPosition, map, target]);

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
          <div className="grid h-9 w-9 place-items-center rounded-full border-[3px] border-white bg-primary shadow-[0_8px_25px_rgba(0,0,0,0.65)] ring-4 ring-primary/20">
            <Navigation className="h-4 w-4 fill-black text-black" />
          </div>
        </AdvancedMarker>
      ) : null}
      <AdvancedMarker position={target}>
        <div className="grid h-11 w-11 place-items-center rounded-full border-2 border-black bg-primary text-black shadow-[0_10px_28px_rgba(0,0,0,0.7)] ring-4 ring-primary/20">
          <MapPin className="h-6 w-6 fill-black/10" />
        </div>
      </AdvancedMarker>
      {routeState === "fallback" ? (
        <div className="absolute bottom-3 left-3 right-3 z-20 rounded-xl border border-amber-500/20 bg-black/90 px-3 py-2 text-center text-[10px] font-bold text-amber-300 backdrop-blur-xl">
          Trajeto aproximado exibido. Use “Abrir navegação” para orientação curva a curva.
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

type NearbyMerchant = CourierMapMerchant & {
  position: LatLng;
  distanceMeters: number;
  hasActiveOffer: boolean;
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
      className="absolute right-3 top-3 z-20 grid h-11 w-11 place-items-center rounded-full border border-zinc-700 bg-black/90 text-white shadow-xl backdrop-blur active:scale-95"
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
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const activeOfferSet = useMemo(() => new Set(activeOfferMerchantIds), [activeOfferMerchantIds]);
  const nearbyMerchants = useMemo<NearbyMerchant[]>(() => {
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
      .filter((merchant): merchant is NearbyMerchant => Boolean(merchant))
      .filter((merchant) => merchant.distanceMeters <= 8000)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 30);
  }, [activeOfferSet, currentPosition, merchants]);
  const selectedMerchant =
    nearbyMerchants.find((merchant) => merchant.id === selectedMerchantId) ?? null;
  const activeOfferCount = nearbyMerchants.filter((merchant) => merchant.hasActiveOffer).length;
  const distanceLabel = (meters: number) =>
    meters < 1000
      ? `${Math.max(1, Math.round(meters))} m`
      : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;

  useEffect(() => {
    if (
      selectedMerchantId &&
      !nearbyMerchants.some((merchant) => merchant.id === selectedMerchantId)
    ) {
      setSelectedMerchantId(null);
    }
  }, [nearbyMerchants, selectedMerchantId]);

  return (
    <section className="overflow-hidden rounded-[1.9rem] border border-primary/20 bg-zinc-950 shadow-[0_24px_65px_rgba(0,0,0,0.5)]">
      <div className="flex items-start justify-between gap-3 border-b border-primary/10 bg-black/70 px-4 py-3.5">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">
            Mapa em tempo real
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {currentPosition
              ? `${nearbyMerchants.length} parceiro${nearbyMerchants.length === 1 ? "" : "s"} APOIS em até 8 km`
              : "Obtendo sua localização..."}
          </p>
        </div>
        {activeOfferCount > 0 ? (
          <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[9px] font-black uppercase text-primary">
            {activeOfferCount} com oferta
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[9px] font-bold text-zinc-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> ao vivo
          </span>
        )}
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
              mapTypeControl={false}
              streetViewControl={false}
              fullscreenControl={false}
            >
              {nearbyMerchants.map((merchant) => (
                <AdvancedMarker
                  key={merchant.id}
                  position={merchant.position}
                  onClick={() => setSelectedMerchantId(merchant.id)}
                  title={merchant.name}
                >
                  {merchant.hasActiveOffer ? (
                    <div className="relative grid h-12 w-12 place-items-center">
                      <span className="absolute h-11 w-11 animate-ping rounded-full bg-primary/30" />
                      <div className="relative grid h-10 w-10 place-items-center rounded-full border-2 border-black bg-primary text-black shadow-2xl ring-4 ring-primary/25">
                        <PackageCheck className="h-5 w-5" />
                      </div>
                    </div>
                  ) : (
                    <div className="grid h-8 w-8 place-items-center rounded-full border-2 border-black bg-primary text-black shadow-xl ring-2 ring-primary/20">
                      <Store className="h-4 w-4" />
                    </div>
                  )}
                </AdvancedMarker>
              ))}
              <AdvancedMarker
                position={{ lat: currentPosition.lat, lng: currentPosition.lng }}
                title="Sua posição"
              >
                <div className="grid h-11 w-11 place-items-center rounded-full border-4 border-white bg-[#178BFF] text-white shadow-2xl ring-4 ring-[#178BFF]/20">
                  <Navigation className="h-5 w-5 fill-white text-white" />
                </div>
              </AdvancedMarker>
              <RecenterControl position={{ lat: currentPosition.lat, lng: currentPosition.lng }} />
            </Map>
            {selectedMerchant ? (
              <button
                type="button"
                onClick={() => setSelectedMerchantId(null)}
                className="absolute bottom-3 left-3 right-3 z-20 rounded-2xl border border-primary/25 bg-black/94 p-3.5 text-left shadow-2xl backdrop-blur-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-black">
                    {selectedMerchant.hasActiveOffer ? (
                      <PackageCheck className="h-5 w-5" />
                    ) : (
                      <Store className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-white">
                      {selectedMerchant.name}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      A aproximadamente {distanceLabel(selectedMerchant.distanceMeters)} de você
                    </p>
                    {selectedMerchant.hasActiveOffer ? (
                      <p className="mt-1 text-[9px] font-black uppercase tracking-wide text-primary">
                        Oferta de entrega disponível agora
                      </p>
                    ) : null}
                  </div>
                </div>
              </button>
            ) : null}
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
        A localização geográfica desta etapa não está disponível. Confira o endereço abaixo antes de
        seguir.
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[1.9rem] border border-primary/25 bg-black shadow-[0_22px_60px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between gap-3 border-b border-primary/10 bg-zinc-950/95 p-3.5">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">
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
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-primary/40 bg-primary px-3 text-[11px] font-black text-black shadow-[0_8px_22px_rgba(250,204,21,0.16)] active:scale-95"
        >
          <ExternalLink className="h-4 w-4" />
          Rotas
        </button>
      </div>

      {browserKey && mapId ? (
        <APIProvider apiKey={browserKey}>
          <div className="relative h-[22rem] min-h-[46vh] max-h-[28rem] w-full bg-zinc-900">
            <Map
              defaultCenter={
                currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : target
              }
              defaultZoom={14}
              gestureHandling="greedy"
              disableDefaultUI
              mapId={mapId}
              colorScheme={ColorScheme.DARK}
              mapTypeControl={false}
              streetViewControl={false}
              fullscreenControl={false}
            >
              <RouteMapContent currentPosition={currentPosition} target={target} />
              {currentPosition ? (
                <RecenterControl
                  position={{ lat: currentPosition.lat, lng: currentPosition.lng }}
                />
              ) : null}
            </Map>
          </div>
        </APIProvider>
      ) : (
        <div className="grid h-56 place-items-center p-6 text-center text-sm text-zinc-500">
          O mapa interno está indisponível neste ambiente. A navegação externa continua disponível.
        </div>
      )}
    </section>
  );
}
