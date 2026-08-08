import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Bell,
  CircleDollarSign,
  Clock3,
  ClipboardList,
  LayoutDashboard,
  Loader2,
  LogOut,
  PackageCheck,
  RefreshCw,
  Settings,
  Star,
  Store,
  Tags,
  UtensilsCrossed,
  WalletCards,
} from "lucide-react";
import { requireSupabase, supabaseConfigured } from "./supabase";

type Page = "overview" | "orders" | "catalog" | "hours" | "promotions" | "finance" | "reviews" | "settings";
type Merchant = {
  id: string;
  name: string;
  legal_name: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  delivery_fee: number;
  minimum_order: number;
  temporarily_closed: boolean;
  is_active: boolean;
  is_open: boolean;
  approval_status: string;
  rating: number;
  review_count: number;
};
type Member = { merchant_id: string; role: string; status: string };
type OrderItem = { id: string; product_name: string; quantity: number; line_total: number; selected_options: unknown };
type Order = {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  customer_user_id: string | null;
  observation: string | null;
  delivery_address: Record<string, unknown>;
  created_at: string;
  order_items: OrderItem[];
};
type Category = { id: string; name: string; slug: string; sort_order: number; is_active: boolean };
type Product = {
  id: string;
  menu_category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  sort_order: number;
};
type Hour = { id: string; weekday: number; opens_at: string | null; closes_at: string | null; is_closed: boolean };
type Promotion = {
  id: string;
  name: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  minimum_order: number;
  product_id: string | null;
  menu_category_id: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};
type Payment = { id: string; order_id: string; provider: string; status: string; method: string; amount: number; created_at: string };
type Wallet = { id: string; balance: number; available_balance: number; reserved_balance: number; is_blocked: boolean; blocked_reason: string | null };
type Payout = { id: string; amount: number; status: string; provider: string | null; requested_at: string };
type Review = { id: string; order_id: string; merchant_rating: number | null; comment: string | null; created_at: string };
type DataState = {
  orders: Order[];
  categories: Category[];
  products: Product[];
  hours: Hour[];
  promotions: Promotion[];
  payments: Payment[];
  wallet: Wallet | null;
  payouts: Payout[];
  reviews: Review[];
};

