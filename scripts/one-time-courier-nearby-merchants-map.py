from pathlib import Path

route_path = Path('src/routes/courier.tsx')
text = route_path.read_text(encoding='utf-8')

old = '  const [offers, setOffers] = useState<any[]>([]);\n  const [deliveryHistory, setDeliveryHistory] = useState<any[]>([]);'
new = '  const [offers, setOffers] = useState<any[]>([]);\n  const [nearbyMerchants, setNearbyMerchants] = useState<any[]>([]);\n  const [deliveryHistory, setDeliveryHistory] = useState<any[]>([]);'
if old not in text:
    raise SystemExit('courier nearbyMerchants state insertion point not found')
text = text.replace(old, new, 1)

old = '''    const [availabilityRes, offersRes, jobsRes, walletRes, metricsRes] = await Promise.all([
      from("courier_availability").select("*").eq("courier_id", courierId).maybeSingle(),
      from("delivery_offers")
        .select("*, delivery_jobs(*, orders(order_number,total,status))")
        .eq("courier_id", courierId)
        .eq("status", "offered")
        .gt("expires_at", new Date().toISOString())
        .order("offered_at"),
      from("delivery_jobs")
        .select("*, orders(order_number,total,status,observation)")
        .eq("courier_id", courierId)
        .in("status", [
          "accepted",
          "arriving_pickup",
          "at_pickup",
          "picked_up",
          "on_the_way",
          "arrived_destination",
        ])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      from("wallets").select("*").eq("courier_id", courierId).maybeSingle(),
      rpc("get_courier_metrics", { _timezone: timezone }),
    ]);'''
new = '''    const [availabilityRes, offersRes, jobsRes, walletRes, metricsRes, merchantsRes] = await Promise.all([
      from("courier_availability").select("*").eq("courier_id", courierId).maybeSingle(),
      from("delivery_offers")
        .select("*, delivery_jobs(*, orders(order_number,total,status))")
        .eq("courier_id", courierId)
        .eq("status", "offered")
        .gt("expires_at", new Date().toISOString())
        .order("offered_at"),
      from("delivery_jobs")
        .select("*, orders(order_number,total,status,observation)")
        .eq("courier_id", courierId)
        .in("status", [
          "accepted",
          "arriving_pickup",
          "at_pickup",
          "picked_up",
          "on_the_way",
          "arrived_destination",
        ])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      from("wallets").select("*").eq("courier_id", courierId).maybeSingle(),
      rpc("get_courier_metrics", { _timezone: timezone }),
      from("merchants")
        .select("id,name,latitude,longitude,is_open")
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .limit(100),
    ]);'''
if old not in text:
    raise SystemExit('courier operations Promise.all block not found')
text = text.replace(old, new, 1)

old = '    setOffers(offersRes.data ?? []);\n    setActiveJob(jobsRes.data ?? null);'
new = '    setOffers(offersRes.data ?? []);\n    setNearbyMerchants(merchantsRes.data ?? []);\n    setActiveJob(jobsRes.data ?? null);'
if old not in text:
    raise SystemExit('courier setOffers insertion point not found')
text = text.replace(old, new, 1)

old = '''        {availability?.is_online && !activeJob ? (
          <CourierLiveMap currentPosition={currentPosition} />
        ) : null}'''
new = '''        {availability?.is_online && !activeJob ? (
          <CourierLiveMap
            currentPosition={currentPosition}
            merchants={nearbyMerchants}
            activeOfferMerchantIds={offers
              .map((offer) => offer.delivery_jobs?.merchant_id)
              .filter(Boolean)}
          />
        ) : null}'''
if old not in text:
    raise SystemExit('CourierLiveMap render block not found')
text = text.replace(old, new, 1)

route_path.write_text(text, encoding='utf-8')

map_path = Path('src/components/CourierRouteMap.tsx')
mtext = map_path.read_text(encoding='utf-8')
mtext = mtext.replace(
    'import { ExternalLink, MapPin, Navigation } from "lucide-react";',
    'import { ExternalLink, MapPin, Navigation, PackageCheck, Store } from "lucide-react";',
    1,
)

start = mtext.find('export function CourierLiveMap(')
end = mtext.find('export function CourierRouteMap({')
if start == -1 or end == -1 or end <= start:
    raise SystemExit('CourierLiveMap boundaries not found')

