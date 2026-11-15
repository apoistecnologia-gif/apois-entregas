import {
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Truck,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard } from "@/components/WorkspaceShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
};

type Courier = {
  id: string;
  user_id: string;
  vehicle_type: string | null;
  vehicle_model: string | null;
};

type DeliveryJob = {
  id: string;
  order_id: string;
  courier_id: string | null;
  status: string;
  estimated_distance_meters: number | null;
  estimated_duration_seconds: number | null;
  estimated_earnings: number | string | null;
  created_at: string;
  updated_at: string;
};

type Payment = {
  id: string;
  status: string;
  amount: number | string;
  provider: string | null;
  provider_charge_id: string | null;
  created_at?: string;
  paid_at?: string | null;
  failed_at?: string | null;
};

type Merchant = {
  id?: string;
  name?: string | null;
  city?: string | null;
  state?: string | null;
};

type Order = {
  id: string;
  order_number: number | string;
  customer_user_id: string;
  merchant_id: string;
  status: string;
  payment_method: string;
  payment_status: string;
  subtotal: number | string;
  delivery_fee: number | string;
  service_fee?: number | string | null;
  platform_fee?: number | string | null;
  discount: number | string;
  total: number | string;
  merchant_net?: number | string | null;
  courier_earnings?: number | string | null;
  fulfillment_type?: string | null;
  delivery_address: Record<string, unknown> | null;
  observation: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  accepted_at?: string | null;
  ready_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  merchants?: Merchant | null;
  payments?: Payment[] | null;
};

type TimelineEntry = {
  id: string;
  source: "order" | "delivery" | "payment" | "refund";
  label: string;
  status: string | null;
  createdAt: string;
  detail?: string | null;
};

const from = (table: string) => (supabase.from as any)(table);

