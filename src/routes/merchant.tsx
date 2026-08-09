import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  BadgeDollarSign,
  BadgePercent,
  Clock3,
  LayoutDashboard,
  Loader2,
  PackageCheck,
  Plus,
  Printer,
  RefreshCw,
  Settings,
  ShoppingBag,
  Store,
  Star,
  Trash2,
  Users,
  UtensilsCrossed,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, MetricCard, WorkspaceShell } from "@/components/WorkspaceShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { clearPayoutAttemptKey, getPayoutAttemptKey } from "@/lib/payout-attempt";
import { MerchantProductEditor } from "@/components/MerchantProductEditor";
import {
  MerchantCustomersPanel,
  MerchantPromotionsPanel,
  MerchantReviewsPanel,
} from "@/components/MerchantGrowthPanels";

export const Route = createFileRoute("/merchant")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } });
    return { session };
  },
  component: MerchantWorkspace,
  head: () => ({ meta: [{ title: "Painel do Estabelecimento | APOIS ENTREGA" }] }),
});

const money = (value: unknown) =>
  `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;
const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";
const rpc = (name: string, args?: Record<string, unknown>) =>
  (supabase.rpc as any)(name, args ?? {});
const from = (table: string) => (supabase.from as any)(table);
const week = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function MerchantWorkspace() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [user, setUser] = useState<any>(null);
  const [membership, setMembership] = useState<any>(null);
  const [merchant, setMerchant] = useState<any>(null);
  const [merchantCategories, setMerchantCategories] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [menuCategories, setMenuCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [hours, setHours] = useState<any[]>([]);
  const [specialHours, setSpecialHours] = useState<any[]>([]);
  const [wallet, setWallet] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [payoutAccount, setPayoutAccount] = useState<any>(null);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [productDraft, setProductDraft] = useState({
    name: "",
    price: "",
    categoryId: "",
    description: "",
  });
  const [payoutDraft, setPayoutDraft] = useState({
    pixKey: "",
    holderName: "",
    document: "",
    amount: "",
  });
  const [settingsDraft, setSettingsDraft] = useState({
    deliveryFee: "",
    minimumOrder: "",
    minMinutes: "",
    maxMinutes: "",
    temporarilyClosed: false,
  });
  const [specialDraft, setSpecialDraft] = useState({
    serviceDate: "",
    note: "",
    isClosed: true,
    opensAt: "08:00",
    closesAt: "22:00",
    secondEnabled: false,
    secondOpensAt: "",
    secondClosesAt: "",
  });

  const loadOperations = useCallback(async (merchantId: string) => {
    const [
      ordersRes,
      categoriesRes,
      productsRes,
      hoursRes,
      walletRes,
      reviewsRes,
      specialHoursRes,
    ] = await Promise.all([
      from("orders")
        .select("*, order_items(*)")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(100),
      from("menu_categories")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("sort_order")
        .order("name"),
      from("products").select("*").eq("merchant_id", merchantId).order("sort_order").order("name"),
      from("merchant_hours").select("*").eq("merchant_id", merchantId).order("weekday"),
      from("wallets").select("*").eq("merchant_id", merchantId).maybeSingle(),
      from("reviews")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(50),
      from("merchant_special_hours")
        .select("*")
        .eq("merchant_id", merchantId)
        .gte("service_date", new Date().toISOString().slice(0, 10))
        .order("service_date")
        .limit(90),
    ]);

    if (ordersRes.error) toast.error("Não foi possível carregar os pedidos do estabelecimento.");
    setOrders(ordersRes.data ?? []);
    setMenuCategories(categoriesRes.data ?? []);
    setProducts(productsRes.data ?? []);
    setHours(hoursRes.data ?? []);
    setReviews(reviewsRes.data ?? []);
    setSpecialHours(specialHoursRes.data ?? []);

    const merchantWallet = walletRes.data ?? null;
    setWallet(merchantWallet);
    if (merchantWallet) {
      const [txRes, accountRes, payoutsRes] = await Promise.all([
        from("wallet_transactions")
          .select("*")
          .eq("wallet_id", merchantWallet.id)
          .order("created_at", { ascending: false })
          .limit(100),
        from("payout_accounts").select("*").eq("wallet_id", merchantWallet.id).maybeSingle(),
        from("payouts")
          .select("*")
          .eq("wallet_id", merchantWallet.id)
          .order("requested_at", { ascending: false })
          .limit(50),
      ]);
      setTransactions(txRes.data ?? []);
      setPayoutAccount(accountRes.data ?? null);
      setPayouts(payoutsRes.data ?? []);
      if (accountRes.data) {
        setPayoutDraft((current) => ({
          ...current,
          pixKey: accountRes.data.pix_key ?? "",
          holderName: accountRes.data.holder_name ?? "",
          document: accountRes.data.document ?? "",
        }));
      }
    } else {
      setTransactions([]);
      setPayoutAccount(null);
      setPayouts([]);
    }
  }, []);

  const loadAll = useCallback(
    async (quiet = false) => {
      quiet ? setRefreshing(true) : setLoading(true);
      try {
        const {
          data: { user: authUser },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError || !authUser) throw new Error("Sessão expirada.");
        setUser(authUser);

        const categoriesRes = await from("merchant_categories")
          .select("*")
          .eq("is_active", true)
          .order("sort_order")
          .order("name");
        setMerchantCategories(categoriesRes.data ?? []);

        const memberRes = await from("merchant_members")
          .select("*")
          .eq("user_id", authUser.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (memberRes.error) throw memberRes.error;
        const member = memberRes.data ?? null;
        setMembership(member);
        if (!member) {
          setMerchant(null);
          setDocuments([]);
          return;
        }

        const [merchantRes, docsRes] = await Promise.all([
          from("merchants").select("*").eq("id", member.merchant_id).maybeSingle(),
          from("merchant_documents")
            .select("*")
            .eq("merchant_id", member.merchant_id)
            .order("created_at"),
        ]);
        if (merchantRes.error || !merchantRes.data)
          throw merchantRes.error ?? new Error("Estabelecimento não encontrado.");
        setMerchant(merchantRes.data);
        setDocuments(docsRes.data ?? []);
        setSettingsDraft({
          deliveryFee: String(merchantRes.data.delivery_fee ?? 0),
          minimumOrder: String(merchantRes.data.minimum_order ?? 0),
          minMinutes: String(merchantRes.data.delivery_min_minutes ?? ""),
          maxMinutes: String(merchantRes.data.delivery_max_minutes ?? ""),
          temporarilyClosed: Boolean(merchantRes.data.temporarily_closed),
        });

        if (merchantRes.data.approval_status === "approved" && merchantRes.data.is_active) {
          await loadOperations(merchantRes.data.id);
        }
      } catch (error: any) {
        toast.error(error?.message || "Não foi possível carregar o painel.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadOperations],
  );

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!merchant?.id || merchant.approval_status !== "approved") return;
    const channel = supabase
      .channel(`merchant_orders_${merchant.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `merchant_id=eq.${merchant.id}` },
        () => void loadOperations(merchant.id),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [merchant?.id, merchant?.approval_status, loadOperations]);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const createApplication = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusyAction("application");
    const { error } = await rpc("create_merchant_application", {
      _category_id: String(data.get("categoryId") ?? ""),
      _name: String(data.get("name") ?? ""),
      _legal_name: String(data.get("legalName") ?? ""),
      _document: String(data.get("document") ?? ""),
      _contact_phone: String(data.get("phone") ?? ""),
      _contact_email: String(data.get("email") ?? user?.email ?? ""),
      _address_line: String(data.get("address") ?? ""),
      _neighborhood: String(data.get("neighborhood") ?? ""),
      _city: String(data.get("city") ?? ""),
      _state: String(data.get("state") ?? ""),
      _latitude: null,
      _longitude: null,
    });
    setBusyAction(null);
    if (error) return toast.error(error.message || "Não foi possível enviar o cadastro.");
    toast.success("Cadastro enviado para análise.");
    await loadAll();
  };

  const uploadDocument = async (documentType: string, file: File) => {
    if (!merchant?.id || !user?.id) return;
    setBusyAction(`doc:${documentType}`);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${merchant.id}/${documentType}-${Date.now()}.${extension}`;
      const upload = await supabase.storage
        .from("merchant-documents")
        .upload(path, file, { upsert: false });
      if (upload.error) throw upload.error;

      const existing = documents.find((doc) => doc.document_type === documentType);
      const write = existing
        ? await from("merchant_documents")
            .update({ storage_path: path, status: "pending" })
            .eq("id", existing.id)
        : await from("merchant_documents").insert({
            merchant_id: merchant.id,
            document_type: documentType,
            storage_path: path,
            status: "pending",
          });
      if (write.error) throw write.error;
      toast.success("Documento enviado.");
      await loadAll(true);
    } catch (error: any) {
      toast.error(error?.message || "Falha ao enviar documento.");
    } finally {
      setBusyAction(null);
    }
  };

  const resubmitApplication = async () => {
    if (!merchant?.id) return;
    setBusyAction("resubmit");
    const { error } = await rpc("resubmit_merchant_application", { _merchant_id: merchant.id });
    setBusyAction(null);
    if (error) return toast.error(error.message);
    toast.success("Cadastro reenviado para análise.");
    await loadAll(true);
  };

  const transitionOrder = async (orderId: string, status: string) => {
    setBusyAction(`order:${orderId}`);
    const { error } = await rpc("merchant_transition_order", {
      _order_id: orderId,
      _new_status: status,
    });
    setBusyAction(null);
    if (error) return toast.error(error.message || "Não foi possível atualizar o pedido.");
    toast.success("Pedido atualizado.");
    if (merchant?.id) await loadOperations(merchant.id);
  };

  const rejectOrder = async (orderId: string) => {
    const reason = window.prompt("Informe o motivo do cancelamento:")?.trim();
    if (!reason) return;
    setBusyAction(`order:${orderId}`);
    const { data, error } = await rpc("merchant_reject_order", {
      _order_id: orderId,
      _reason: reason,
    });
    if (!error && data?.refund_id) {
      const { error: refundError } = await supabase.functions.invoke("process-refund", {
        body: { refundId: data.refund_id },
      });
      if (refundError)
        toast.warning(
          "Pedido cancelado. O estorno ficou pendente para nova tentativa administrativa.",
        );
      else toast.success("Pedido cancelado e estorno processado.");
    } else if (!error) {
      toast.success("Pedido cancelado.");
    }
    setBusyAction(null);
    if (error) toast.error(error.message || "Não foi possível cancelar o pedido.");
    if (merchant?.id) await loadOperations(merchant.id);
  };

  const addCategory = async () => {
    if (!merchant?.id) return;
    const name = window.prompt("Nome da categoria:")?.trim();
    if (!name) return;
    const slug = `${name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-${crypto.randomUUID().slice(0, 6)}`;
    const { error } = await from("menu_categories").insert({
      merchant_id: merchant.id,
      name,
      slug,
      sort_order: menuCategories.length,
      is_active: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Categoria criada.");
    await loadOperations(merchant.id);
  };

  const createProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!merchant?.id || !productDraft.name.trim() || Number(productDraft.price) < 0) return;
    setBusyAction("product:create");
    const { error } = await from("products").insert({
      merchant_id: merchant.id,
      menu_category_id: productDraft.categoryId || null,
      name: productDraft.name.trim(),
      description: productDraft.description.trim() || null,
      price: Number(productDraft.price),
      is_available: true,
      sort_order: products.length,
    });
    setBusyAction(null);
    if (error) return toast.error(error.message || "Não foi possível criar o produto.");
    setProductDraft({ name: "", price: "", categoryId: "", description: "" });
    toast.success("Produto criado.");
    await loadOperations(merchant.id);
  };

  const toggleProduct = async (product: any) => {
    if (!merchant?.id) return;
    const { error } = await from("products")
      .update({ is_available: !product.is_available })
      .eq("id", product.id);
    if (error) return toast.error(error.message);
    await loadOperations(merchant.id);
  };

  const deleteProduct = async (product: any) => {
    if (!merchant?.id || !window.confirm(`Excluir ${product.name}?`)) return;
    const { error } = await from("products").delete().eq("id", product.id);
    if (error) return toast.error(error.message);
    toast.success("Produto excluído.");
    await loadOperations(merchant.id);
  };

  const saveHours = async (weekday: number, patch: Record<string, unknown>) => {
    if (!merchant?.id) return;
    const current = hours.find((row) => Number(row.weekday) === weekday);
    const row = {
      merchant_id: merchant.id,
      weekday,
      opens_at: current?.opens_at ?? "08:00:00",
      closes_at: current?.closes_at ?? "22:00:00",
      second_opens_at: current?.second_opens_at ?? null,
      second_closes_at: current?.second_closes_at ?? null,
      is_closed: current?.is_closed ?? false,
      ...patch,
    };
    const { error } = await from("merchant_hours").upsert(row, {
      onConflict: "merchant_id,weekday",
    });
    if (error) return toast.error(error.message);
    await loadOperations(merchant.id);
  };

  const saveSpecialHours = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!merchant?.id || !specialDraft.serviceDate) {
      toast.error("Informe a data especial.");
      return;
    }
    if (!specialDraft.isClosed && (!specialDraft.opensAt || !specialDraft.closesAt)) {
      toast.error("Informe abertura e fechamento da data especial.");
      return;
    }
    if (
      specialDraft.secondEnabled &&
      (!specialDraft.secondOpensAt || !specialDraft.secondClosesAt)
    ) {
      toast.error("Complete o segundo horário ou desative o intervalo adicional.");
      return;
    }

    setBusyAction("special-hours");
    const closed = specialDraft.isClosed;
    const { error } = await from("merchant_special_hours").upsert(
      {
        merchant_id: merchant.id,
        service_date: specialDraft.serviceDate,
        is_closed: closed,
        opens_at: closed ? null : `${specialDraft.opensAt}:00`,
        closes_at: closed ? null : `${specialDraft.closesAt}:00`,
        second_opens_at:
          closed || !specialDraft.secondEnabled ? null : `${specialDraft.secondOpensAt}:00`,
        second_closes_at:
          closed || !specialDraft.secondEnabled ? null : `${specialDraft.secondClosesAt}:00`,
        note: specialDraft.note.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "merchant_id,service_date" },
    );
    setBusyAction(null);
    if (error) return toast.error(error.message || "Não foi possível salvar a data especial.");
    toast.success("Data especial salva.");
    setSpecialDraft({
      serviceDate: "",
      note: "",
      isClosed: true,
      opensAt: "08:00",
      closesAt: "22:00",
      secondEnabled: false,
      secondOpensAt: "",
      secondClosesAt: "",
    });
    await loadOperations(merchant.id);
  };

  const deleteSpecialHours = async (row: any) => {
    if (!merchant?.id || !window.confirm(`Remover a exceção de ${row.service_date}?`)) return;
    const { error } = await from("merchant_special_hours")
      .delete()
      .eq("id", row.id)
      .eq("merchant_id", merchant.id);
    if (error) return toast.error(error.message || "Não foi possível remover a data especial.");
    toast.success("Data especial removida.");
    await loadOperations(merchant.id);
  };

  const saveSettings = async () => {
    if (!merchant?.id) return;
    setBusyAction("settings");
    const { error } = await from("merchants")
      .update({
        delivery_fee: Number(settingsDraft.deliveryFee || 0),
        minimum_order: Number(settingsDraft.minimumOrder || 0),
        delivery_min_minutes: settingsDraft.minMinutes ? Number(settingsDraft.minMinutes) : null,
        delivery_max_minutes: settingsDraft.maxMinutes ? Number(settingsDraft.maxMinutes) : null,
        temporarily_closed: settingsDraft.temporarilyClosed,
      })
      .eq("id", merchant.id);
    setBusyAction(null);
    if (error) return toast.error(error.message);
    toast.success("Configurações salvas.");
    await loadAll(true);
  };

  const savePayoutAccount = async () => {
    if (!wallet || !payoutDraft.pixKey.trim()) return;
    setBusyAction("payout-account");
    const row = {
      wallet_id: wallet.id,
      account_type: "pix",
      pix_key: payoutDraft.pixKey.trim(),
      holder_name: payoutDraft.holderName.trim() || null,
      document: payoutDraft.document.replace(/\D/g, "") || null,
      is_active: true,
    };
    const result = payoutAccount
      ? await from("payout_accounts").update(row).eq("id", payoutAccount.id)
      : await from("payout_accounts").insert(row);
    setBusyAction(null);
    if (result.error) return toast.error(result.error.message);
    toast.success("Chave PIX salva.");
    if (merchant?.id) await loadOperations(merchant.id);
  };

  const requestPayout = async () => {
    if (!wallet || !payoutAccount)
      return toast.error("Cadastre a chave PIX antes de solicitar saque.");
    const amount = Number(payoutDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      return toast.error("Informe um valor de saque válido.");
    const attemptKey = getPayoutAttemptKey("merchant", wallet.id, amount);
    setBusyAction("payout");
    const { error } = await rpc("request_payout", {
      _wallet_id: wallet.id,
      _amount: amount,
      _idempotency_key: attemptKey,
    });
    setBusyAction(null);
    if (error) return toast.error(error.message || "Não foi possível solicitar o saque.");
    clearPayoutAttemptKey("merchant", wallet.id, attemptKey);
    setPayoutDraft((current) => ({ ...current, amount: "" }));
    toast.success("Saque solicitado.");
    if (merchant?.id) await loadOperations(merchant.id);
  };

  const pendingOrders = useMemo(
    () =>
      orders.filter((order) =>
        [
          "confirmed",
          "accepted",
          "preparing",
          "ready",
          "searching_driver",
          "driver_assigned",
          "driver_arriving_store",
          "picked_up",
          "on_the_way",
        ].includes(order.status),
      ),
    [orders],
  );
  const paidRevenue = useMemo(
    () =>
      orders
        .filter((order) => order.payment_status === "paid")
        .reduce((sum, order) => sum + Number(order.total || 0), 0),
    [orders],
  );

  if (loading)
    return (
      <div className="grid min-h-dvh place-items-center bg-black">
        <Loader2 className="h-9 w-9 animate-spin text-primary" />
      </div>
    );

  if (!membership || !merchant) {
    return (
      <MerchantApplication
        user={user}
        categories={merchantCategories}
        busy={busyAction === "application"}
        onSubmit={createApplication}
        onBack={() => navigate({ to: "/perfil" })}
      />
    );
  }

  if (merchant.approval_status !== "approved" || !merchant.is_active) {
    return (
      <MerchantReviewState
        merchant={merchant}
        documents={documents}
        busyAction={busyAction}
        onUpload={uploadDocument}
        onResubmit={resubmitApplication}
        onRefresh={() => void loadAll(true)}
        refreshing={refreshing}
        onLogout={logout}
      />
    );
  }

  const tabs = [
    { id: "dashboard", label: "Visão geral", icon: LayoutDashboard },
    { id: "orders", label: "Pedidos", icon: ShoppingBag, badge: pendingOrders.length },
    { id: "menu", label: "Cardápio", icon: UtensilsCrossed },
    { id: "hours", label: "Horários", icon: Clock3 },
    { id: "promotions", label: "Promoções", icon: BadgePercent },
    { id: "customers", label: "Clientes", icon: Users },
    { id: "reviews", label: "Avaliações", icon: Star },
    { id: "finance", label: "Financeiro", icon: WalletCards },
    { id: "settings", label: "Configurações", icon: Settings },
  ];

  return (
    <WorkspaceShell
      brand={merchant.name}
      subtitle="Painel do Estabelecimento"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onLogout={logout}
      userLabel={user?.email}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">Operação em tempo real</p>
          <p className="font-bold">
            {merchant.temporarily_closed ? "Pausado temporariamente" : "Estabelecimento ativo"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadAll(true)}
          disabled={refreshing}
          className="border-zinc-800 bg-zinc-950"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {activeTab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Pedidos em andamento" value={pendingOrders.length} />
            <MetricCard label="Pedidos registrados" value={orders.length} />
            <MetricCard
              label="Vendas pagas"
              value={money(paidRevenue)}
              hint="Total bruto dos pedidos carregados"
            />
            <MetricCard label="Saldo disponível" value={money(wallet?.available_balance)} />
          </div>
          <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
            <h2 className="font-black">Pedidos que precisam de atenção</h2>
            <div className="mt-4 space-y-3">
              {pendingOrders.slice(0, 6).map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  busy={busyAction === `order:${order.id}`}
                  onTransition={transitionOrder}
                  onReject={rejectOrder}
                />
              ))}
              {pendingOrders.length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhum pedido em andamento.</p>
              ) : null}
            </div>
          </section>
        </div>
      )}

      {activeTab === "orders" &&
        (() => {
          const columns = [
            {
              id: "new",
              label: "Novos pedidos",
              statuses: ["confirmed"],
              accent: "border-primary/30",
            },
            {
              id: "preparing",
              label: "Em preparo",
              statuses: ["accepted", "preparing"],
              accent: "border-orange-500/30",
            },
            {
              id: "ready",
              label: "Prontos para coleta",
              statuses: ["ready", "searching_driver", "driver_assigned", "driver_arriving_store"],
              accent: "border-emerald-500/30",
            },
            {
              id: "completed",
              label: "Concluídos",
              statuses: [
                "picked_up",
                "out_for_delivery",
                "on_the_way",
                "delivered",
                "cancelled",
                "refunded",
              ],
              accent: "border-zinc-800",
            },
          ];

          if (orders.length === 0) {
            return (
              <EmptyState
                title="Nenhum pedido"
                description="Os novos pedidos aparecerão aqui automaticamente."
              />
            );
          }

          return (
            <div className="grid gap-4 xl:grid-cols-4">
              {columns.map((column) => {
                const columnOrders = orders.filter((order) =>
                  column.statuses.includes(order.status),
                );
                return (
                  <section
                    key={column.id}
                    className={`min-w-0 rounded-2xl border bg-zinc-950 p-3 ${column.accent}`}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2 px-1">
                      <h2 className="text-sm font-black uppercase tracking-wide text-zinc-200">
                        {column.label}
                      </h2>
                      <span className="grid h-7 min-w-7 place-items-center rounded-full bg-zinc-900 px-2 text-xs font-black text-primary">
                        {columnOrders.length}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {columnOrders.map((order) => (
                        <OrderRow
                          key={order.id}
                          order={order}
                          busy={busyAction === `order:${order.id}`}
                          onTransition={transitionOrder}
                          onReject={rejectOrder}
                          detailed
                        />
                      ))}
                      {columnOrders.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-zinc-800 bg-black/40 p-4 text-center text-xs text-zinc-600">
                          Nenhum pedido nesta etapa.
                        </div>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          );
        })()}

      {activeTab === "menu" && (
        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-black">Categorias</h2>
                <Button type="button" size="sm" onClick={addCategory}>
                  <Plus className="mr-1 h-4 w-4" /> Nova
                </Button>
              </div>
              <div className="mt-4 space-y-2">
                {menuCategories.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between rounded-xl bg-zinc-900 px-3 py-2 text-sm"
                  >
                    <span>{category.name}</span>
                    <span className={category.is_active ? "text-emerald-400" : "text-zinc-600"}>
                      {category.is_active ? "Ativa" : "Inativa"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <form
              onSubmit={createProduct}
              className="space-y-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-5"
            >
              <h2 className="font-black">Novo produto</h2>
              <Field
                value={productDraft.name}
                onChange={(value) => setProductDraft((d) => ({ ...d, name: value }))}
                placeholder="Nome"
                required
              />
              <Field
                value={productDraft.price}
                onChange={(value) => setProductDraft((d) => ({ ...d, price: value }))}
                placeholder="Preço"
                type="number"
                required
              />
              <select
                value={productDraft.categoryId}
                onChange={(e) => setProductDraft((d) => ({ ...d, categoryId: e.target.value }))}
                className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm"
              >
                <option value="">Sem categoria</option>
                {menuCategories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <textarea
                value={productDraft.description}
                onChange={(e) => setProductDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Descrição"
                className="min-h-20 w-full rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm"
              />
              <Button disabled={busyAction === "product:create"} className="w-full">
                {busyAction === "product:create" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Adicionar produto
              </Button>
            </form>
          </div>
          <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
            <h2 className="font-black">Produtos</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {products.map((product) => (
                <div key={product.id} className="rounded-2xl border border-zinc-800 bg-black p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{product.name}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {product.description || "Sem descrição"}
                      </p>
                    </div>
                    <p className="font-black text-primary">{money(product.price)}</p>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void toggleProduct(product)}
                      className="flex-1 border-zinc-800 bg-zinc-950"
                    >
                      {product.is_available ? "Pausar" : "Ativar"}
                    </Button>
                    <MerchantProductEditor
                      product={product}
                      merchantId={merchant.id}
                      categories={menuCategories}
                      onChanged={() => loadOperations(merchant.id)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void deleteProduct(product)}
                      className="text-red-400"
                      aria-label={`Excluir ${product.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {products.length === 0 ? (
                <p className="text-sm text-zinc-500">Cadastre o primeiro produto.</p>
              ) : null}
            </div>
          </section>
        </div>
      )}

      {activeTab === "hours" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
            <h2 className="font-black">Horários de funcionamento</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Configure o expediente principal e, quando necessário, um segundo período no mesmo
              dia.
            </p>
            <div className="mt-5 space-y-3">
              {week.map((label, weekday) => {
                const row = hours.find((item) => Number(item.weekday) === weekday);
                const closed = row?.is_closed ?? true;
                const hasSecond = Boolean(row?.second_opens_at && row?.second_closes_at);
                return (
                  <div key={label} className="rounded-xl border border-zinc-900 bg-black p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm font-bold">{label}</span>
                      <button
                        type="button"
                        onClick={() =>
                          void saveHours(
                            weekday,
                            closed
                              ? {
                                  is_closed: false,
                                  opens_at: row?.opens_at ?? "08:00:00",
                                  closes_at: row?.closes_at ?? "22:00:00",
                                }
                              : {
                                  is_closed: true,
                                  opens_at: null,
                                  closes_at: null,
                                  second_opens_at: null,
                                  second_closes_at: null,
                                },
                          )
                        }
                        className={`rounded-lg px-3 py-2 text-xs font-black ${
                          closed
                            ? "bg-zinc-900 text-zinc-500"
                            : "bg-emerald-500/15 text-emerald-400"
                        }`}
                      >
                        {closed ? "Fechado" : "Aberto"}
                      </button>
                    </div>
                    {!closed ? (
                      <div className="mt-3 space-y-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-[10px] font-bold uppercase text-zinc-600">
                            Abertura
                            <input
                              type="time"
                              value={(row?.opens_at ?? "08:00").slice(0, 5)}
                              onChange={(event) =>
                                void saveHours(weekday, { opens_at: `${event.target.value}:00` })
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                            />
                          </label>
                          <label className="text-[10px] font-bold uppercase text-zinc-600">
                            Fechamento
                            <input
                              type="time"
                              value={(row?.closes_at ?? "22:00").slice(0, 5)}
                              onChange={(event) =>
                                void saveHours(weekday, { closes_at: `${event.target.value}:00` })
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                            />
                          </label>
                        </div>
                        {hasSecond ? (
                          <div className="grid gap-2 rounded-xl border border-primary/10 bg-primary/5 p-3 sm:grid-cols-[1fr_1fr_auto]">
                            <label className="text-[10px] font-bold uppercase text-zinc-600">
                              2ª abertura
                              <input
                                type="time"
                                value={row.second_opens_at.slice(0, 5)}
                                onChange={(event) =>
                                  void saveHours(weekday, {
                                    second_opens_at: `${event.target.value}:00`,
                                  })
                                }
                                className="mt-1 w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm"
                              />
                            </label>
                            <label className="text-[10px] font-bold uppercase text-zinc-600">
                              2º fechamento
                              <input
                                type="time"
                                value={row.second_closes_at.slice(0, 5)}
                                onChange={(event) =>
                                  void saveHours(weekday, {
                                    second_closes_at: `${event.target.value}:00`,
                                  })
                                }
                                className="mt-1 w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                void saveHours(weekday, {
                                  second_opens_at: null,
                                  second_closes_at: null,
                                })
                              }
                              className="self-end rounded-lg border border-red-500/20 px-3 py-2 text-xs font-bold text-red-400"
                            >
                              Remover
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void saveHours(weekday, {
                                second_opens_at: "14:00:00",
                                second_closes_at: "22:00:00",
                              })
                            }
                            className="text-xs font-bold text-primary"
                          >
                            + Adicionar segundo período
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <form
              onSubmit={saveSpecialHours}
              className="space-y-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-5"
            >
              <div>
                <h2 className="font-black">Feriados e datas especiais</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Uma exceção por data substitui o horário semanal daquele dia.
                </p>
              </div>
              <input
                type="date"
                required
                min={new Date().toISOString().slice(0, 10)}
                value={specialDraft.serviceDate}
                onChange={(event) =>
                  setSpecialDraft((current) => ({
                    ...current,
                    serviceDate: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm"
              />
              <Field
                value={specialDraft.note}
                onChange={(value) => setSpecialDraft((current) => ({ ...current, note: value }))}
                placeholder="Motivo (ex.: feriado municipal)"
              />
              <label className="flex items-center gap-2 rounded-xl border border-zinc-900 bg-black p-3 text-sm">
                <input
                  type="checkbox"
                  checked={specialDraft.isClosed}
                  onChange={(event) =>
                    setSpecialDraft((current) => ({
                      ...current,
                      isClosed: event.target.checked,
                    }))
                  }
                />
                Fechado o dia inteiro
              </label>
              {!specialDraft.isClosed ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={specialDraft.opensAt}
                      onChange={(event) =>
                        setSpecialDraft((current) => ({
                          ...current,
                          opensAt: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm"
                    />
                    <input
                      type="time"
                      value={specialDraft.closesAt}
                      onChange={(event) =>
                        setSpecialDraft((current) => ({
                          ...current,
                          closesAt: event.target.value,
                        }))
                      }
                      className="rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-500">
                    <input
                      type="checkbox"
                      checked={specialDraft.secondEnabled}
                      onChange={(event) =>
                        setSpecialDraft((current) => ({
                          ...current,
                          secondEnabled: event.target.checked,
                        }))
                      }
                    />
                    Adicionar segundo período
                  </label>
                  {specialDraft.secondEnabled ? (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="time"
                        value={specialDraft.secondOpensAt}
                        onChange={(event) =>
                          setSpecialDraft((current) => ({
                            ...current,
                            secondOpensAt: event.target.value,
                          }))
                        }
                        className="rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm"
                      />
                      <input
                        type="time"
                        value={specialDraft.secondClosesAt}
                        onChange={(event) =>
                          setSpecialDraft((current) => ({
                            ...current,
                            secondClosesAt: event.target.value,
                          }))
                        }
                        className="rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm"
                      />
                    </div>
                  ) : null}
                </>
              ) : null}
              <Button disabled={busyAction === "special-hours"} className="w-full">
                {busyAction === "special-hours" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Salvar data especial
              </Button>
            </form>

            <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
              <h2 className="font-black">Próximas exceções</h2>
              <div className="mt-4 space-y-2">
                {specialHours.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-900 bg-black p-3"
                  >
                    <div>
                      <p className="text-sm font-bold">
                        {new Date(`${row.service_date}T12:00:00`).toLocaleDateString("pt-BR")}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {row.is_closed
                          ? row.note || "Fechado"
                          : `${row.opens_at?.slice(0, 5)}–${row.closes_at?.slice(0, 5)}${
                              row.second_opens_at && row.second_closes_at
                                ? ` · ${row.second_opens_at.slice(0, 5)}–${row.second_closes_at.slice(0, 5)}`
                                : ""
                            }`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteSpecialHours(row)}
                      className="rounded-lg border border-red-500/20 px-3 py-2 text-xs font-bold text-red-400"
                    >
                      Remover
                    </button>
                  </div>
                ))}
                {specialHours.length === 0 ? (
                  <p className="text-sm text-zinc-500">Nenhuma data especial futura cadastrada.</p>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      )}

      {activeTab === "promotions" && (
        <MerchantPromotionsPanel
          merchantId={merchant.id}
          products={products}
          categories={menuCategories}
        />
      )}

      {activeTab === "customers" && <MerchantCustomersPanel orders={orders} />}

      {activeTab === "reviews" && (
        <MerchantReviewsPanel
          reviews={reviews}
          rating={Number(merchant.rating ?? 0)}
          reviewCount={Number(merchant.review_count ?? reviews.length)}
        />
      )}

      {activeTab === "finance" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard label="Saldo total" value={money(wallet?.balance)} />
            <MetricCard label="Disponível" value={money(wallet?.available_balance)} />
            <MetricCard label="Reservado" value={money(wallet?.reserved_balance)} />
          </div>
          {!wallet ? (
            <EmptyState
              title="Carteira ainda sem movimentação"
              description="A carteira é criada automaticamente quando o primeiro pedido entregue é liquidado."
            />
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              <section className="space-y-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
                <h2 className="font-black">Conta para repasse</h2>
                <Field
                  value={payoutDraft.pixKey}
                  onChange={(value) => setPayoutDraft((d) => ({ ...d, pixKey: value }))}
                  placeholder="Chave PIX"
                />
                <Field
                  value={payoutDraft.holderName}
                  onChange={(value) => setPayoutDraft((d) => ({ ...d, holderName: value }))}
                  placeholder="Nome do titular"
                />
                <Field
                  value={payoutDraft.document}
                  onChange={(value) => setPayoutDraft((d) => ({ ...d, document: value }))}
                  placeholder="CPF/CNPJ do titular"
                />
                <Button
                  type="button"
                  onClick={savePayoutAccount}
                  disabled={busyAction === "payout-account"}
                  className="w-full"
                >
                  Salvar chave PIX
                </Button>
                <div className="border-t border-zinc-900 pt-4">
                  <Field
                    value={payoutDraft.amount}
                    onChange={(value) => setPayoutDraft((d) => ({ ...d, amount: value }))}
                    placeholder="Valor do saque"
                    type="number"
                  />
                  <Button
                    type="button"
                    onClick={requestPayout}
                    disabled={busyAction === "payout" || !payoutAccount}
                    className="mt-3 w-full"
                  >
                    Solicitar saque
                  </Button>
                </div>
              </section>
              <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
                <h2 className="font-black">Últimos saques</h2>
                <div className="mt-4 space-y-2">
                  {payouts.map((payout) => (
                    <div
                      key={payout.id}
                      className="flex items-center justify-between rounded-xl bg-black p-3 text-sm"
                    >
                      <div>
                        <p className="font-bold">{money(payout.amount)}</p>
                        <p className="text-xs text-zinc-500">{dateTime(payout.requested_at)}</p>
                      </div>
                      <span className="text-xs font-black uppercase text-primary">
                        {payout.status}
                      </span>
                    </div>
                  ))}
                  {payouts.length === 0 ? (
                    <p className="text-sm text-zinc-500">Nenhum saque solicitado.</p>
                  ) : null}
                </div>
              </section>
              <section className="xl:col-span-2 rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
                <h2 className="font-black">Extrato</h2>
                <div className="mt-4 divide-y divide-zinc-900">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between py-3 text-sm">
                      <div>
                        <p className="font-semibold">{tx.description || tx.transaction_type}</p>
                        <p className="text-xs text-zinc-500">{dateTime(tx.created_at)}</p>
                      </div>
                      <span
                        className={
                          Number(tx.balance_delta) >= 0
                            ? "font-black text-emerald-400"
                            : "font-black text-red-400"
                        }
                      >
                        {Number(tx.balance_delta) >= 0 ? "+" : ""}
                        {money(tx.balance_delta)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
          <section className="space-y-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
            <h2 className="font-black">Entrega e pedido mínimo</h2>
            <label className="block text-xs text-zinc-500">
              Taxa de entrega
              <Field
                value={settingsDraft.deliveryFee}
                onChange={(value) => setSettingsDraft((d) => ({ ...d, deliveryFee: value }))}
                type="number"
                placeholder="0,00"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Pedido mínimo
              <Field
                value={settingsDraft.minimumOrder}
                onChange={(value) => setSettingsDraft((d) => ({ ...d, minimumOrder: value }))}
                type="number"
                placeholder="0,00"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-500">
                Prazo mínimo
                <Field
                  value={settingsDraft.minMinutes}
                  onChange={(value) => setSettingsDraft((d) => ({ ...d, minMinutes: value }))}
                  type="number"
                  placeholder="30"
                />
              </label>
              <label className="text-xs text-zinc-500">
                Prazo máximo
                <Field
                  value={settingsDraft.maxMinutes}
                  onChange={(value) => setSettingsDraft((d) => ({ ...d, maxMinutes: value }))}
                  type="number"
                  placeholder="60"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() =>
                setSettingsDraft((d) => ({ ...d, temporarilyClosed: !d.temporarilyClosed }))
              }
              className={`w-full rounded-xl border p-3 text-left text-sm font-bold ${settingsDraft.temporarilyClosed ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"}`}
            >
              {settingsDraft.temporarilyClosed
                ? "Estabelecimento pausado"
                : "Recebendo pedidos normalmente"}
            </button>
            <Button
              type="button"
              onClick={saveSettings}
              disabled={busyAction === "settings"}
              className="w-full"
            >
              Salvar configurações
            </Button>
          </section>
          <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
            <h2 className="font-black">Avaliações</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Nota atual:{" "}
              <strong className="text-primary">{Number(merchant.rating ?? 0).toFixed(1)}</strong> (
              {merchant.review_count ?? 0} avaliações)
            </p>
            <div className="mt-4 space-y-3">
              {reviews.slice(0, 8).map((review) => (
                <div key={review.id} className="rounded-xl bg-black p-3">
                  <p className="text-sm font-bold text-primary">
                    {review.merchant_rating ?? "—"}/5
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">{review.comment || "Sem comentário"}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </WorkspaceShell>
  );
}

function MerchantApplication({ user, categories, busy, onSubmit, onBack }: any) {
  return (
    <div className="min-h-dvh bg-black px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-bold text-zinc-500 hover:text-white"
        >
          ← Voltar para minha conta
        </button>
        <div className="mt-6 rounded-3xl border border-zinc-900 bg-zinc-950 p-6 md:p-8">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-primary">
            APOIS ENTREGA
          </p>
          <h1 className="mt-2 text-3xl font-black">Cadastrar estabelecimento</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Envie os dados do negócio. A liberação do painel operacional ocorre após análise
            administrativa.
          </p>
          <form onSubmit={onSubmit} className="mt-8 grid gap-4 md:grid-cols-2">
            <input name="name" required placeholder="Nome do estabelecimento" className="Input" />
            <input name="legalName" placeholder="Razão social" className="Input" />
            <input name="document" required placeholder="CNPJ/CPF" className="Input" />
            <select name="categoryId" required className="Input">
              <option value="">Categoria</option>
              {categories.map((category: any) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input name="phone" required placeholder="Telefone" className="Input" />
            <input
              name="email"
              type="email"
              defaultValue={user?.email ?? ""}
              required
              placeholder="E-mail"
              className="Input"
            />
            <input name="address" required placeholder="Endereço" className="Input md:col-span-2" />
            <input name="neighborhood" required placeholder="Bairro" className="Input" />
            <input name="city" required placeholder="Cidade" className="Input" />
            <input name="state" required maxLength={2} placeholder="UF" className="Input" />
            <div className="md:col-span-2">
              <Button disabled={busy} className="h-12 w-full font-black uppercase">
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Store className="mr-2 h-4 w-4" />
                )}
                Enviar cadastro
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function MerchantReviewState({
  merchant,
  documents,
  busyAction,
  onUpload,
  onResubmit,
  onRefresh,
  refreshing,
  onLogout,
}: any) {
  const requiredDocs = [
    { type: "documento_empresa", label: "Documento da empresa (CNPJ/MEI)" },
    { type: "responsavel", label: "Documento do responsável" },
    { type: "comprovante_endereco", label: "Comprovante de endereço" },
  ];
  return (
    <div className="min-h-dvh bg-black p-4 text-white md:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-black text-primary">APOIS ENTREGA</p>
            <h1 className="text-2xl font-black">{merchant.name}</h1>
          </div>
          <button type="button" onClick={onLogout} className="text-sm font-bold text-zinc-500">
            Sair
          </button>
        </div>
        <div className="mt-8 rounded-3xl border border-zinc-900 bg-zinc-950 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-zinc-500">Situação do cadastro</p>
              <p className="mt-1 text-xl font-black uppercase text-primary">
                {merchant.approval_status.replaceAll("_", " ")}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={refreshing}
              className="border-zinc-800 bg-black"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
          {merchant.rejection_reason ? (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
              <strong>Motivo:</strong> {merchant.rejection_reason}
            </div>
          ) : null}
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {requiredDocs.map((item) => {
              const doc = documents.find((document: any) => document.document_type === item.type);
              return (
                <label key={item.type} className="rounded-2xl border border-zinc-800 bg-black p-4">
                  <p className="text-sm font-bold">{item.label}</p>
                  <p
                    className={`mt-1 text-xs font-black uppercase ${doc?.status === "approved" ? "text-emerald-400" : doc?.status === "rejected" ? "text-red-400" : "text-primary"}`}
                  >
                    {doc?.status ?? "Não enviado"}
                  </p>
                  {doc?.rejection_reason ? (
                    <p className="mt-2 text-xs text-red-300">{doc.rejection_reason}</p>
                  ) : null}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="mt-4 block w-full text-xs text-zinc-500 file:mr-2 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:font-bold file:text-black"
                    disabled={busyAction === `doc:${item.type}`}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void onUpload(item.type, file);
                    }}
                  />
                </label>
              );
            })}
          </div>
          {merchant.approval_status === "rejected" ? (
            <Button
              onClick={onResubmit}
              disabled={busyAction === "resubmit"}
              className="mt-6 w-full"
            >
              Reenviar para análise
            </Button>
          ) : null}
          <p className="mt-6 text-sm text-zinc-500">
            O painel de pedidos, cardápio e financeiro será liberado automaticamente após a
            aprovação.
          </p>
        </div>
      </div>
    </div>
  );
}

function formatOrderAddress(address: any) {
  if (!address || typeof address !== "object") return "Não informado";
  return [
    [address.street || address.address_line, address.number].filter(Boolean).join(", "),
    address.neighborhood,
    [address.city, address.state].filter(Boolean).join(" - "),
    address.complement,
    address.reference ? `Referência: ${address.reference}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function printMerchantOrder(order: any) {
  const popup = window.open("", "_blank", "width=520,height=760");
  if (!popup) {
    toast.error("O navegador bloqueou a janela de impressão.");
    return;
  }
  popup.opener = null;
  popup.document.title = `Pedido ${order.order_number} - APOIS ENTREGA`;

  const style = popup.document.createElement("style");
  style.textContent =
    "body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}.muted{color:#555;font-size:12px}hr{border:0;border-top:1px dashed #777;margin:16px 0}pre{white-space:pre-wrap;font:inherit;line-height:1.5}@media print{body{margin:0}}";
  popup.document.head.appendChild(style);

  const heading = popup.document.createElement("h1");
  heading.textContent = `APOIS ENTREGA · PEDIDO #${order.order_number}`;
  const meta = popup.document.createElement("div");
  meta.className = "muted";
  meta.textContent = `${dateTime(order.created_at)} · ${String(order.status ?? "").toUpperCase()}`;
  const separator = popup.document.createElement("hr");
  const receipt = popup.document.createElement("pre");

  const itemLines = (order.order_items ?? []).map(
    (item: any) => `${item.quantity}x ${item.product_name}    ${money(item.line_total)}`,
  );
  const customer = order.customer_user_id
    ? `Cliente #${String(order.customer_user_id).slice(0, 8).toUpperCase()}`
    : "Cliente não identificado";
  const details = [
    customer,
    `Modalidade: ${String(order.fulfillment_type ?? "delivery").toUpperCase()}`,
    `Pagamento: ${String(order.payment_method ?? "pix").toUpperCase()} · ${String(order.payment_status ?? "").toUpperCase()}`,
    order.fulfillment_type === "pickup"
      ? "Retirada no estabelecimento"
      : `Endereço: ${formatOrderAddress(order.delivery_address)}`,
    "",
    ...itemLines,
    "",
    `Subtotal: ${money(order.subtotal)}`,
    `Desconto: ${money(order.discount)}`,
    `Taxa de entrega: ${money(order.delivery_fee)}`,
    `TOTAL: ${money(order.total)}`,
    order.observation ? `\nOBSERVAÇÃO: ${order.observation}` : "",
  ].filter((line) => line !== "");
  receipt.textContent = details.join("\n");

  popup.document.body.append(heading, meta, separator, receipt);
  popup.focus();
  window.setTimeout(() => popup.print(), 150);
}

function OrderRow({ order, busy, onTransition, onReject, detailed = false }: any) {
  const nextActions: Array<{ status: string; label: string }> =
    order.status === "confirmed"
      ? [
          { status: "accepted", label: "Aceitar" },
          { status: "preparing", label: "Aceitar e preparar" },
        ]
      : order.status === "accepted"
        ? [{ status: "preparing", label: "Iniciar preparo" }]
        : order.status === "preparing"
          ? [{ status: "ready", label: "Marcar como pronto" }]
          : [];
  const canReject = ["confirmed", "accepted", "preparing"].includes(order.status);
  return (
    <div className="rounded-2xl border border-zinc-900 bg-black p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black">Pedido #{order.order_number}</p>
          <p className="text-xs text-zinc-500">
            {dateTime(order.created_at)} · {order.order_items?.length ?? 0} item(ns)
          </p>
        </div>
        <div className="text-right">
          <p className="font-black text-primary">{money(order.total)}</p>
          <p className="text-[10px] font-black uppercase text-zinc-500">
            {order.status} · {order.payment_status}
          </p>
        </div>
      </div>
      {detailed ? (
        <div className="mt-3 space-y-1 border-t border-zinc-900 pt-3">
          {order.order_items?.map((item: any) => (
            <p key={item.id} className="text-sm text-zinc-400">
              {item.quantity}x {item.product_name} — {money(item.line_total)}
            </p>
          ))}
          {order.observation ? (
            <p className="mt-2 rounded-lg bg-zinc-950 p-2 text-xs text-zinc-400">
              Obs.: {order.observation}
            </p>
          ) : null}
          <div className="mt-3 grid gap-2 rounded-xl border border-zinc-900 bg-zinc-950 p-3 text-xs text-zinc-500 sm:grid-cols-2">
            <p>
              Cliente: #
              {String(order.customer_user_id ?? "")
                .slice(0, 8)
                .toUpperCase() || "—"}
            </p>
            <p>Modalidade: {String(order.fulfillment_type ?? "delivery").toUpperCase()}</p>
            <p>Pagamento: {String(order.payment_method ?? "pix").toUpperCase()}</p>
            <p>Status financeiro: {String(order.payment_status ?? "—").toUpperCase()}</p>
            <p className="sm:col-span-2">
              {order.fulfillment_type === "pickup"
                ? "Retirada no estabelecimento"
                : `Endereço: ${formatOrderAddress(order.delivery_address)}`}
            </p>
          </div>
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => printMerchantOrder(order)}
        className="mt-4 border-zinc-800 bg-zinc-950"
      >
        <Printer className="mr-1 h-3.5 w-3.5" />
        Imprimir pedido
      </Button>
      {nextActions.length > 0 || canReject ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {nextActions.map((action) => (
            <Button
              type="button"
              size="sm"
              key={action.status}
              disabled={busy || order.payment_status !== "paid"}
              onClick={() => void onTransition(order.id, action.status)}
            >
              {busy ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <PackageCheck className="mr-1 h-3 w-3" />
              )}
              {action.label}
            </Button>
          ))}
          {canReject ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void onReject(order.id)}
              className="border-red-500/20 text-red-400"
            >
              Cancelar
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      type={type}
      required={required}
      step={type === "number" ? "0.01" : undefined}
      min={type === "number" ? "0" : undefined}
      className="mt-1 w-full rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm text-white outline-none focus:border-primary"
    />
  );
}
