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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard } from "@/components/WorkspaceShell";
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
  vehicle_type: string | null;
  vehicle_model: string | null;
};

type Profile = {
  id: string;
  full_name: string | null;
};

const from = (table: string) => (supabase.from as any)(table);
const browserKey = (import.meta as any).env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
const mapId = (import.meta as any).env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;
// Approximate Petrolina/PE starting point for a manual Preview test only.
// Real courier positions always take precedence when available.
const previewDemoPositions = [
  { lat: -9.393912, lng: -40.492966 },
  { lat: -9.392172, lng: -40.490473 },
  { lat: -9.390602, lng: -40.487884 },
] as const;
const previewDemoPosition = previewDemoPositions[0];
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

export function AdminRealtimeOperationsPanel() {
  const [mapSmokeTestRequested, setMapSmokeTestRequested] = useState(false);
  const [previewSimulationStep, setPreviewSimulationStep] = useState(0);
  const previewSimulatedPosition = previewDemoPositions[previewSimulationStep];
  const [positionClock, setPositionClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setPositionClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  // Preview-only manual test. No maps are loaded without a courier unless an admin explicitly opts in.
  const enablePreviewMapSmokeTest = (import.meta as any).env.VITE_APOIS_MAPS_SMOKE_TEST === "true";
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
        from("couriers").select("id,user_id,vehicle_type,vehicle_model"),
        from("profiles").select("id,full_name"),
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
    const refresh = () => void load(true);
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
        .subscribe(),
    );
    return () => {
      channels.forEach((channel) => void supabase.removeChannel(channel));
    };
  }, [load]);

  const courierById = useMemo(() => new Map(couriers.map((row) => [row.id, row])), [couriers]);
  const profileById = useMemo(() => new Map(profiles.map((row) => [row.id, row])), [profiles]);
  const onlineIds = useMemo(
    () => new Set(availability.filter((row) => row.is_online).map((row) => row.courier_id)),
    [availability],
  );
  const onlineLocations = useMemo(
    () =>
      locations.filter((row) => {
        if (!onlineIds.has(row.courier_id)) return false;
        const availabilityRow = availability.find((entry) => entry.courier_id === row.courier_id);
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
    [locations, onlineIds, availability, positionClock],
  );
  const delayedJobs = useMemo(
    () => jobs.filter((job) => Date.now() - new Date(job.updated_at).getTime() > 45 * 60 * 1000),
    [jobs],
  );
  const mapCenter = useMemo(() => {
    const first = onlineLocations[0];
    return first
      ? { lat: Number(first.latitude), lng: Number(first.longitude) }
      : previewDemoPosition;
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
            Atualização por Supabase Realtime, limitada a administradores autorizados.
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
              <EmptyState
                title="Nenhuma entrega ativa"
                description="As entregas aparecerão aqui assim que entrarem no ciclo operacional."
              />
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
          {onlineLocations.length === 0 && !mapSmokeTestRequested ? (
            <div
              role="status"
              className="m-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700"
            >
              Nenhum entregador online com localização válida no momento. O mapa será carregado
              automaticamente somente quando houver uma posição disponível.
              {enablePreviewMapSmokeTest && browserKey && mapId ? (
                <div className="mt-3">
                  <Button type="button" variant="outline" onClick={() => setMapSmokeTestRequested(true)}>
                    Testar mapa e marcador simulado (pode gerar cobrança)
                  </Button>
                  <p className="mt-2 text-xs text-zinc-600">
                    Teste manual sem colocar entregadores online ou criar pedidos.
                  </p>
                </div>
              ) : null}
            </div>
          ) : !browserKey || !mapId ? (
            <div
              role="alert"
              className="m-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
            >
              Mapa operacional indisponível. Verifique as configurações de Maps JavaScript no
              ambiente de publicação.
            </div>
          ) : (
            <div className="h-[430px] bg-zinc-900">
              <APIProvider apiKey={browserKey}>
                <GoogleMap
                  defaultCenter={mapCenter}
                  defaultZoom={12}
                  mapId={mapId}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                >
                  {enablePreviewMapSmokeTest && mapSmokeTestRequested && onlineLocations.length === 0 ? (
                    <AdvancedMarker position={previewSimulatedPosition} title="SIMULAÇÃO — não é entregador real">
                      <div className="flex flex-col items-center gap-1 rounded-lg border-2 border-red-600 bg-white px-2 py-1 text-center text-xs font-black text-red-700 shadow-md">
                        <MapPinned className="h-5 w-5" aria-hidden="true" />
                        SIMULAÇÃO
                      </div>
                    </AdvancedMarker>
                  ) : null}
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
            </div>
          )}
          {enablePreviewMapSmokeTest && mapSmokeTestRequested && onlineLocations.length === 0 ? (
            <div className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <p role="status" className="font-semibold">
                SIMULAÇÃO DE HOMOLOGAÇÃO — marcador fictício em Petrolina/PE.
                Não há entregador online e nenhuma localização real foi alterada.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-400 bg-white text-red-800 hover:bg-red-100"
                  onClick={() => setPreviewSimulationStep((step) => (step + 1) % previewDemoPositions.length)}
                >
                  Mover marcador simulado
                </Button>
                <span className="text-xs font-semibold">
                  Posição simulada {previewSimulationStep + 1} de {previewDemoPositions.length}.
                  Sem alterações no Supabase.
                </span>
              </div>
            </div>
          ) : null}
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