const money = (value: unknown) =>
  `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;

const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

function statusLabel(value: string | null | undefined) {
  if (!value) return "—";
  const labels: Record<string, string> = {
    pending_payment: "Aguardando pagamento",
    paid: "Pago",
    confirmed: "Confirmado",
    accepted: "Aceito",
    preparing: "Em preparo",
    ready: "Pronto",
    ready_for_pickup: "Pronto para coleta",
    searching_driver: "Buscando entregador",
    driver_assigned: "Entregador atribuído",
    driver_arriving_store: "Entregador chegando",
    picked_up: "Coletado",
    out_for_delivery: "Saiu para entrega",
    on_the_way: "Em rota",
    delivered: "Entregue",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
    searching: "Buscando entregador",
    offered: "Oferta enviada",
    arriving_pickup: "A caminho da retirada",
    at_pickup: "Na retirada",
    arrived_destination: "No destino",
    approved: "Aprovado",
    rejected: "Rejeitado",
    pending: "Pendente",
    failed: "Falhou",
    processing: "Processando",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function addressText(value: Record<string, unknown> | null) {
  if (!value) return "—";
  const street = value["street"] ?? value["address_line"] ?? value["logradouro"];
  const number = value["number"] ?? value["numero"];
  const neighborhood = value["neighborhood"] ?? value["bairro"];
  const city = value["city"] ?? value["cidade"];
  const state = value["state"] ?? value["uf"];
  return [
    typeof street === "string" ? street : null,
    typeof number === "string" || typeof number === "number" ? String(number) : null,
    typeof neighborhood === "string" ? neighborhood : null,
    typeof city === "string" ? city : null,
    typeof state === "string" ? state : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function StatusPill({ value }: { value: string | null | undefined }) {
  const status = value ?? "unknown";
  const positive = [
    "paid",
    "approved",
    "delivered",
    "refunded",
    "ready",
    "ready_for_pickup",
  ].includes(status);
  const negative = ["cancelled", "failed", "rejected"].includes(status);
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase ${
        negative
          ? "bg-red-500/10 text-red-300"
          : positive
            ? "bg-emerald-500/10 text-emerald-300"
            : "bg-primary/10 text-primary"
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

export function AdminOrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [jobs, setJobs] = useState<DeliveryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const requestInFlightRef = useRef(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const load = useCallback(async (quiet = false) => {
    // Avoid overlapping responses from manual refresh and bounded fallback polling.
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const [ordersRes, profilesRes, couriersRes, jobsRes] = await Promise.all([
        from("orders")
          .select(
            "*, merchants(id,name,city,state), payments(id,status,amount,provider,provider_charge_id,created_at,paid_at,failed_at)",
          )
          .order("created_at", { ascending: false })
          .limit(1000),
        from("profiles").select("id,full_name,phone").limit(1000),
        from("couriers").select("id,user_id,vehicle_type,vehicle_model").limit(500),
        from("delivery_jobs")
          .select(
            "id,order_id,courier_id,status,estimated_distance_meters,estimated_duration_seconds,estimated_earnings,created_at,updated_at",
          )
          .order("updated_at", { ascending: false })
          .limit(1000),
      ]);
      const firstError = [ordersRes, profilesRes, couriersRes, jobsRes].find(
        (result) => result.error,
      )?.error;
      if (firstError) throw firstError;
      setOrders((ordersRes.data ?? []) as Order[]);
      setProfiles((profilesRes.data ?? []) as Profile[]);
      setCouriers((couriersRes.data ?? []) as Courier[]);
      setJobs((jobsRes.data ?? []) as DeliveryJob[]);
      setLastUpdatedAt(new Date().toISOString());
      setRefreshWarning(null);
    } catch (error: any) {
      console.error("admin orders load failed", error);
      if (quiet) {
        setRefreshWarning("Não foi possível obter a atualização mais recente. A leitura anterior permanece disponível.");
      } else {
        toast.error(error?.message || "Não foi possível carregar os pedidos.");
      }
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // These tables are not in Supabase's Realtime publication.
    // Read-only fallback covers orders, payment and delivery state changes.
    const refresh = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = window.setInterval(refresh, 45_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const profileById = useMemo(() => new Map(profiles.map((row) => [row.id, row])), [profiles]);
  const courierById = useMemo(() => new Map(couriers.map((row) => [row.id, row])), [couriers]);
  const jobByOrder = useMemo(() => {
    const map = new Map<string, DeliveryJob>();
    jobs.forEach((job) => {
      if (!map.has(job.order_id)) map.set(job.order_id, job);
    });
    return map;
  }, [jobs]);

  const cities = useMemo(
    () =>
      Array.from(
        new Set(
          orders
            .map((order) => order.merchants?.city?.trim())
            .filter((city): city is string => Boolean(city)),
        ),
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [orders],
  );

  const statuses = useMemo(
    () => Array.from(new Set(orders.map((order) => order.status))).sort(),
    [orders],
  );
  const paymentStatuses = useMemo(
    () => Array.from(new Set(orders.map((order) => order.payment_status))).sort(),
    [orders],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const start = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const end = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    return orders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (paymentFilter !== "all" && order.payment_status !== paymentFilter) return false;
      if (cityFilter !== "all" && order.merchants?.city !== cityFilter) return false;
      const created = new Date(order.created_at).getTime();
      if (start !== null && created < start) return false;
      if (end !== null && created > end) return false;
      if (!normalized) return true;

      const customer = profileById.get(order.customer_user_id);
      const job = jobByOrder.get(order.id);
      const courier = job?.courier_id ? courierById.get(job.courier_id) : null;
      const courierProfile = courier ? profileById.get(courier.user_id) : null;
      return [
        order.id,
        order.order_number,
        order.customer_user_id,
        customer?.full_name,
        customer?.phone,
        order.merchants?.name,
        order.merchants?.city,
        courier?.id,
        courierProfile?.full_name,
        order.status,
        order.payment_status,
      ]
        .filter((value) => value !== null && value !== undefined)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [
    cityFilter,
    courierById,
    dateFrom,
    dateTo,
    jobByOrder,
    orders,
    paymentFilter,
    profileById,
    query,
    statusFilter,
  ]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );
  const selectedJob = selectedOrder ? (jobByOrder.get(selectedOrder.id) ?? null) : null;

  const loadTimeline = useCallback(async (order: Order) => {
    setTimelineLoading(true);
    try {
      const jobRes = await from("delivery_jobs")
        .select("id")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (jobRes.error) throw jobRes.error;
      const jobId = jobRes.data?.id ?? null;
      const [historyRes, eventsRes, refundsRes] = await Promise.all([
        from("order_status_history")
          .select("id,status,created_at")
          .eq("order_id", order.id)
          .order("created_at"),
        jobId
          ? from("delivery_events")
              .select("id,event_type,from_status,to_status,created_at")
              .eq("delivery_job_id", jobId)
              .order("created_at")
          : Promise.resolve({ data: [], error: null }),
        from("refunds")
          .select("id,status,amount,reason,created_at,processed_at")
          .eq("order_id", order.id)
          .order("created_at"),
      ]);
      const firstError = [historyRes, eventsRes, refundsRes].find((result) => result.error)?.error;
      if (firstError) throw firstError;
      const entries: TimelineEntry[] = [];
      for (const row of historyRes.data ?? []) {
        entries.push({
          id: `order:${row.id}`,
          source: "order",
          label: "Status do pedido",
          status: row.status,
          createdAt: row.created_at,
        });
      }
      for (const row of eventsRes.data ?? []) {
        entries.push({
          id: `delivery:${row.id}`,
          source: "delivery",
          label: row.event_type ? statusLabel(row.event_type) : "Evento de entrega",
          status: row.to_status ?? null,
          detail: row.from_status
            ? `${statusLabel(row.from_status)} → ${statusLabel(row.to_status)}`
            : null,
          createdAt: row.created_at,
        });
      }
      for (const payment of order.payments ?? []) {
        entries.push({
          id: `payment:${payment.id}`,
          source: "payment",
          label: `Pagamento ${payment.provider || order.payment_method || ""}`.trim(),
          status: payment.status,
          detail: `${money(payment.amount)}${payment.provider_charge_id ? ` · ${payment.provider_charge_id}` : ""}`,
          createdAt: payment.paid_at || payment.failed_at || payment.created_at || order.created_at,
        });
      }
      for (const row of refundsRes.data ?? []) {
        entries.push({
          id: `refund:${row.id}`,
          source: "refund",
          label: "Reembolso",
          status: row.status,
          detail: `${money(row.amount)}${row.reason ? ` · ${row.reason}` : ""}`,
          createdAt: row.processed_at || row.created_at,
        });
      }
      entries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setTimeline(entries);
    } catch (error: any) {
      console.error("admin order timeline load failed", error);
      setTimeline([]);
      toast.error(error?.message || "Não foi possível carregar a timeline do pedido.");
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  const toggleOrder = async (order: Order) => {
    if (selectedOrderId === order.id) {
      setSelectedOrderId(null);
      setTimeline([]);
      return;
    }
    setSelectedOrderId(order.id);
    await loadTimeline(order);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-3xl border border-zinc-900 bg-zinc-950 py-20 text-sm text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Carregando pedidos...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            Investigação operacional
          </p>
          <h2 className="mt-1 text-xl font-black">Pedidos</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Busca, filtros e timeline integral de pedido, pagamento, entrega e reembolso.
            Atualização automática a cada 45 segundos enquanto a aba estiver visível.
          </p>
          {lastUpdatedAt ? (
            <div role="status" aria-live="polite" className="mt-3 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm">
              <span className="inline-flex items-center gap-2 text-primary">
                <RefreshCw className="h-4 w-4" />
                Atualização automática ativa
              </span>
              <time dateTime={lastUpdatedAt} className="tabular-nums text-zinc-900">
                Última leitura: {dateTime(lastUpdatedAt)}
              </time>
            </div>
          ) : null}
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

      {refreshWarning ? (
        <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {refreshWarning}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pedidos carregados" value={orders.length} />
        <MetricCard label="Resultado atual" value={filtered.length} />
        <MetricCard
          label="Em operação"
          value={
            orders.filter((order) => !["delivered", "cancelled", "refunded"].includes(order.status))
              .length
          }
        />
        <MetricCard
          label="Volume do resultado"
          value={money(filtered.reduce((sum, order) => sum + Number(order.total || 0), 0))}
        />
      </div>

      <section className="space-y-3 rounded-3xl border border-zinc-900 bg-zinc-950 p-4">
        <label className="relative block">
          <span className="sr-only">Buscar pedido</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pedido, UUID, cliente, estabelecimento, entregador ou cidade"
            className="w-full rounded-xl border border-zinc-800 bg-black py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-primary"
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-sm"
          >
            <option value="all">Todos os status</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
          <select
            value={paymentFilter}
            onChange={(event) => setPaymentFilter(event.target.value)}
            className="rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-sm"
          >
            <option value="all">Todos os pagamentos</option>
            {paymentStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
          <select
            value={cityFilter}
            onChange={(event) => setCityFilter(event.target.value)}
            className="rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-sm"
          >
            <option value="all">Todas as cidades</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
          <label className="text-[10px] font-black uppercase text-zinc-600">
            De
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-[10px] font-black uppercase text-zinc-600">
            Até
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum pedido encontrado"
          description="Ajuste a busca ou os filtros informados."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => {
            const customer = profileById.get(order.customer_user_id);
            const job = jobByOrder.get(order.id);
            const courier = job?.courier_id ? courierById.get(job.courier_id) : null;
            const courierProfile = courier ? profileById.get(courier.user_id) : null;
            const expanded = selectedOrderId === order.id;
            return (
              <article
                key={order.id}
                className="overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950"
              >
                <button
                  type="button"
                  onClick={() => void toggleOrder(order)}
                  className="grid w-full gap-3 p-4 text-left md:grid-cols-[110px_1.2fr_1fr_1fr_120px_36px] md:items-center"
                >
                  <div>
                    <p className="font-black">#{order.order_number}</p>
                    <p className="mt-1 font-mono text-[9px] text-zinc-700">
                      {order.id.slice(0, 12)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold">{order.merchants?.name ?? "—"}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {order.merchants?.city ?? "—"}/{order.merchants?.state ?? ""}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {customer?.full_name ?? `Cliente ${order.customer_user_id.slice(0, 8)}`}
                    </p>
                    <p className="truncate text-xs text-zinc-600">
                      {courierProfile?.full_name
                        ? `Entregador: ${courierProfile.full_name}`
                        : "Sem entregador atribuído"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusPill value={order.status} />
                    <StatusPill value={order.payment_status} />
                  </div>
                  <div>
                    <p className="font-black text-primary">{money(order.total)}</p>
                    <p className="text-[10px] text-zinc-600">{dateTime(order.created_at)}</p>
                  </div>
                  {expanded ? (
                    <ChevronUp className="h-5 w-5 text-zinc-600" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-zinc-600" />
                  )}
                </button>

                {expanded ? (
                  <div className="border-t border-zinc-900 bg-black/50 p-4">
                    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-black p-4">
                            <p className="flex items-center gap-1 text-[10px] font-black uppercase text-zinc-600">
                              <UserRound className="h-3.5 w-3.5" /> Cliente
                            </p>
                            <p className="mt-2 font-bold">
                              {customer?.full_name ?? "Nome não disponível"}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {customer?.phone ?? order.customer_user_id}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-black p-4">
                            <p className="flex items-center gap-1 text-[10px] font-black uppercase text-zinc-600">
                              <Truck className="h-3.5 w-3.5" /> Entregador
                            </p>
                            <p className="mt-2 font-bold">
                              {courierProfile?.full_name ?? "Não atribuído"}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {courier
                                ? [courier.vehicle_type, courier.vehicle_model]
                                    .filter(Boolean)
                                    .join(" · ")
                                : "—"}
                            </p>
                          </div>
                        </div>
                        <div className="rounded-2xl bg-black p-4">
                          <p className="flex items-center gap-1 text-[10px] font-black uppercase text-zinc-600">
                            <MapPin className="h-3.5 w-3.5" /> Entrega
                          </p>
                          <p className="mt-2 text-sm text-zinc-300">
                            {order.fulfillment_type === "pickup"
                              ? "Retirada no estabelecimento"
                              : addressText(order.delivery_address)}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <div className="rounded-2xl bg-black p-4">
                            <p className="text-[10px] font-black uppercase text-zinc-600">
                              Subtotal
                            </p>
                            <p className="mt-1 font-black">{money(order.subtotal)}</p>
                          </div>
                          <div className="rounded-2xl bg-black p-4">
                            <p className="text-[10px] font-black uppercase text-zinc-600">
                              Entrega
                            </p>
                            <p className="mt-1 font-black">{money(order.delivery_fee)}</p>
                          </div>
                          <div className="rounded-2xl bg-black p-4">
                            <p className="text-[10px] font-black uppercase text-zinc-600">
                              Desconto
                            </p>
                            <p className="mt-1 font-black">{money(order.discount)}</p>
                          </div>
                          <div className="rounded-2xl bg-black p-4">
                            <p className="text-[10px] font-black uppercase text-zinc-600">
                              Plataforma
                            </p>
                            <p className="mt-1 font-black">
                              {money(order.platform_fee ?? order.service_fee)}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-black p-4">
                            <p className="text-[10px] font-black uppercase text-zinc-600">
                              Repasse parceiro
                            </p>
                            <p className="mt-1 font-black">{money(order.merchant_net)}</p>
                          </div>
                          <div className="rounded-2xl bg-black p-4">
                            <p className="text-[10px] font-black uppercase text-zinc-600">
                              Entregador
                            </p>
                            <p className="mt-1 font-black text-primary">
                              {money(order.courier_earnings ?? selectedJob?.estimated_earnings)}
                            </p>
                          </div>
                        </div>
                        {order.observation || order.cancellation_reason ? (
                          <div className="rounded-2xl border border-zinc-900 bg-black p-4 text-sm text-zinc-400">
                            {order.observation ? (
                              <p>
                                <strong className="text-zinc-200">Observação:</strong>{" "}
                                {order.observation}
                              </p>
                            ) : null}
                            {order.cancellation_reason ? (
                              <p className="mt-2 text-red-300">
                                <strong>Cancelamento:</strong> {order.cancellation_reason}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
                        <div className="flex items-center gap-2">
                          <Clock3 className="h-4 w-4 text-primary" />
                          <h3 className="font-black">Timeline integral</h3>
                        </div>
                        {timelineLoading ? (
                          <div className="flex items-center gap-2 py-8 text-sm text-zinc-500">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Carregando
                            timeline...
                          </div>
                        ) : timeline.length === 0 ? (
                          <div className="py-8 text-sm text-zinc-600">
                            Nenhum evento adicional registrado.
                          </div>
                        ) : (
                          <ol className="mt-4 space-y-3">
                            {timeline.map((entry) => (
                              <li key={entry.id} className="relative border-l border-zinc-800 pl-4">
                                <span className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-primary" />
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-bold">{entry.label}</p>
                                  <p className="text-[10px] text-zinc-600">
                                    {dateTime(entry.createdAt)}
                                  </p>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  {entry.status ? <StatusPill value={entry.status} /> : null}
                                  <span className="text-[9px] font-black uppercase tracking-wide text-zinc-700">
                                    {entry.source}
                                  </span>
                                </div>
                                {entry.detail ? (
                                  <p className="mt-1 text-xs text-zinc-500">{entry.detail}</p>
                                ) : null}
                              </li>
                            ))}
                          </ol>
                        )}
                      </section>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
