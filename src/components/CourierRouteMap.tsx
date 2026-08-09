/// <reference types="@types/google.maps" />
import { APIProvider, AdvancedMarker, Map, useMap } from "@vis.gl/react-google-maps";
import { ExternalLink, MapPin, Navigation } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CourierPosition } from "@/components/CourierLocationTracker";

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
  const rendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const lastRouteRef = useRef<{ origin: LatLng; target: LatLng; at: number } | null>(null);
  const [routeState, setRouteState] = useState<"idle" | "loading" | "ready" | "error">("idle");

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

    if (!rendererRef.current) {
      rendererRef.current = new google.maps.DirectionsRenderer({
        map,
        suppressMarkers: true,
        preserveViewport: false,
        polylineOptions: {
          strokeColor: "#FFD700",
          strokeOpacity: 0.95,
          strokeWeight: 5,
        },
      });
    } else {
      rendererRef.current.setMap(map);
    }

    let disposed = false;
    setRouteState("loading");
    const service = new google.maps.DirectionsService();
    service.route(
      {
        origin,
        destination: target,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (disposed) return;
        if (status === google.maps.DirectionsStatus.OK && result) {
          rendererRef.current?.setDirections(result);
          lastRouteRef.current = { origin, target, at: Date.now() };
          setRouteState("ready");
        } else {
          console.warn("Não foi possível traçar a rota do entregador:", status);
          rendererRef.current?.setDirections({ routes: [] } as google.maps.DirectionsResult);
          map.panTo(target);
          setRouteState("error");
        }
      },
    );

    return () => {
      disposed = true;
    };
  }, [currentPosition, map, target.lat, target.lng]);

  useEffect(
    () => () => {
      rendererRef.current?.setMap(null);
      rendererRef.current = null;
    },
    [],
  );

  return (
    <>
      {currentPosition ? (
        <AdvancedMarker position={{ lat: currentPosition.lat, lng: currentPosition.lng }}>
          <div className="grid h-7 w-7 place-items-center rounded-full border-4 border-white bg-primary shadow-xl">
            <Navigation className="h-3.5 w-3.5 fill-black text-black" />
          </div>
        </AdvancedMarker>
      ) : null}
      <AdvancedMarker position={target}>
        <div className="grid h-9 w-9 place-items-center rounded-full border-2 border-black bg-primary text-black shadow-xl">
          <MapPin className="h-5 w-5 fill-black/10" />
        </div>
      </AdvancedMarker>
      {routeState === "error" ? (
        <div className="absolute bottom-2 left-2 right-2 z-20 rounded-lg bg-black/80 px-3 py-2 text-center text-[10px] font-bold text-amber-300 backdrop-blur">
          A rota não pôde ser desenhada agora. Use “Abrir navegação” para seguir até o destino.
        </div>
      ) : null}
    </>
  );
}

export function CourierRouteMap({
  job,
  currentPosition,
}: {
  job: any;
  currentPosition: CourierPosition | null;
}) {
  const browserKey = (import.meta as any).env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const goingToDelivery = ["picked_up", "on_the_way", "arrived_destination"].includes(job.status);
  const target = useMemo(() => {
    const latitude = parseCoordinate(
      goingToDelivery ? job.delivery_latitude : job.pickup_latitude,
    );
    const longitude = parseCoordinate(
      goingToDelivery ? job.delivery_longitude : job.pickup_longitude,
    );
    return latitude === null || longitude === null ? null : { lat: latitude, lng: longitude };
  }, [goingToDelivery, job.delivery_latitude, job.delivery_longitude, job.pickup_latitude, job.pickup_longitude]);

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
      <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
        A localização geográfica desta etapa não está disponível. Confira o endereço abaixo antes de seguir.
      </div>
    );
  }

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-black">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-900 p-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-primary">
            {goingToDelivery ? "Rota até o cliente" : "Rota até o estabelecimento"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {currentPosition ? "Rota atualizada pela sua localização" : "Aguardando sua localização para traçar a rota"}
          </p>
        </div>
        <button
          type="button"
          onClick={openNavigation}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-black text-black"
        >
          <ExternalLink className="h-4 w-4" />
          Abrir navegação
        </button>
      </div>

      {browserKey ? (
        <APIProvider apiKey={browserKey}>
          <div className="relative h-64 w-full bg-zinc-900">
            <Map
              defaultCenter={currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : target}
              defaultZoom={14}
              gestureHandling="greedy"
              disableDefaultUI
              mapId="DEMO_MAP_ID"
            >
              <RouteMapContent currentPosition={currentPosition} target={target} />
            </Map>
          </div>
        </APIProvider>
      ) : (
        <div className="grid h-40 place-items-center p-6 text-center text-sm text-zinc-500">
          O mapa interno está indisponível neste ambiente. A navegação externa continua disponível.
        </div>
      )}
    </section>
  );
}