live_component = r'''type CourierMapMerchant = {
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
  const selectedMerchant = nearbyMerchants.find((merchant) => merchant.id === selectedMerchantId) ?? null;
  const activeOfferCount = nearbyMerchants.filter((merchant) => merchant.hasActiveOffer).length;
  const distanceLabel = (meters: number) =>
    meters < 1000 ? `${Math.max(1, Math.round(meters))} m` : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;

  useEffect(() => {
    if (selectedMerchantId && !nearbyMerchants.some((merchant) => merchant.id === selectedMerchantId)) {
      setSelectedMerchantId(null);
    }
  }, [nearbyMerchants, selectedMerchantId]);

  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-900 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-primary">Mapa em tempo real</p>
            <p className="mt-1 text-xs text-zinc-500">
              {currentPosition
                ? `${nearbyMerchants.length} parceiro${nearbyMerchants.length === 1 ? "" : "s"} APOIS em até 8 km.`
                : "Obtendo sua localização para exibir o mapa..."}
            </p>
          </div>
          {activeOfferCount > 0 ? (
            <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-400">
              {activeOfferCount} com oferta
            </span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-bold text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Parceiro APOIS
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Oferta disponível
          </span>
          <span className="flex items-center gap-1.5">
            <Navigation className="h-3 w-3 text-primary" /> Você
          </span>
        </div>
      </div>
      {browserKey && mapId && currentPosition ? (
        <APIProvider apiKey={browserKey}>
          <div className="relative h-72 w-full bg-zinc-900">
            <Map
              center={{ lat: currentPosition.lat, lng: currentPosition.lng }}
              zoom={14}
              gestureHandling="greedy"
              disableDefaultUI
              mapId={mapId}
            >
              {nearbyMerchants.map((merchant) => (
                <AdvancedMarker
                  key={merchant.id}
                  position={merchant.position}
                  onClick={() => setSelectedMerchantId(merchant.id)}
                  title={merchant.name}
                >
                  {merchant.hasActiveOffer ? (
                    <div className="relative grid h-11 w-11 place-items-center">
                      <span className="absolute h-11 w-11 animate-ping rounded-full bg-emerald-400/40" />
                      <div className="relative grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-emerald-400 text-black shadow-2xl ring-4 ring-emerald-400/25">
                        <PackageCheck className="h-4.5 w-4.5" />
                      </div>
                    </div>
                  ) : (
                    <div className="grid h-7 w-7 place-items-center rounded-full border-2 border-black bg-primary text-black shadow-xl ring-2 ring-primary/20">
                      <Store className="h-3.5 w-3.5" />
                    </div>
                  )}
                </AdvancedMarker>
              ))}
              <AdvancedMarker position={{ lat: currentPosition.lat, lng: currentPosition.lng }} title="Sua posição">
                <div className="grid h-11 w-11 place-items-center rounded-full border-4 border-white bg-primary text-black shadow-2xl ring-4 ring-primary/20">
                  <Navigation className="h-5 w-5 fill-black text-black" />
                </div>
              </AdvancedMarker>
            </Map>
            {selectedMerchant ? (
              <button
                type="button"
                onClick={() => setSelectedMerchantId(null)}
                className="absolute bottom-3 left-3 right-3 z-20 rounded-2xl border border-zinc-700 bg-black/95 p-3 text-left shadow-2xl backdrop-blur"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${selectedMerchant.hasActiveOffer ? "bg-emerald-400 text-black" : "bg-primary text-black"}`}
                  >
                    {selectedMerchant.hasActiveOffer ? (
                      <PackageCheck className="h-5 w-5" />
                    ) : (
                      <Store className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-white">{selectedMerchant.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      A aproximadamente {distanceLabel(selectedMerchant.distanceMeters)} de você
                    </p>
                    {selectedMerchant.hasActiveOffer ? (
                      <p className="mt-1 text-[10px] font-black uppercase text-emerald-400">
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
        <div className="grid h-48 place-items-center px-6 text-center text-sm text-zinc-500">
          {browserKey && mapId
            ? "Aguardando o GPS retornar sua posição atual."
            : "Mapa indisponível: configuração do Google Maps não foi carregada."}
        </div>
      )}
    </section>
  );
}

'''
mtext = mtext[:start] + live_component + mtext[end:]
map_path.write_text(mtext, encoding='utf-8')
