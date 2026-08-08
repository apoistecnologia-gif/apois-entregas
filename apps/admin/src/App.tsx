import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  Bike,
  Building2,
  CircleDollarSign,
  ClipboardList,
  Headphones,
  LayoutDashboard,
  Loader2,
  LogOut,
  MapPinned,
  RefreshCw,
  Settings,
  ShieldCheck,
  Store,
  Tags,
  TicketCheck,
  Users,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Session } from "@supabase/supabase-js";
import { requireSupabase, supabaseConfigured } from "./supabase";

type Page =
  | "overview"
  | "orders"
  | "partners"
  | "users"
  | "operations"
  | "finance"
  | "support"
  | "settings";

type OrderRow = {
  id: string;
  order_number: number;
  status: string;
  total: number;
  payment_method: string;
  payment_status: string;
  created_at: string;
  merchant_id: string;
  customer_user_id: string | null;
};
type MerchantRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  is_active: boolean;
  approval_status: string;
  rating: number;
  review_count: number;
};
type CourierRow = {
  id: string;
  user_id: string;
  status: string;
  is_active: boolean;
  rating: number;
  review_count: number;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  created_at: string;
};
type AvailabilityRow = { courier_id: string; is_online: boolean; last_seen_at: string };
type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  blocked_reason: string | null;
  created_at: string;
};
type SupportRow = {
  id: string;
  requester_user_id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  assigned_admin_id: string | null;
};
type PaymentRow = {
  id: string;
  order_id: string;
  provider: string;
  status: string;
  method: string;
  amount: number;
  created_at: string;
};
type WalletRow = {
  id: string;
  owner_type: string;
  balance: number;
  available_balance: number;
  reserved_balance: number;
  is_blocked: boolean;
};
type PayoutRow = {
  id: string;
  wallet_id: string;
  amount: number;
  status: string;
  provider: string | null;
  requested_at: string;
};
type DeliveryRow = {
  id: string;
  order_id: string;
  merchant_id: string;
  courier_id: string | null;
  status: string;
  created_at: string;
  estimated_earnings: number;
};
type AdminData = {
  orders: OrderRow[];
  merchants: MerchantRow[];
  couriers: CourierRow[];
  availability: AvailabilityRow[];
  profiles: ProfileRow[];
  support: SupportRow[];
  payments: PaymentRow[];
  wallets: WalletRow[];
  payouts: PayoutRow[];
  deliveries: DeliveryRow[];
};
type CityRow = {
  id: string;
  name: string;
  state: string;
  slug: string;
  is_active: boolean;
  default_delivery_radius_km: number;
};
type FeeRuleRow = {
  id: string;
  city_id: string | null;
  merchant_id: string | null;
  name: string;
  is_active: boolean;
  customer_service_fee: number;
  merchant_commission_percent: number;
  courier_base_fee: number;
  courier_per_km: number;
  courier_minimum_fee: number;
};

const emptyData: AdminData = {
  orders: [],
  merchants: [],
  couriers: [],
  availability: [],
  profiles: [],
  support: [],
  payments: [],
  wallets: [],
  payouts: [],
  deliveries: [],
};
const statusColors = ["#39d353", "#f7bd13", "#5595ff", "#ff5c57", "#9a6bff", "#8a8c91"];

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function shortId(value: string) {
  return value.slice(0, 8);
}
function statusClass(status: string) {
  if (["delivered", "paid", "approved", "active", "resolved", "closed"].includes(status)) return "good";
  if (["cancelled", "failed", "blocked", "rejected", "critical"].includes(status)) return "bad";
  return "warn";
}

