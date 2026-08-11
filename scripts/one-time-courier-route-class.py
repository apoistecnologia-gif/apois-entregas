from pathlib import Path
import re

p = Path('src/components/CourierRouteMap.tsx')
s = p.read_text(encoding='utf-8')
pattern = re.compile(r'function RouteMapContent\(\{.*?\n}\n\ntype CourierMapMerchant', re.S)
replacement = r'''function RouteMapContent({
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
            strokeOpacity: 0.96,
            strokeWeight: 6,
          },
        });
        polylinesRef.current.forEach((polyline) => polyline.setMap(map));
        lastRouteRef.current = { origin, target, at: Date.now() };
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(origin);
        bounds.extend(target);
        routes[0].path?.forEach((point: google.maps.LatLngLiteral) => bounds.extend(point));
        map.fitBounds(bounds, 48);
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
          strokeOpacity: 0.75,
          strokeWeight: 4,
        });
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(origin);
        bounds.extend(target);
        map.fitBounds(bounds, 48);
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
      {routeState === "fallback" ? (
        <div className="absolute bottom-2 left-2 right-2 z-20 rounded-lg bg-black/80 px-3 py-2 text-center text-[10px] font-bold text-amber-300 backdrop-blur">
          Trajeto aproximado exibido. Use “Abrir navegação” para orientação curva a curva.
        </div>
      ) : null}
    </>
  );
}

type CourierMapMerchant'''
if not pattern.search(s):
    raise SystemExit('RouteMapContent block not found')
p.write_text(pattern.sub(replacement, s, count=1), encoding='utf-8')
# trigger