const emptyData: DataState = { orders: [], categories: [], products: [], hours: [], promotions: [], payments: [], wallet: null, payouts: [], reviews: [] };
const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const nav: Array<{ id: Page; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "orders", label: "Pedidos", icon: ClipboardList },
  { id: "catalog", label: "Cardápio", icon: UtensilsCrossed },
  { id: "hours", label: "Horários", icon: Clock3 },
  { id: "promotions", label: "Promoções", icon: Tags },
  { id: "finance", label: "Financeiro", icon: WalletCards },
  { id: "reviews", label: "Avaliações", icon: Star },
  { id: "settings", label: "Configurações", icon: Settings },
];

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function statusClass(status: string) {
  if (["paid", "delivered", "active", "approved"].includes(status)) return "good";
  if (["cancelled", "failed", "rejected", "blocked"].includes(status)) return "bad";
  return "warn";
}
function addressLine(address: Record<string, unknown>) {
  return [address["street"], address["number"], address["neighborhood"]]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(", ") || "Endereço cadastrado";
}
function normalizeTime(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

export default function MerchantApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [page, setPage] = useState<Page>("overview");
  const [data, setData] = useState<DataState>(emptyData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) {
      setChecked(true);
      return;
    }
    const client = requireSupabase();
    void client.auth.getSession().then(({ data: auth }) => {
      setSession(auth.session);
      setChecked(true);
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadIdentity = useCallback(async () => {
    if (!session) {
      setMember(null);
      setMerchant(null);
      return;
    }
    const client = requireSupabase();
    const { data: membership, error: memberError } = await client
      .from("merchant_members")
      .select("merchant_id,role,status")
      .eq("user_id", session.user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (memberError) {
      setError("Não foi possível validar o vínculo com o estabelecimento.");
      return;
    }
    if (!membership) {
      setMember(null);
      setMerchant(null);
      return;
    }
    const normalizedMember = membership as Member;
    setMember(normalizedMember);
    const { data: merchantRow, error: merchantError } = await client
      .from("merchants")
      .select("id,name,legal_name,city,state,neighborhood,delivery_fee,minimum_order,temporarily_closed,is_active,is_open,approval_status,rating,review_count")
      .eq("id", normalizedMember.merchant_id)
      .single();
    if (merchantError) {
      setError("Não foi possível carregar o estabelecimento.");
      return;
    }
    setMerchant({
      ...(merchantRow as Merchant),
      delivery_fee: Number(merchantRow.delivery_fee),
      minimum_order: Number(merchantRow.minimum_order),
      rating: Number(merchantRow.rating),
      review_count: Number(merchantRow.review_count),
    });
  }, [session]);

  useEffect(() => {
    void loadIdentity();
  }, [loadIdentity]);

  const loadData = useCallback(async () => {
    if (!merchant) return;
    setLoading(true);
    setError(null);
    const client = requireSupabase();
    try {
      const [orders, categories, products, hours, promotions, payments, wallet, reviews] = await Promise.all([
        client
          .from("orders")
          .select("id,order_number,status,payment_status,total,subtotal,delivery_fee,customer_user_id,observation,delivery_address,created_at,order_items(id,product_name,quantity,line_total,selected_options)")
          .eq("merchant_id", merchant.id)
          .order("created_at", { ascending: false })
          .limit(300),
        client.from("menu_categories").select("id,name,slug,sort_order,is_active").eq("merchant_id", merchant.id).order("sort_order"),
        client.from("products").select("id,menu_category_id,name,description,price,image_url,is_available,is_featured,sort_order").eq("merchant_id", merchant.id).order("sort_order"),
        client.from("merchant_hours").select("id,weekday,opens_at,closes_at,is_closed").eq("merchant_id", merchant.id).order("weekday"),
        client.from("promotions").select("id,name,description,discount_type,discount_value,minimum_order,product_id,menu_category_id,is_active,starts_at,ends_at").eq("merchant_id", merchant.id).order("created_at", { ascending: false }),
        client.from("payments").select("id,order_id,provider,status,method,amount,created_at").in("order_id", []),
        client.from("wallets").select("id,balance,available_balance,reserved_balance,is_blocked,blocked_reason").eq("owner_type", "merchant").eq("merchant_id", merchant.id).maybeSingle(),
        client.from("reviews").select("id,order_id,merchant_rating,comment,created_at").eq("merchant_id", merchant.id).order("created_at", { ascending: false }).limit(200),
      ]);

      const failed = [orders, categories, products, hours, promotions, wallet, reviews].find((result) => result.error);
      if (failed?.error) throw failed.error;

      const normalizedOrders = ((orders.data ?? []) as unknown as Order[]).map((order) => ({
        ...order,
        total: Number(order.total),
        subtotal: Number(order.subtotal),
        delivery_fee: Number(order.delivery_fee),
        order_items: (order.order_items ?? []).map((item) => ({ ...item, line_total: Number(item.line_total) })),
      }));
      const orderIds = normalizedOrders.map((order) => order.id);
      let paymentRows: Payment[] = [];
      if (orderIds.length > 0) {
        const paymentResult = await client
          .from("payments")
          .select("id,order_id,provider,status,method,amount,created_at")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false });
        if (paymentResult.error) throw paymentResult.error;
        paymentRows = ((paymentResult.data ?? []) as Payment[]).map((payment) => ({ ...payment, amount: Number(payment.amount) }));
      }

      const walletRow = wallet.data
        ? ({
            ...(wallet.data as Wallet),
            balance: Number(wallet.data.balance),
            available_balance: Number(wallet.data.available_balance),
            reserved_balance: Number(wallet.data.reserved_balance),
          } as Wallet)
        : null;
      let payouts: Payout[] = [];
      if (walletRow) {
        const payoutResult = await client.from("payouts").select("id,amount,status,provider,requested_at").eq("wallet_id", walletRow.id).order("requested_at", { ascending: false }).limit(100);
        if (payoutResult.error) throw payoutResult.error;
        payouts = ((payoutResult.data ?? []) as Payout[]).map((payout) => ({ ...payout, amount: Number(payout.amount) }));
      }

      setData({
        orders: normalizedOrders,
        categories: (categories.data ?? []) as Category[],
        products: ((products.data ?? []) as Product[]).map((product) => ({ ...product, price: Number(product.price) })),
        hours: (hours.data ?? []) as Hour[],
        promotions: ((promotions.data ?? []) as Promotion[]).map((promotion) => ({
          ...promotion,
          discount_value: Number(promotion.discount_value),
          minimum_order: Number(promotion.minimum_order),
        })),
        payments: paymentRows,
        wallet: walletRow,
        payouts,
        reviews: (reviews.data ?? []) as Review[],
      });
    } catch (loadError) {
      console.error("merchant data", loadError instanceof Error ? loadError.message : "unknown");
      setError("Não foi possível atualizar todos os dados do estabelecimento.");
    } finally {
      setLoading(false);
    }
  }, [merchant]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!merchant) return;
    const client = requireSupabase();
    const channel = client
      .channel(`merchant-${merchant.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `merchant_id=eq.${merchant.id}` }, () => void loadData())
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [loadData, merchant]);

  if (!supabaseConfigured) return <Message title="Ambiente não configurado" text="Configure as variáveis públicas do Supabase para este painel." />;
  if (!checked) return <Loader />;
  if (!session) return <Login />;
  if (!member || !merchant) return <Message title="Sem estabelecimento vinculado" text="Esta conta ainda não possui um vínculo ativo com um estabelecimento APOIS." action={<button className="secondary" onClick={() => void requireSupabase().auth.signOut()}>Sair</button>} />;
  if (merchant.approval_status !== "approved" || !merchant.is_active) return <Message title="Estabelecimento indisponível" text={`Status atual: ${merchant.approval_status}. Aguarde ou contate o suporte administrativo.`} action={<button className="secondary" onClick={() => void requireSupabase().auth.signOut()}>Sair</button>} />;

  return (
    <Shell merchant={merchant} role={member.role} page={page} setPage={setPage} loading={loading} refresh={() => void Promise.all([loadIdentity(), loadData()])}>
      {error && <div className="error">{error}</div>}
      {page === "overview" && <Overview merchant={merchant} data={data} />}
      {page === "orders" && <Orders merchant={merchant} data={data} refresh={loadData} />}
      {page === "catalog" && <Catalog merchant={merchant} data={data} refresh={loadData} />}
      {page === "hours" && <Hours merchant={merchant} data={data} refresh={loadData} />}
      {page === "promotions" && <Promotions merchant={merchant} data={data} refresh={loadData} />}
      {page === "finance" && <Finance data={data} />}
      {page === "reviews" && <Reviews merchant={merchant} data={data} />}
      {page === "settings" && <MerchantSettings merchant={merchant} reload={loadIdentity} />}
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
    const result = await requireSupabase().auth.signInWithPassword({ email, password });
    if (result.error) setError("Não foi possível entrar. Verifique os dados e o vínculo do estabelecimento.");
    setBusy(false);
  };
  return <div className="login"><div className="login-card"><div className="brand"><span className="brand-mark">A</span> APOIS ENTREGAS</div><h1>Painel do Estabelecimento</h1><p className="muted">Pedidos, cardápio e operação em um único lugar.</p><form onSubmit={submit}><div className="field"><label>E-mail</label><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div><div className="field"><label>Senha</label><input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>{error && <div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button></form></div></div>;
}
function Loader() {
  return <div className="login"><Loader2 className="gold" size={36} /></div>;
}
function Message({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="login"><div className="login-card"><h1>{title}</h1><p className="muted">{text}</p>{action}</div></div>;
}

function Shell({ merchant, role, page, setPage, loading, refresh, children }: { merchant: Merchant; role: string; page: Page; setPage: (page: Page) => void; loading: boolean; refresh: () => void; children: ReactNode }) {
  return <div className="app"><aside className="sidebar"><div className="brand"><span className="brand-mark">A</span> APOIS ENTREGAS</div><div className="store-chip"><b>{merchant.name}</b><span>{merchant.temporarily_closed ? "Fechado temporariamente" : merchant.is_open ? "Operando" : "Fora do horário"}</span></div><div className="nav">{nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)}><Icon size={18} />{item.label}</button>; })}</div><div className="sidebar-foot"><p className="muted">Acesso: {role}</p><button className="secondary" onClick={() => void requireSupabase().auth.signOut()}><LogOut size={14} /> Sair</button></div></aside><main className="main"><header className="header"><div><h1>{nav.find((item) => item.id === page)?.label}</h1><p>{merchant.name} · {[merchant.city, merchant.state].filter(Boolean).join("/")}</p></div><div className="header-actions"><button className="control" onClick={refresh} disabled={loading}><RefreshCw size={16} /> {loading ? "Atualizando" : "Atualizar"}</button><span className="control"><Bell size={16} /></span></div></header>{children}</main></div>;
}

function Overview({ merchant, data }: { merchant: Merchant; data: DataState }) {
  const active = data.orders.filter((order) => !["delivered", "cancelled", "refunded"].includes(order.status)).length;
  const paidRevenue = data.payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0);
  const average = data.reviews.length ? data.reviews.reduce((sum, review) => sum + Number(review.merchant_rating ?? 0), 0) / data.reviews.filter((review) => review.merchant_rating).length : Number(merchant.rating);
  return <><div className="kpis"><Kpi label="Pedidos ativos" value={String(active)} /><Kpi label="Pagamentos confirmados" value={money(paidRevenue)} /><Kpi label="Produtos disponíveis" value={String(data.products.filter((product) => product.is_available).length)} /><Kpi label="Avaliação" value={`${Number.isFinite(average) ? average.toFixed(1) : "0.0"} ★`} /></div><section className="card section"><div className="section-title"><h2>Pedidos recentes</h2><span className="muted">Dados reais</span></div><div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Status</th><th>Pagamento</th><th>Total</th><th>Data</th></tr></thead><tbody>{data.orders.slice(0, 10).map((order) => <tr key={order.id}><td>#{order.order_number}</td><td><span className={`status ${statusClass(order.status)}`}>{order.status}</span></td><td><span className={`status ${statusClass(order.payment_status)}`}>{order.payment_status}</span></td><td>{money(order.total)}</td><td>{dateTime(order.created_at)}</td></tr>)}</tbody></table>{data.orders.length === 0 && <div className="empty">Nenhum pedido ainda.</div>}</div></section></>;
}
function Kpi({ label, value }: { label: string; value: string }) {
  return <div className="card kpi"><span>{label}</span><b>{value}</b></div>;
}

const lanes = [
  { title: "Novos pagos", statuses: ["paid", "confirmed"] },
  { title: "Aceitos", statuses: ["accepted"] },
  { title: "Em preparo", statuses: ["preparing"] },
  { title: "Prontos", statuses: ["ready", "ready_for_pickup", "searching_driver", "driver_assigned"] },
];
function Orders({ merchant, data, refresh }: { merchant: Merchant; data: DataState; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const advance = async (order: Order, status: "accepted" | "preparing" | "ready") => {
    setBusy(order.id);
    const { error } = await requireSupabase().rpc("merchant_transition_order", { _order_id: order.id, _new_status: status });
    if (error) window.alert(error.message);
    await refresh();
    setBusy(null);
  };
  const reject = async (order: Order) => {
    const reason = window.prompt("Motivo da recusa/cancelamento:", "Item indisponível");
    if (!reason?.trim()) return;
    setBusy(order.id);
    const { error } = await requireSupabase().rpc("reject_order", { _order_id: order.id, _reason: reason.trim() });
    if (error) window.alert(error.message);
    await refresh();
    setBusy(null);
  };
  const action = (order: Order) => {
    if (["paid", "confirmed"].includes(order.status)) return <div className="actions"><button className="primary" disabled={busy === order.id} onClick={() => void advance(order, "accepted")}>Aceitar</button><button className="danger" disabled={busy === order.id} onClick={() => void reject(order)}>Recusar</button></div>;
    if (order.status === "accepted") return <button className="primary" disabled={busy === order.id} onClick={() => void advance(order, "preparing")}>Iniciar preparo</button>;
    if (order.status === "preparing") return <button className="primary" disabled={busy === order.id} onClick={() => void advance(order, "ready")}>Marcar pronto</button>;
    return null;
  };
  return <><div className="kanban">{lanes.map((lane) => <div className="lane" key={lane.title}><h3>{lane.title}</h3>{data.orders.filter((order) => lane.statuses.includes(order.status)).map((order) => <div className="order-card" key={order.id}><div className="top"><strong>#{order.order_number}</strong><span className={`status ${statusClass(order.payment_status)}`}>{order.payment_status}</span></div><p>{addressLine(order.delivery_address)}</p><div className="list">{order.order_items.map((item) => <div className="list-item" key={item.id}><span>{item.quantity}x {item.product_name}</span><b>{money(item.line_total)}</b></div>)}</div>{order.observation && <p>Obs.: {order.observation}</p>}<div className="price">{money(order.total)}</div><div style={{ marginTop: 10 }}>{action(order)}</div></div>)}</div>)}</div><section className="card section" style={{ marginTop: 14 }}><div className="section-title"><h2>Histórico recente</h2></div><div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Status</th><th>Pagamento</th><th>Total</th><th>Data</th></tr></thead><tbody>{data.orders.filter((order) => ["delivered", "cancelled", "refunded"].includes(order.status)).slice(0, 100).map((order) => <tr key={order.id}><td>#{order.order_number}</td><td><span className={`status ${statusClass(order.status)}`}>{order.status}</span></td><td>{order.payment_status}</td><td>{money(order.total)}</td><td>{dateTime(order.created_at)}</td></tr>)}</tbody></table></div></section><p className="muted" style={{ marginTop: 10 }}>Operando: {merchant.name}. Pedidos não pagos não entram na fila de preparo.</p></>;
}

function Catalog({ merchant, data, refresh }: { merchant: Merchant; data: DataState; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [product, setProduct] = useState({ name: "", description: "", price: "", categoryId: "" });
  const slugify = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const addCategory = async (event: FormEvent) => {
    event.preventDefault();
    if (!categoryName.trim()) return;
    const { error } = await requireSupabase().from("menu_categories").insert({ merchant_id: merchant.id, name: categoryName.trim(), slug: `${slugify(categoryName)}-${Date.now()}`, sort_order: data.categories.length, is_active: true });
    if (error) window.alert(error.message); else setCategoryName("");
    await refresh();
  };
  const addProduct = async (event: FormEvent) => {
    event.preventDefault();
    const price = Number(product.price.replace(",", "."));
    if (!product.name.trim() || !Number.isFinite(price) || price < 0) return;
    const { error } = await requireSupabase().from("products").insert({ merchant_id: merchant.id, menu_category_id: product.categoryId || null, name: product.name.trim(), description: product.description.trim() || null, price, is_available: true, is_featured: false, sort_order: data.products.length });
    if (error) window.alert(error.message); else setProduct({ name: "", description: "", price: "", categoryId: "" });
    await refresh();
  };
  const toggleProduct = async (row: Product) => {
    setBusy(row.id);
    const { error } = await requireSupabase().from("products").update({ is_available: !row.is_available }).eq("id", row.id).eq("merchant_id", merchant.id);
    if (error) window.alert(error.message);
    await refresh();
    setBusy(null);
  };
  const editProduct = async (row: Product) => {
    const name = window.prompt("Nome do produto:", row.name);
    if (!name?.trim()) return;
    const priceText = window.prompt("Preço:", row.price.toFixed(2).replace(".", ","));
    if (!priceText) return;
    const price = Number(priceText.replace(",", "."));
    if (!Number.isFinite(price) || price < 0) return;
    const { error } = await requireSupabase().from("products").update({ name: name.trim(), price }).eq("id", row.id).eq("merchant_id", merchant.id);
    if (error) window.alert(error.message);
    await refresh();
  };
  return <div className="stack"><div className="split"><form className="card section" onSubmit={addCategory}><div className="section-title"><h2>Nova categoria</h2></div><div className="field"><label>Nome</label><input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} required /></div><button className="primary" style={{ marginTop: 10 }}>Criar categoria</button></form><form className="card section" onSubmit={addProduct}><div className="section-title"><h2>Novo produto</h2></div><div className="form-grid"><div className="field"><label>Nome</label><input value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} required /></div><div className="field"><label>Preço</label><input inputMode="decimal" value={product.price} onChange={(event) => setProduct({ ...product, price: event.target.value })} required /></div><div className="field"><label>Categoria</label><select value={product.categoryId} onChange={(event) => setProduct({ ...product, categoryId: event.target.value })}><option value="">Sem categoria</option>{data.categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div><div className="field"><label>Descrição</label><input value={product.description} onChange={(event) => setProduct({ ...product, description: event.target.value })} /></div></div><button className="primary" style={{ marginTop: 10 }}>Adicionar produto</button></form></div><section className="card section"><div className="section-title"><h2>Cardápio</h2><span className="muted">{data.products.length} produtos</span></div>{data.categories.map((category) => <div key={category.id} style={{ marginBottom: 18 }}><h3>{category.name}</h3>{data.products.filter((item) => item.menu_category_id === category.id).map((item) => <div className="product-row" key={item.id}><div><b>{item.name}</b><div className="muted">{item.description ?? "Sem descrição"}</div></div><b>{money(item.price)}</b><button className={`toggle ${item.is_available ? "on" : ""}`} disabled={busy === item.id} onClick={() => void toggleProduct(item)}>{item.is_available ? "Disponível" : "Indisponível"}</button><button className="secondary" onClick={() => void editProduct(item)}>Editar</button></div>)}</div>)}</section></div>;
}

function Hours({ merchant, data, refresh }: { merchant: Merchant; data: DataState; refresh: () => Promise<void> }) {
  const byDay = new Map(data.hours.map((hour) => [hour.weekday, hour]));
  const save = async (weekday: number, current: Hour | undefined, patch: Partial<Hour>) => {
    const client = requireSupabase();
    const payload = { merchant_id: merchant.id, weekday, opens_at: patch.opens_at ?? current?.opens_at ?? "08:00", closes_at: patch.closes_at ?? current?.closes_at ?? "18:00", is_closed: patch.is_closed ?? current?.is_closed ?? false };
    const result = current ? await client.from("merchant_hours").update(payload).eq("id", current.id).eq("merchant_id", merchant.id) : await client.from("merchant_hours").insert(payload);
    if (result.error) window.alert(result.error.message);
    await refresh();
  };
  return <section className="card section"><div className="section-title"><h2>Horários de funcionamento</h2><span className="muted">Alterações refletem no app do cliente</span></div><div className="list">{weekdays.map((name, weekday) => { const hour = byDay.get(weekday); return <div className="list-item" key={weekday}><div style={{ minWidth: 110 }}><b>{name}</b></div><div className="actions"><label className="field"><span className="muted">Abre</span><input type="time" disabled={hour?.is_closed} defaultValue={normalizeTime(hour?.opens_at ?? "08:00")} onBlur={(event) => void save(weekday, hour, { opens_at: event.target.value })} /></label><label className="field"><span className="muted">Fecha</span><input type="time" disabled={hour?.is_closed} defaultValue={normalizeTime(hour?.closes_at ?? "18:00")} onBlur={(event) => void save(weekday, hour, { closes_at: event.target.value })} /></label><button className={`toggle ${!hour?.is_closed ? "on" : ""}`} onClick={() => void save(weekday, hour, { is_closed: !hour?.is_closed })}>{hour?.is_closed ? "Fechado" : "Aberto"}</button></div></div>; })}</div></section>;
}

function Promotions({ merchant, data, refresh }: { merchant: Merchant; data: DataState; refresh: () => Promise<void> }) {
  const [form, setForm] = useState({ name: "", description: "", type: "percent", value: "", minimum: "0" });
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(form.value.replace(",", "."));
    const minimum = Number(form.minimum.replace(",", "."));
    if (!form.name.trim() || !Number.isFinite(value) || value <= 0 || !Number.isFinite(minimum) || minimum < 0) return;
    const { error } = await requireSupabase().from("promotions").insert({ merchant_id: merchant.id, name: form.name.trim(), description: form.description.trim() || null, discount_type: form.type, discount_value: value, minimum_order: minimum, is_active: true, starts_at: new Date().toISOString() });
    if (error) window.alert(error.message); else setForm({ name: "", description: "", type: "percent", value: "", minimum: "0" });
    await refresh();
  };
  const toggle = async (promotion: Promotion) => {
    const { error } = await requireSupabase().from("promotions").update({ is_active: !promotion.is_active }).eq("id", promotion.id).eq("merchant_id", merchant.id);
    if (error) window.alert(error.message);
    await refresh();
  };
  return <div className="split"><form className="card section" onSubmit={create}><div className="section-title"><h2>Nova promoção</h2></div><div className="form-grid"><div className="field"><label>Nome</label><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div className="field"><label>Tipo</label><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="percent">Percentual</option><option value="fixed">Valor fixo</option></select></div><div className="field"><label>Desconto</label><input required inputMode="decimal" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} /></div><div className="field"><label>Pedido mínimo</label><input inputMode="decimal" value={form.minimum} onChange={(event) => setForm({ ...form, minimum: event.target.value })} /></div></div><div className="field" style={{ marginTop: 10 }}><label>Descrição</label><textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div><button className="primary" style={{ marginTop: 10 }}>Criar promoção</button></form><section className="card section"><div className="section-title"><h2>Promoções</h2><span className="muted">{data.promotions.length}</span></div><div className="list">{data.promotions.map((promotion) => <div className="list-item" key={promotion.id}><div><b>{promotion.name}</b><div className="muted">{promotion.discount_type === "percent" ? `${promotion.discount_value}%` : money(promotion.discount_value)} · mínimo {money(promotion.minimum_order)}</div></div><button className={`toggle ${promotion.is_active ? "on" : ""}`} onClick={() => void toggle(promotion)}>{promotion.is_active ? "Ativa" : "Pausada"}</button></div>)}{data.promotions.length === 0 && <div className="empty">Nenhuma promoção criada.</div>}</div></section></div>;
}

function Finance({ data }: { data: DataState }) {
  const paid = data.payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0);
  return <div className="stack"><div className="kpis"><Kpi label="Pagamentos confirmados" value={money(paid)} /><Kpi label="Saldo disponível" value={money(data.wallet?.available_balance ?? 0)} /><Kpi label="Saldo reservado" value={money(data.wallet?.reserved_balance ?? 0)} /><Kpi label="Saques" value={String(data.payouts.length)} /></div>{data.wallet?.is_blocked && <div className="error">Carteira bloqueada: {data.wallet.blocked_reason ?? "Contate o suporte."}</div>}<div className="split"><section className="card section"><div className="section-title"><h2>Pagamentos</h2></div><div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Provedor</th><th>Status</th><th>Valor</th><th>Data</th></tr></thead><tbody>{data.payments.slice(0, 100).map((payment) => <tr key={payment.id}><td>{payment.order_id.slice(0, 8)}</td><td>{payment.provider}</td><td><span className={`status ${statusClass(payment.status)}`}>{payment.status}</span></td><td>{money(payment.amount)}</td><td>{dateTime(payment.created_at)}</td></tr>)}</tbody></table></div></section><section className="card section"><div className="section-title"><h2>Saques</h2><span className="muted">Execução automática depende da OpenPix</span></div><div className="list">{data.payouts.map((payout) => <div className="list-item" key={payout.id}><div><b>{money(payout.amount)}</b><div className="muted">{dateTime(payout.requested_at)}</div></div><span className={`status ${statusClass(payout.status)}`}>{payout.status}</span></div>)}{data.payouts.length === 0 && <div className="empty">Nenhum saque solicitado.</div>}</div></section></div></div>;
}

function Reviews({ merchant, data }: { merchant: Merchant; data: DataState }) {
  return <div className="stack"><div className="kpis"><Kpi label="Nota atual" value={`${Number(merchant.rating).toFixed(1)} ★`} /><Kpi label="Total de avaliações" value={String(merchant.review_count)} /><Kpi label="Comentários recentes" value={String(data.reviews.filter((review) => review.comment).length)} /><Kpi label="Nota 5" value={String(data.reviews.filter((review) => review.merchant_rating === 5).length)} /></div><section className="card section"><div className="section-title"><h2>Avaliações</h2></div><div className="list">{data.reviews.map((review) => <div className="list-item" key={review.id}><div><b>{review.merchant_rating ?? "—"} ★ · Pedido {review.order_id.slice(0, 8)}</b><div className="muted">{review.comment ?? "Sem comentário"}</div></div><span className="muted">{dateTime(review.created_at)}</span></div>)}{data.reviews.length === 0 && <div className="empty">Nenhuma avaliação ainda.</div>}</div></section></div>;
}

function MerchantSettings({ merchant, reload }: { merchant: Merchant; reload: () => Promise<void> }) {
  const [deliveryFee, setDeliveryFee] = useState(String(merchant.delivery_fee));
  const [minimum, setMinimum] = useState(String(merchant.minimum_order));
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const fee = Number(deliveryFee.replace(",", "."));
    const min = Number(minimum.replace(",", "."));
    if (!Number.isFinite(fee) || fee < 0 || !Number.isFinite(min) || min < 0) return;
    setBusy(true);
    const { error } = await requireSupabase().from("merchants").update({ delivery_fee: fee, minimum_order: min }).eq("id", merchant.id);
    if (error) window.alert(error.message);
    await reload();
    setBusy(false);
  };
  const temporary = async () => {
    setBusy(true);
    const { error } = await requireSupabase().from("merchants").update({ temporarily_closed: !merchant.temporarily_closed }).eq("id", merchant.id);
    if (error) window.alert(error.message);
    await reload();
    setBusy(false);
  };
  return <div className="split"><form className="card section" onSubmit={save}><div className="section-title"><h2>Operação comercial</h2></div><div className="field"><label>Taxa de entrega exibida ao cliente</label><input inputMode="decimal" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} /></div><div className="field" style={{ marginTop: 10 }}><label>Pedido mínimo</label><input inputMode="decimal" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></div><button className="primary" disabled={busy} style={{ marginTop: 12 }}>Salvar</button></form><section className="card section"><div className="section-title"><h2>Disponibilidade</h2></div><p className="muted">Use o fechamento temporário para interromper novos pedidos imediatamente sem alterar seus horários permanentes.</p><button className={merchant.temporarily_closed ? "primary" : "danger"} disabled={busy} onClick={() => void temporary()}>{merchant.temporarily_closed ? "Reabrir estabelecimento" : "Fechar temporariamente"}</button><div className="list" style={{ marginTop: 14 }}><div className="list-item"><span>Aprovação</span><span className={`status ${statusClass(merchant.approval_status)}`}>{merchant.approval_status}</span></div><div className="list-item"><span>Status cadastral</span><span className={`status ${merchant.is_active ? "good" : "bad"}`}>{merchant.is_active ? "Ativo" : "Bloqueado"}</span></div></div></section></div>;
}