const nav: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "orders", label: "Pedidos", icon: ClipboardList },
  { id: "partners", label: "Estabelecimentos / Entregadores", icon: Store },
  { id: "users", label: "Usuários", icon: Users },
  { id: "operations", label: "Operações em tempo real", icon: MapPinned },
  { id: "finance", label: "Financeiro", icon: CircleDollarSign },
  { id: "support", label: "Suporte", icon: Headphones },
  { id: "settings", label: "Configurações", icon: Settings },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [page, setPage] = useState<Page>("overview");
  const [data, setData] = useState<AdminData>(emptyData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) {
      setAuthChecked(true);
      return;
    }
    const client = requireSupabase();
    void client.auth.getSession().then(({ data: auth }) => {
      setSession(auth.session);
      setAuthChecked(true);
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setIsAdmin(false);
      return;
    }
    void requireSupabase()
      .rpc("current_user_is_admin")
      .then(({ data: allowed, error: rpcError }) => {
        if (rpcError) {
          console.error("admin gate", rpcError.code);
          setIsAdmin(false);
          return;
        }
        setIsAdmin(Boolean(allowed));
      });
  }, [session]);

  const loadData = useCallback(async () => {
    if (!session || !isAdmin) return;
    setLoading(true);
    setError(null);
    const client = requireSupabase();
    try {
      const [orders, merchants, couriers, availability, profiles, support, payments, wallets, payouts, deliveries] =
        await Promise.all([
          client
            .from("orders")
            .select("id,order_number,status,total,payment_method,payment_status,created_at,merchant_id,customer_user_id")
            .order("created_at", { ascending: false })
            .limit(500),
          client
            .from("merchants")
            .select("id,name,city,state,is_active,approval_status,rating,review_count")
            .order("created_at", { ascending: false }),
          client
            .from("couriers")
            .select("id,user_id,status,is_active,rating,review_count,vehicle_type,vehicle_plate,created_at")
            .order("created_at", { ascending: false }),
          client.from("courier_availability").select("courier_id,is_online,last_seen_at"),
          client
            .from("profiles")
            .select("id,full_name,phone,is_active,blocked_reason,created_at")
            .order("created_at", { ascending: false })
            .limit(500),
          client
            .from("support_tickets")
            .select("id,requester_user_id,subject,category,status,priority,created_at,assigned_admin_id")
            .order("created_at", { ascending: false })
            .limit(200),
          client
            .from("payments")
            .select("id,order_id,provider,status,method,amount,created_at")
            .order("created_at", { ascending: false })
            .limit(500),
          client.from("wallets").select("id,owner_type,balance,available_balance,reserved_balance,is_blocked"),
          client
            .from("payouts")
            .select("id,wallet_id,amount,status,provider,requested_at")
            .order("requested_at", { ascending: false })
            .limit(200),
          client
            .from("delivery_jobs")
            .select("id,order_id,merchant_id,courier_id,status,created_at,estimated_earnings")
            .order("created_at", { ascending: false })
            .limit(500),
        ]);

      const results = [orders, merchants, couriers, availability, profiles, support, payments, wallets, payouts, deliveries];
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;

      setData({
        orders: (orders.data ?? []) as OrderRow[],
        merchants: (merchants.data ?? []) as MerchantRow[],
        couriers: (couriers.data ?? []) as CourierRow[],
        availability: (availability.data ?? []) as AvailabilityRow[],
        profiles: (profiles.data ?? []) as ProfileRow[],
        support: (support.data ?? []) as SupportRow[],
        payments: (payments.data ?? []) as PaymentRow[],
        wallets: (wallets.data ?? []) as WalletRow[],
        payouts: (payouts.data ?? []) as PayoutRow[],
        deliveries: (deliveries.data ?? []) as DeliveryRow[],
      });
    } catch (loadError) {
      console.error("admin data", loadError instanceof Error ? loadError.message : "unknown");
      setError("Não foi possível carregar todos os dados administrativos.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, session]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!session || !isAdmin) return;
    const client = requireSupabase();
    const channel = client
      .channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_jobs" }, () => void loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => void loadData())
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [isAdmin, loadData, session]);

  if (!supabaseConfigured) return <ConfigMissing />;
  if (!authChecked) return <FullLoader />;
  if (!session) return <Login />;
  if (!isAdmin) return <Denied onLogout={() => void requireSupabase().auth.signOut()} />;

  return (
    <Shell
      page={page}
      onPage={setPage}
      onLogout={() => void requireSupabase().auth.signOut()}
      loading={loading}
      onRefresh={() => void loadData()}
    >
      {error && <div className="error">{error}</div>}
      {page === "overview" && <Overview data={data} />}
      {page === "orders" && <Orders data={data} />}
      {page === "partners" && <Partners data={data} refresh={loadData} />}
      {page === "users" && <UserManagement data={data} refresh={loadData} />}
      {page === "operations" && <Operations data={data} />}
      {page === "finance" && <Finance data={data} />}
      {page === "support" && <Support data={data} refresh={loadData} />}
      {page === "settings" && <SettingsPage />}
    </Shell>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: authError } = await requireSupabase().auth.signInWithPassword({ email, password });
    if (authError) setError("E-mail, senha ou permissão inválidos.");
    setBusy(false);
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand"><span className="brand-mark">A</span><span>APOIS ENTREGAS</span></div>
        <h1>Painel Administrativo</h1>
        <p className="muted">Acesso exclusivo para administradores autorizados.</p>
        <form onSubmit={submit}>
          <div className="field"><label>E-mail</label><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div className="field"><label>Senha</label><input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          {error && <div className="error">{error}</div>}
          <button className="primary" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button>
        </form>
      </div>
    </div>
  );
}

function ConfigMissing() {
  return <div className="login"><div className="login-card"><div className="brand">APOIS ENTREGAS</div><h1>Ambiente não configurado</h1><p className="muted">Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY neste ambiente.</p></div></div>;
}
function FullLoader() {
  return <div className="login"><Loader2 className="gold" size={36} /></div>;
}
function Denied({ onLogout }: { onLogout: () => void }) {
  return <div className="login"><div className="login-card"><ShieldCheck className="gold" /><h1>Acesso não autorizado</h1><p className="muted">Sua conta não possui a função administrativa no banco.</p><button className="secondary" onClick={onLogout}>Sair</button></div></div>;
}

function Shell({
  page,
  onPage,
  onLogout,
  loading,
  onRefresh,
  children,
}: {
  page: Page;
  onPage: (page: Page) => void;
  onLogout: () => void;
  loading: boolean;
  onRefresh: () => void;
  children: ReactNode;
}) {
  const title = nav.find((item) => item.id === page)?.label ?? "Painel Administrativo";
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">A</span><span>APOIS ENTREGAS</span></div>
        <div className="nav">
          {nav.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => onPage(item.id)}><Icon size={18} />{item.label}</button>;
          })}
        </div>
        <div className="sidebar-foot">
          <b>Ambiente administrativo</b>
          <p>Permissões validadas no Supabase e ações sensíveis auditadas.</p>
          <button className="secondary" onClick={onLogout}><LogOut size={14} /> Sair</button>
        </div>
      </aside>
      <main className="main">
        <header className="header">
          <div><h1>{title}</h1><p>Supervisão operacional do ecossistema APOIS ENTREGAS.</p></div>
          <div className="header-actions">
            <button className="control" onClick={onRefresh} disabled={loading}><RefreshCw size={16} /> {loading ? "Atualizando" : "Atualizar"}</button>
            <span className="pill"><Bell size={16} /></span>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function Overview({ data }: { data: AdminData }) {
  const activeOrders = data.orders.filter((order) => !["delivered", "cancelled", "refunded"].includes(order.status)).length;
  const online = new Set(data.availability.filter((item) => item.is_online).map((item) => item.courier_id)).size;
  const revenue = data.payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + Number(payment.amount), 0);
  const openSupport = data.support.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length;
  const orderStatus = useMemo(
    () =>
      Object.entries(
        data.orders.reduce<Record<string, number>>((acc, order) => {
          acc[order.status] = (acc[order.status] ?? 0) + 1;
          return acc;
        }, {}),
      ).map(([name, value]) => ({ name, value })),
    [data.orders],
  );
  const trend = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return {
        day: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date),
        pedidos: data.orders.filter((order) => order.created_at.slice(0, 10) === key).length,
      };
    });
  }, [data.orders]);

  return (
    <>
      <div className="kpis">
        <Kpi icon={ClipboardList} label="Total de pedidos" value={String(data.orders.length)} />
        <Kpi icon={Bike} label="Pedidos em andamento" value={String(activeOrders)} />
        <Kpi icon={CircleDollarSign} label="Pagamentos confirmados" value={money(revenue)} />
        <Kpi icon={Bike} label="Entregadores online" value={String(online)} />
        <Kpi icon={Building2} label="Estabelecimentos ativos" value={String(data.merchants.filter((merchant) => merchant.is_active).length)} />
        <Kpi icon={AlertTriangle} label="Alertas de suporte" value={String(openSupport)} />
      </div>
      <div className="grid">
        <div className="stack">
          <section className="card section">
            <div className="section-title"><h2>Resumo de pedidos</h2><span className="muted">Últimos 7 dias</span></div>
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs><linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f7bd13" stopOpacity={0.35} /><stop offset="100%" stopColor="#f7bd13" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke="#202124" vertical={false} />
                  <XAxis dataKey="day" stroke="#777" fontSize={11} />
                  <YAxis stroke="#777" allowDecimals={false} fontSize={11} />
                  <Tooltip contentStyle={{ background: "#111", border: "1px solid #333" }} />
                  <Area dataKey="pedidos" stroke="#f7bd13" fill="url(#goldFill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
          <RecentOrders orders={data.orders} merchants={data.merchants} />
        </div>
        <section className="card section">
          <div className="section-title"><h2>Pedidos por status</h2></div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={orderStatus} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80}>
                  {orderStatus.map((_entry, index) => <Cell key={index} fill={statusColors[index % statusColors.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#111", border: "1px solid #333" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="list">
            {orderStatus.slice(0, 8).map((item, index) => (
              <div className="list-item" key={item.name}><span><span style={{ color: statusColors[index % statusColors.length] }}>●</span> {item.name}</span><b>{item.value}</b></div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof LayoutDashboard; label: string; value: string }) {
  return <div className="card kpi"><Icon className="gold" size={21} /><span className="label">{label}</span><strong>{value}</strong><div className="trend">Dados reais do banco</div></div>;
}

function RecentOrders({ orders, merchants }: { orders: OrderRow[]; merchants: MerchantRow[] }) {
  const names = new Map(merchants.map((merchant) => [merchant.id, merchant.name]));
  return (
    <section className="card section">
      <div className="section-title"><h2>Pedidos recentes</h2></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Pedido</th><th>Estabelecimento</th><th>Status</th><th>Pagamento</th><th>Total</th><th>Horário</th></tr></thead>
          <tbody>{orders.slice(0, 8).map((order) => <tr key={order.id}><td>#{order.order_number}</td><td>{names.get(order.merchant_id) ?? shortId(order.merchant_id)}</td><td><span className={`status ${statusClass(order.status)}`}>{order.status}</span></td><td>{order.payment_method} · {order.payment_status}</td><td>{money(Number(order.total))}</td><td>{dateTime(order.created_at)}</td></tr>)}</tbody>
        </table>
        {orders.length === 0 && <Empty text="Nenhum pedido real registrado." />}
      </div>
    </section>
  );
}

function Orders({ data }: { data: AdminData }) {
  const [filter, setFilter] = useState("");
  const names = new Map(data.merchants.map((merchant) => [merchant.id, merchant.name]));
  const rows = data.orders.filter((order) => !filter || order.status === filter);
  const statuses = [...new Set(data.orders.map((order) => order.status))];
  return (
    <section className="card section">
      <div className="toolbar"><div><h2>Pedidos</h2><span className="muted">Acompanhamento integral; transições operacionais pertencem ao estabelecimento/entregador.</span></div><select className="control" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">Todos os status</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></div>
      <div className="table-wrap"><table><thead><tr><th>ID</th><th>Pedido</th><th>Estabelecimento</th><th>Cliente</th><th>Status</th><th>Pagamento</th><th>Valor</th><th>Data</th></tr></thead><tbody>{rows.map((order) => <tr key={order.id}><td>{shortId(order.id)}</td><td>#{order.order_number}</td><td>{names.get(order.merchant_id) ?? shortId(order.merchant_id)}</td><td>{order.customer_user_id ? shortId(order.customer_user_id) : "—"}</td><td><span className={`status ${statusClass(order.status)}`}>{order.status}</span></td><td>{order.payment_method} · {order.payment_status}</td><td>{money(Number(order.total))}</td><td>{dateTime(order.created_at)}</td></tr>)}</tbody></table>{rows.length === 0 && <Empty text="Nenhum pedido neste filtro." />}</div>
    </section>
  );
}

function Partners({ data, refresh }: { data: AdminData; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const profileNames = new Map(data.profiles.map((profile) => [profile.id, profile.full_name ?? shortId(profile.id)]));

  const review = async (kind: "courier" | "merchant", id: string, status: "approved" | "rejected" | "blocked") => {
    let reason: string | null = null;
    if (status !== "approved") {
      reason = window.prompt(status === "blocked" ? "Motivo do bloqueio:" : "Motivo da rejeição:", "Revisão administrativa");
      if (!reason?.trim()) return;
    }
    setBusy(id);
    const name = kind === "courier" ? "admin_review_courier" : "admin_review_merchant";
    const key = kind === "courier" ? "_courier_id" : "_merchant_id";
    const { error } = await requireSupabase().rpc(name, {
      [key]: id,
      _status: status,
      _reason: reason,
    });
    if (error) window.alert(`A operação não foi concluída: ${error.message}`);
    await refresh();
    setBusy(null);
  };

  return (
    <div className="stack">
      <section className="card section">
        <div className="section-title"><h2>Entregadores</h2><span className="muted">{data.couriers.length} cadastros</span></div>
        <div className="table-wrap"><table><thead><tr><th>Entregador</th><th>Status</th><th>Veículo</th><th>Avaliação</th><th>Ações</th></tr></thead><tbody>{data.couriers.map((courier) => <tr key={courier.id}><td>{profileNames.get(courier.user_id) ?? shortId(courier.user_id)}</td><td><span className={`status ${statusClass(courier.status)}`}>{courier.status}</span></td><td>{courier.vehicle_type ?? "—"} {courier.vehicle_plate ?? ""}</td><td>{Number(courier.rating).toFixed(1)} ★ ({courier.review_count})</td><td><div className="actions"><button className="primary" disabled={busy === courier.id} onClick={() => void review("courier", courier.id, "approved")}>Aprovar</button><button className="danger" disabled={busy === courier.id} onClick={() => void review("courier", courier.id, "rejected")}>Rejeitar</button><button className="secondary" disabled={busy === courier.id} onClick={() => void review("courier", courier.id, "blocked")}>Bloquear</button></div></td></tr>)}</tbody></table>{data.couriers.length === 0 && <Empty text="Nenhum entregador cadastrado." />}</div>
      </section>
      <section className="card section">
        <div className="section-title"><h2>Estabelecimentos</h2><span className="muted">{data.merchants.length} cadastros</span></div>
        <div className="table-wrap"><table><thead><tr><th>Estabelecimento</th><th>Cidade</th><th>Status</th><th>Avaliação</th><th>Ações</th></tr></thead><tbody>{data.merchants.map((merchant) => <tr key={merchant.id}><td>{merchant.name}</td><td>{[merchant.city, merchant.state].filter(Boolean).join(" / ") || "—"}</td><td><span className={`status ${statusClass(merchant.approval_status)}`}>{merchant.approval_status}</span></td><td>{Number(merchant.rating).toFixed(1)} ★ ({merchant.review_count})</td><td><div className="actions"><button className="primary" disabled={busy === merchant.id} onClick={() => void review("merchant", merchant.id, "approved")}>Aprovar</button><button className="danger" disabled={busy === merchant.id} onClick={() => void review("merchant", merchant.id, "rejected")}>Rejeitar</button><button className="secondary" disabled={busy === merchant.id} onClick={() => void review("merchant", merchant.id, "blocked")}>Bloquear</button></div></td></tr>)}</tbody></table>{data.merchants.length === 0 && <Empty text="Nenhum estabelecimento cadastrado." />}</div>
      </section>
    </div>
  );
}

function UserManagement({ data, refresh }: { data: AdminData; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);

  const setActive = async (profile: ProfileRow, isActive: boolean) => {
    let reason: string | null = null;
    if (!isActive) {
      reason = window.prompt("Motivo do bloqueio do usuário:", "Bloqueio administrativo");
      if (!reason?.trim()) return;
    }
    setBusy(profile.id);
    const { error } = await requireSupabase().rpc("admin_set_user_active", {
      _user_id: profile.id,
      _is_active: isActive,
      _reason: reason,
    });
    if (error) window.alert(error.message);
    await refresh();
    setBusy(null);
  };

  return (
    <section className="card section">
      <div className="section-title"><h2>Usuários</h2><span className="muted">{data.profiles.length} perfis carregados</span></div>
      <div className="table-wrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Status</th><th>Motivo</th><th>Cadastro</th><th>Ações</th></tr></thead><tbody>{data.profiles.map((profile) => <tr key={profile.id}><td>{profile.full_name ?? shortId(profile.id)}</td><td>{profile.phone ?? "—"}</td><td><span className={`status ${profile.is_active ? "good" : "bad"}`}>{profile.is_active ? "Ativo" : "Bloqueado"}</span></td><td>{profile.blocked_reason ?? "—"}</td><td>{dateTime(profile.created_at)}</td><td>{profile.is_active ? <button className="danger" disabled={busy === profile.id} onClick={() => void setActive(profile, false)}>Bloquear</button> : <button className="primary" disabled={busy === profile.id} onClick={() => void setActive(profile, true)}>Desbloquear</button>}</td></tr>)}</tbody></table>{data.profiles.length === 0 && <Empty text="Nenhum perfil encontrado." />}</div>
    </section>
  );
}

function Operations({ data }: { data: AdminData }) {
  const online = data.availability.filter((item) => item.is_online).length;
  const active = data.deliveries.filter((delivery) => !["delivered", "cancelled"].includes(delivery.status));
  return (
    <>
      <div className="kpis">
        <Kpi icon={Bike} label="Entregas ativas" value={String(active.length)} />
        <Kpi icon={Users} label="Entregadores online" value={String(online)} />
        <Kpi icon={Store} label="Aguardando coleta" value={String(data.deliveries.filter((delivery) => ["searching", "offered", "accepted", "arriving_pickup", "at_pickup"].includes(delivery.status)).length)} />
        <Kpi icon={MapPinned} label="Em rota" value={String(data.deliveries.filter((delivery) => delivery.status === "on_the_way").length)} />
        <Kpi icon={AlertTriangle} label="Sem entregador" value={String(data.deliveries.filter((delivery) => delivery.status === "searching").length)} />
        <Kpi icon={TicketCheck} label="Entregues" value={String(data.deliveries.filter((delivery) => delivery.status === "delivered").length)} />
      </div>
      <section className="card section">
        <div className="section-title"><h2>Operações em tempo real</h2><span className="muted">Atualização via Supabase Realtime</span></div>
        <div className="table-wrap"><table><thead><tr><th>Entrega</th><th>Pedido</th><th>Estabelecimento</th><th>Entregador</th><th>Status</th><th>Ganho estimado</th><th>Início</th></tr></thead><tbody>{data.deliveries.map((delivery) => <tr key={delivery.id}><td>{shortId(delivery.id)}</td><td>{shortId(delivery.order_id)}</td><td>{data.merchants.find((merchant) => merchant.id === delivery.merchant_id)?.name ?? shortId(delivery.merchant_id)}</td><td>{delivery.courier_id ? shortId(delivery.courier_id) : "Buscando"}</td><td><span className={`status ${statusClass(delivery.status)}`}>{delivery.status}</span></td><td>{money(Number(delivery.estimated_earnings))}</td><td>{dateTime(delivery.created_at)}</td></tr>)}</tbody></table>{data.deliveries.length === 0 && <Empty text="Nenhuma entrega ativa ou histórica ainda." />}</div>
      </section>
    </>
  );
}

function Finance({ data }: { data: AdminData }) {
  const paid = data.payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + Number(payment.amount), 0);
  const balances = data.wallets.reduce((sum, wallet) => sum + Number(wallet.balance), 0);
  const pending = data.payouts.filter((payout) => ["pending", "processing"].includes(payout.status)).reduce((sum, payout) => sum + Number(payout.amount), 0);
  return (
    <div className="stack">
      <div className="kpis">
        <Kpi icon={CircleDollarSign} label="Pagamentos confirmados" value={money(paid)} />
        <Kpi icon={WalletCards} label="Saldo em carteiras" value={money(balances)} />
        <Kpi icon={WalletCards} label="Saques em processamento" value={money(pending)} />
        <Kpi icon={AlertTriangle} label="Pagamentos com falha" value={String(data.payments.filter((payment) => payment.status === "failed").length)} />
        <Kpi icon={WalletCards} label="Carteiras bloqueadas" value={String(data.wallets.filter((wallet) => wallet.is_blocked).length)} />
        <Kpi icon={CircleDollarSign} label="Registros de pagamento" value={String(data.payments.length)} />
      </div>
      <div className="split">
        <section className="card section">
          <div className="section-title"><h2>Pagamentos</h2><span className="muted">Conciliação automática pelo webhook</span></div>
          <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Provedor</th><th>Método</th><th>Status</th><th>Valor</th></tr></thead><tbody>{data.payments.slice(0, 30).map((payment) => <tr key={payment.id}><td>{shortId(payment.order_id)}</td><td>{payment.provider}</td><td>{payment.method}</td><td><span className={`status ${statusClass(payment.status)}`}>{payment.status}</span></td><td>{money(Number(payment.amount))}</td></tr>)}</tbody></table>{data.payments.length === 0 && <Empty text="Nenhum pagamento processado." />}</div>
        </section>
        <section className="card section">
          <div className="section-title"><h2>Saques</h2><span className="muted">Execução externa pendente da OpenPix</span></div>
          <div className="list">{data.payouts.slice(0, 30).map((payout) => <div className="list-item" key={payout.id}><div><b>{money(Number(payout.amount))}</b><div className="muted">{payout.provider ?? "Aguardando provedor"} · {dateTime(payout.requested_at)}</div></div><span className={`status ${statusClass(payout.status)}`}>{payout.status}</span></div>)}{data.payouts.length === 0 && <Empty text="Nenhum saque solicitado." />}</div>
        </section>
      </div>
    </div>
  );
}

function Support({ data, refresh }: { data: AdminData; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);

  const update = async (id: string, status: string) => {
    setBusy(id);
    const { error } = await requireSupabase().rpc("admin_update_support_ticket", {
      _ticket_id: id,
      _status: status,
      _priority: null,
      _assigned_admin_id: null,
    });
    if (error) window.alert(error.message);
    await refresh();
    setBusy(null);
  };

  const reply = async (ticket: SupportRow) => {
    const message = window.prompt(`Responder ao chamado “${ticket.subject}”:`);
    if (!message?.trim()) return;
    setBusy(ticket.id);
    const client = requireSupabase();
    const { error } = await client.rpc("add_support_message", {
      _ticket_id: ticket.id,
      _message: message.trim(),
      _attachment_paths: [],
      _is_internal: false,
    });
    if (error) {
      window.alert(error.message);
    } else {
      await client.rpc("admin_update_support_ticket", {
        _ticket_id: ticket.id,
        _status: "in_progress",
        _priority: null,
        _assigned_admin_id: null,
      });
    }
    await refresh();
    setBusy(null);
  };

  return (
    <section className="card section">
      <div className="section-title"><h2>Tickets de suporte</h2><span className="muted">{data.support.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length} em aberto</span></div>
      <div className="table-wrap"><table><thead><tr><th>Assunto</th><th>Categoria</th><th>Solicitante</th><th>Prioridade</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead><tbody>{data.support.map((ticket) => <tr key={ticket.id}><td>{ticket.subject}</td><td>{ticket.category}</td><td>{shortId(ticket.requester_user_id)}</td><td><span className={`status ${statusClass(ticket.priority)}`}>{ticket.priority}</span></td><td><span className={`status ${statusClass(ticket.status)}`}>{ticket.status}</span></td><td>{dateTime(ticket.created_at)}</td><td><div className="actions"><button className="primary" disabled={busy === ticket.id} onClick={() => void reply(ticket)}>Responder</button><button className="secondary" disabled={busy === ticket.id} onClick={() => void update(ticket.id, "in_progress")}>Em atendimento</button><button className="secondary" disabled={busy === ticket.id} onClick={() => void update(ticket.id, "resolved")}>Resolver</button><button className="danger" disabled={busy === ticket.id} onClick={() => void update(ticket.id, "closed")}>Fechar</button></div></td></tr>)}</tbody></table>{data.support.length === 0 && <Empty text="Nenhum ticket de suporte." />}</div>
    </section>
  );
}

function SettingsPage() {
  const [cities, setCities] = useState<CityRow[]>([]);
  const [fees, setFees] = useState<FeeRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const client = requireSupabase();
    const [citiesResult, feesResult] = await Promise.all([
      client.from("cities").select("id,name,state,slug,is_active,default_delivery_radius_km").order("state").order("name"),
      client.from("fee_rules").select("id,city_id,merchant_id,name,is_active,customer_service_fee,merchant_commission_percent,courier_base_fee,courier_per_km,courier_minimum_fee").order("name"),
    ]);
    const loadError = citiesResult.error ?? feesResult.error;
    if (loadError) {
      setError(loadError.message);
    } else {
      setCities((citiesResult.data ?? []) as CityRow[]);
      setFees((feesResult.data ?? []) as FeeRuleRow[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleCity = async (city: CityRow) => {
    setBusy(city.id);
    const { error: actionError } = await requireSupabase().rpc("admin_set_city_active", {
      _city_id: city.id,
      _is_active: !city.is_active,
    });
    if (actionError) window.alert(actionError.message);
    await load();
    setBusy(null);
  };

  const toggleFee = async (fee: FeeRuleRow) => {
    setBusy(fee.id);
    const { error: actionError } = await requireSupabase().rpc("admin_set_fee_rule_active", {
      _fee_rule_id: fee.id,
      _is_active: !fee.is_active,
    });
    if (actionError) window.alert(actionError.message);
    await load();
    setBusy(null);
  };

  if (loading) return <FullLoader />;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="stack">
      <div className="split">
        <section className="card section">
          <div className="section-title"><h2>Cidades</h2><span className="muted">Ativação auditada</span></div>
          <div className="list">
            {cities.map((city) => (
              <div className="list-item" key={city.id}>
                <div><b>{city.name}/{city.state}</b><div className="muted">Raio padrão: {Number(city.default_delivery_radius_km).toFixed(1)} km</div></div>
                <div className="actions"><span className={`status ${city.is_active ? "good" : "bad"}`}>{city.is_active ? "Ativa" : "Inativa"}</span><button className="secondary" disabled={busy === city.id} onClick={() => void toggleCity(city)}>{city.is_active ? "Desativar" : "Ativar"}</button></div>
              </div>
            ))}
            {cities.length === 0 && <Empty text="Nenhuma cidade cadastrada." />}
          </div>
        </section>

        <section className="card section">
          <div className="section-title"><h2>Regras de taxa</h2><span className="muted">Ativação auditada</span></div>
          <div className="list">
            {fees.map((fee) => (
              <div className="list-item" key={fee.id}>
                <div><b>{fee.name}</b><div className="muted">Cliente {money(Number(fee.customer_service_fee))} · comissão {Number(fee.merchant_commission_percent).toFixed(2)}% · entregador {money(Number(fee.courier_base_fee))} + {money(Number(fee.courier_per_km))}/km</div></div>
                <div className="actions"><span className={`status ${fee.is_active ? "good" : "bad"}`}>{fee.is_active ? "Ativa" : "Inativa"}</span><button className="secondary" disabled={busy === fee.id} onClick={() => void toggleFee(fee)}>{fee.is_active ? "Desativar" : "Ativar"}</button></div>
              </div>
            ))}
            {fees.length === 0 && <Empty text="Nenhuma regra de taxa cadastrada." />}
          </div>
        </section>
      </div>

      <section className="card section">
        <div className="section-title"><h2>Integrações</h2></div>
        <div className="list">
          <div className="list-item"><span>Supabase</span><span className="status good">Conectado</span></div>
          <div className="list-item"><span>Google Maps</span><span className="status warn">Chave por ambiente</span></div>
          <div className="list-item"><span>OpenPix/Woovi</span><span className="status warn">Credenciais externas pendentes</span></div>
          <div className="list-item"><span>Push nativo</span><span className="status warn">Provedor externo pendente</span></div>
        </div>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
