import { APIProvider, AdvancedMarker, Map as GoogleMap } from "@vis.gl/react-google-maps";
import {
  Bike,
  CircleAlert,
  Clock3,
  Loader2,
  MapPinned,
  PackageCheck,
  RefreshCw,
  Route,
} from "lucide-react";
import { Component, useCallback, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/WorkspaceShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type DeliveryJob = {
  id: string;
  order_id: string;
  merchant_id: string;
  courier_id: string | null;
  status: string;
  pickup_address: Record<string, unknown> | null;
  delivery_address: Record<string, unknown> | null;
  estimated_distance_meters: number | null;
  estimated_duration_seconds: number | null;
  estimated_earnings: number | string | null;
  created_at: string;
  updated_at: string;
  orders?: {
    order_number?: number | string | null;
    total?: number | string | null;
    status?: string | null;
    payment_status?: string | null;
  } | null;
  merchants?: { name?: string | null } | null;
};

type CourierAvailability = {
  courier_id: string;
  is_online: boolean;
  online_since: string | null;
  last_seen_at: string | null;
  updated_at: string;
};

type CourierLocation = {
  courier_id: string;
  latitude: number | string;
  longitude: number | string;
  accuracy_meters: number | string | null;
  recorded_at: string;
};

type Courier = {
  id: string;
  user_id: string;
  status: string;
  is_active: boolean;
  vehicle_type: string | null;
  vehicle_model: string | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  is_active: boolean;
};

const from = (table: string) => (supabase.from as any)(table);
const browserKey = (import.meta as any).env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
const mapId = (import.meta as any).env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;
// The map only mounts with at least one recent valid courier position.
const fallbackMapCenter = { lat: -9.393912, lng: -40.492966 };
const courierPositionMaxAgeMs = 30 * 60 * 1000;
const courierPositionMaxAccuracyMeters = 200; // Matches the current production dispatch policy.


const activeStatuses = [
  "searching",
  "offered",
  "accepted",
  "arriving_pickup",
  "at_pickup",
  "picked_up",
  "on_the_way",
  "arrived_destination",
];
const pickupStatuses = ["accepted", "arriving_pickup", "at_pickup"];
const routeStatuses = ["picked_up", "on_the_way", "arrived_destination"];

const money = (value: unknown) =>
  `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;

const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    searching: "Buscando entregador",
    offered: "Oferta enviada",
    accepted: "Aceita",
    arriving_pickup: "A caminho da retirada",
    at_pickup: "Na retirada",
    picked_up: "Coletada",
    on_the_way: "Em rota",
    arrived_destination: "No destino",
    delivered: "Entregue",
    cancelled: "Cancelada",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

function addressText(value: Record<string, unknown> | null) {
  if (!value) return "—";
  const line =
    value["formatted"] ??
    value["address_line"] ??
    value["street"] ??
    value["address"] ??
    value["logradouro"];
  if (typeof line !== "string" || !line.trim()) return "Endereço cadastrado";
  const number = value["number"] ?? value["numero"];
  return typeof number === "string" || typeof number === "number" ? `${line}, ${number}` : line;
}

// Keep Google Maps failures isolated from the rest of the Admin operations page.
// Google Maps API loading and marker rendering depend on external browser services.
class AdminMapErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("APOIS Admin: Google Maps render failure", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="m-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Não foi possível abrir o Google Maps. O restante das operações permanece disponível.
          Confira o console do navegador e as permissões da chave Maps JavaScript.
        </div>
      );
    }
    return this.props.children;
  }
}

export function AdminRealtimeOperationsPanel() {
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const [positionClock, setPositionClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setPositionClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [jobs, setJobs] = useState<DeliveryJob[]>([]);
  const [availability, setAvailability] = useState<CourierAvailability[]>([]);
  const [locations, setLocations] = useState<CourierLocation[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setErrorMessage(null);
    try {
      const [jobsRes, availabilityRes, locationsRes, couriersRes, profilesRes] = await Promise.all([
        from("delivery_jobs")
          .select("*, orders(order_number,total,status,payment_status), merchants(name)")
          .in("status", activeStatuses)
          .order("updated_at", { ascending: false })
          .limit(300),
        from("courier_availability").select("*").order("updated_at", { ascending: false }),
        from("courier_locations").select("*").order("recorded_at", { ascending: false }),
        from("couriers").select("id,user_id,status,is_active,vehicle_type,vehicle_model"),
        from("profiles").select("id,full_name,is_active"),
      ]);
      const firstError = [jobsRes, availabilityRes, locationsRes, couriersRes, profilesRes].find(
        (result) => result.error,
      )?.error;
      if (firstError) throw firstError;
      setJobs((jobsRes.data ?? []) as DeliveryJob[]);
      setAvailability((availabilityRes.data ?? []) as CourierAvailability[]);
      setLocations((locationsRes.data ?? []) as CourierLocation[]);
      setCouriers((couriersRes.data ?? []) as Courier[]);
      setProfiles((profilesRes.data ?? []) as Profile[]);
    } catch (error: any) {
      console.error("admin realtime operations load failed", error);
      const message = error?.message || "Não foi possível carregar as operações em tempo real.";
      setErrorMessage(message);
      if (!quiet) toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // A location stream can emit many events per minute. Coalesce notifications
    // so that we do not refetch five tables for every single GPS update.
    let pendingRefresh: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (pendingRefresh !== null) return;
      pendingRefresh = setTimeout(() => {
        pendingRefresh = null;
        void load(true);
      }, 10_000);
    };
    const subscriptions = [
      { name: "admin_realtime_jobs", table: "delivery_jobs" },
      { name: "admin_realtime_availability", table: "courier_availability" },
      { name: "admin_realtime_locations", table: "courier_locations" },
      { name: "admin_realtime_orders", table: "orders" },
    ];
    const channels = subscriptions.map(({ name, table }) =>
      supabase
        .channel(name)
        .on("postgres_changes", { event: "*", schema: "public", table }, refresh)
        .subscribe((status, error) => {
          if (error) console.warn("APOIS Realtime subscription error:", table, status, error);
        }),
    );
    return () => {
      if (pendingRefresh !== null) clearTimeout(pendingRefresh);
      channels.forEach((channel) => void supabase.removeChannel(channel));
    };
  }, [load]);

  const courierById = useMemo(() => new Map(couriers.map((row) => [row.id, row])), [couriers]);
  const profileById = useMemo(() => new Map(profiles.map((row) => [row.id, row])), [profiles]);
  const availabilityByCourierId = useMemo(
    () => new Map(availability.map((row) => [row.courier_id, row])),
    [availability],
  );
  const onlineIds = useMemo(
    () =>
      new Set(
        availability
          .filter((row) => {
            if (!row.is_online) return false;
            const courier = courierById.get(row.courier_id);
            const profile = courier ? profileById.get(courier.user_id) : null;
            const lastSeenAt = Date.parse(row.last_seen_at ?? "");
            return courier?.status === "approved" && courier.is_active &&
              profile?.is_active === true &&
              Number.isFinite(lastSeenAt) &&
              lastSeenAt <= positionClock + 60_000 &&
              positionClock - lastSeenAt <= courierPositionMaxAgeMs;
          })
          .map((row) => row.courier_id),
      ),
    [availability, courierById, profileById, positionClock],
  );
  const onlineLocations = useMemo(
    () =>
      locations.filter((row) => {
        if (!onlineIds.has(row.courier_id)) return false;
        const availabilityRow = availabilityByCourierId.get(row.courier_id);
        const lat = Number(row.latitude);
        const lng = Number(row.longitude);
        const accuracy = row.accuracy_meters === null ? NaN : Number(row.accuracy_meters);
        const locationTime = Date.parse(row.recorded_at);
        const lastSeenTime = Date.parse(availabilityRow?.last_seen_at ?? row.recorded_at);
        const hasValidCoordinates =
          Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
          Number.isFinite(lng) && lng >= -180 && lng <= 180;
        const hasValidAccuracy =
          Number.isFinite(accuracy) && accuracy >= 0 &&
          accuracy <= courierPositionMaxAccuracyMeters;
        const hasRecentPosition =
          Number.isFinite(locationTime) && Number.isFinite(lastSeenTime) &&
          locationTime <= positionClock + 60_000 &&
          lastSeenTime <= positionClock + 60_000 &&
          positionClock - locationTime <= courierPositionMaxAgeMs &&
          positionClock - lastSeenTime <= courierPositionMaxAgeMs;
        return hasValidCoordinates && hasValidAccuracy && hasRecentPosition;
      }),
    [locations, onlineIds, availabilityByCourierId, positionClock],
  );
  const delayedJobs = useMemo(
    () => jobs.filter((job) => Date.now() - new Date(job.updated_at).getTime() > 45 * 60 * 1000),
    [jobs],
  );
  const mapCenter = useMemo(() => {
    const first = onlineLocations[0];
    return first
      ? { lat: Number(first.latitude), lng: Number(first.longitude) }
      : fallbackMapCenter;
  }, [onlineLocations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-3xl border border-zinc-900 bg-zinc-950 py-20 text-sm text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Carregando operação ao vivo...
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-red-300"
        role="alert"
      >
        <p className="font-bold">{errorMessage}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          className="mt-4 border-red-500/20"
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            Operação ao vivo
          </p>
          <h2 className="mt-1 text-xl font-black">Pedidos e entregadores em tempo real</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Localização e disponibilidade via Supabase Realtime; demais dados podem exigir atualização manual.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={refreshing}
          onClick={() => void load(true)}
          className="border-zinc-800 bg-zinc-950"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Pedidos ativos" value={jobs.length} />
        <MetricCard
          label="Aguardando coleta"
          value={jobs.filter((job) => pickupStatuses.includes(job.status)).length}
        />
        <MetricCard
          label="Em rota"
          value={jobs.filter((job) => routeStatuses.includes(job.status)).length}
        />
        <MetricCard label="Entregadores online" value={onlineIds.size} />
        <MetricCard label="Possíveis atrasos" value={delayedJobs.length} />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.4fr_1fr]">
        <section className="overflow-hidden rounded-3xl border border-zinc-900 bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-900 p-4">
            <div>
              <h3 className="font-black">Entregas em andamento</h3>
              <p className="text-xs text-zinc-500">Do aceite até a confirmação no destino.</p>
            </div>
            <Route className="h-5 w-5 text-primary" />
          </div>
          {jobs.length === 0 ? (
            <div className="p-5">
              <div role="status" className="rounded-2xl border border-zinc-200 bg-white px-6 py-10 text-center">
                <p className="text-base font-semibold text-zinc-950">Nenhuma entrega ativa</p>
                <p className="mt-2 text-sm text-zinc-700">
                  As entregas aparecerão aqui assim que entrarem no ciclo operacional.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-black text-[10px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="p-4">Pedido</th>
                    <th>Estabelecimento</th>
                    <th>Entregador</th>
                    <th>Status</th>
                    <th>Destino</th>
                    <th>Distância</th>
                    <th>Atualização</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {jobs.map((job) => {
                    const courier = job.courier_id ? courierById.get(job.courier_id) : null;
                    const profile = courier ? profileById.get(courier.user_id) : null;
                    const delayed = delayedJobs.some((row) => row.id === job.id);
                    return (
                      <tr key={job.id} className={delayed ? "bg-red-500/[0.04]" : undefined}>
                        <td className="p-4 font-black">
                          #{job.orders?.order_number ?? job.order_id.slice(0, 8)}
                        </td>
                        <td>{job.merchants?.name ?? "—"}</td>
                        <td>
                          <p className="font-bold">
                            {profile?.full_name ??
                              (job.courier_id ? `#${job.courier_id.slice(0, 8)}` : "Buscando")}
                          </p>
                          {courier ? (
                            <p className="text-[10px] text-zinc-600">
                              {courier.vehicle_type ?? "veículo"} {courier.vehicle_model ?? ""}
                            </p>
                          ) : null}
                        </td>
                        <td>
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase ${delayed ? "bg-red-500/10 text-red-300" : "bg-primary/10 text-primary"}`}
                          >
                            {statusLabel(job.status)}
                          </span>
                        </td>
                        <td
                          className="max-w-[240px] truncate text-xs text-zinc-400"
                          title={addressText(job.delivery_address)}
                        >
                          {addressText(job.delivery_address)}
                        </td>
                        <td>
                          {job.estimated_distance_meters
                            ? `${(job.estimated_distance_meters / 1000).toFixed(1).replace(".", ",")} km`
                            : "—"}
                        </td>
                        <td>
                          <p className="text-xs text-zinc-400">{dateTime(job.updated_at)}</p>
                          {delayed ? (
                            <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-red-300">
                              <Clock3 className="h-3 w-3" /> sem atualização há +45 min
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-3xl border border-zinc-900 bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-900 p-4">
            <div>
              <h3 className="font-black">Mapa dos entregadores</h3>
              <p className="text-xs text-zinc-500">
                Somente entregadores online com localização válida.
              </p>
            </div>
            <MapPinned className="h-5 w-5 text-primary" />
          </div>
          {onlineLocations.length === 0 ? (
            <div
              role="status"
              className="m-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700"
            >
              Nenhum entregador online com localização válida no momento. O mapa será carregado
              automaticamente somente quando houver uma posição disponível.
            </div>
          ) : !browserKey || !mapId || mapLoadFailed ? (
            <div
              role="alert"
              className="m-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
            >
              Google Maps indisponível neste ambiente. As operações e os indicadores continuam
              acessíveis. Verifique a chave Maps JavaScript, o Map ID e as mensagens no console
              do navegador.
            </div>
          ) : (
            <div className="h-[430px] bg-zinc-900">
              <AdminMapErrorBoundary>
                <APIProvider apiKey={browserKey} onError={(error) => {
                  console.error("APOIS Admin: Google Maps API load failure", error);
                  setMapLoadFailed(true);
                }}>
                <GoogleMap
                  defaultCenter={mapCenter}
                  defaultZoom={12}
                  mapId={mapId}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                >
                  {onlineLocations.map((location) => {
                    const courier = courierById.get(location.courier_id);
                    const profile = courier ? profileById.get(courier.user_id) : null;
                    return (
                      <AdvancedMarker
                        key={location.courier_id}
                        position={{
                          lat: Number(location.latitude),
                          lng: Number(location.longitude),
                        }}
                        title={profile?.full_name ?? "Entregador online"}
                      >
                        <div
                          className="grid h-9 w-9 place-items-center rounded-full border-2 border-black bg-primary text-black shadow-lg"
                          aria-label={profile?.full_name ?? "Entregador online"}
                        >
                          <Bike className="h-5 w-5" />
                        </div>
                      </AdvancedMarker>
                    );
                  })}
                </GoogleMap>
                </APIProvider>
              </AdminMapErrorBoundary>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 p-4">
            <div className="rounded-2xl bg-black p-3">
              <p className="flex items-center gap-1 text-[10px] font-black uppercase text-zinc-500">
                <Bike className="h-3 w-3" /> Online com posição
              </p>
              <p className="mt-1 text-xl font-black text-primary">{onlineLocations.length}</p>
            </div>
            <div className="rounded-2xl bg-black p-3">
              <p className="flex items-center gap-1 text-[10px] font-black uppercase text-zinc-500">
                <CircleAlert className="h-3 w-3" /> Sem posição recente
              </p>
              <p className="mt-1 text-xl font-black">
                {Math.max(0, onlineIds.size - onlineLocations.length)}
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-zinc-900 bg-zinc-950 p-5">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-5 w-5 text-primary" />
          <h3 className="font-black">Resumo financeiro das entregas ativas</h3>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MetricCard
            label="Valor dos pedidos"
            value={money(jobs.reduce((sum, job) => sum + Number(job.orders?.total ?? 0), 0))}
          />
          <MetricCard
            label="Ganhos estimados entregadores"
            value={money(jobs.reduce((sum, job) => sum + Number(job.estimated_earnings ?? 0), 0))}
          />
          <MetricCard
            label="Distância operacional"
            value={`${(jobs.reduce((sum, job) => sum + Number(job.estimated_distance_meters ?? 0), 0) / 1000).toFixed(1).replace(".", ",")} km`}
          />
        </div>
      </section>
    </div>
  );
}
