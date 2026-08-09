import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Bike,
  Building2,
  CircleDollarSign,
  FileCheck2,
  Headphones,
  LayoutDashboard,
  Loader2,
  MapPinned,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Star,
  Users,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, MetricCard, WorkspaceShell } from "@/components/WorkspaceShell";
import { AdminCoveragePanel } from "@/components/AdminCoveragePanel";
import { AdminSupportPanel } from "@/components/AdminSupportPanel";
import { AdminRealtimeOperationsPanel } from "@/components/AdminRealtimeOperationsPanel";
import { AdminReviewsPanel } from "@/components/AdminReviewsPanel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const from = (table: string) => (supabase.from as any)(table);
const rpc = (name: string, args?: Record<string, unknown>) =>
  (supabase.rpc as any)(name, args ?? {});
const money = (value: unknown) =>
  `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;
const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } });
    const { data: role } = await from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw redirect({ to: "/inicio" });
    return { session };
  },
  component: AdminWorkspace,
  head: () => ({ meta: [{ title: "Administração | APOIS ENTREGA" }] }),
});

function AdminWorkspace() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [couriers, setCouriers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [feeRules, setFeeRules] = useState<any[]>([]);
  const [settingsRows, setSettingsRows] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const loadAll = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const {
        data: { user: authUser },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !authUser) throw new Error("Sessão expirada.");
      setUser(authUser);
      const checks = await Promise.all([
        from("profiles").select("*").order("created_at", { ascending: false }).limit(500),
        from("user_roles").select("*").limit(1000),
        from("merchants")
          .select("*, merchant_documents(*), merchant_categories(name)")
          .order("created_at", { ascending: false })
          .limit(300),
        from("couriers")
          .select("*, courier_documents(*)")
          .order("created_at", { ascending: false })
          .limit(300),
        from("orders")
          .select("*, merchants(name), payments(id,status,amount,provider,provider_charge_id)")
          .order("created_at", { ascending: false })
          .limit(500),
        from("support_tickets")
          .select("*, support_messages(id,sender_user_id,message,is_internal,created_at)")
          .order("created_at", { ascending: false })
          .limit(300),
        from("payouts")
          .select("*, wallets(owner_type,merchant_id,courier_id)")
          .order("requested_at", { ascending: false })
          .limit(300),
        from("refunds")
          .select("*, payments(status,provider,provider_charge_id)")
          .order("created_at", { ascending: false })
          .limit(300),
        from("payments").select("*").order("created_at", { ascending: false }).limit(500),
        from("cities").select("*").order("name"),
        from("fee_rules").select("*").order("created_at", { ascending: false }),
        from("platform_settings").select("*").order("key"),
        from("admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(100),
      ]);
      const firstError = checks.find((result) => result.error)?.error;
      if (firstError) throw firstError;
      setProfiles(checks[0].data ?? []);
      setRoles(checks[1].data ?? []);
      setMerchants(checks[2].data ?? []);
      setCouriers(checks[3].data ?? []);
      setOrders(checks[4].data ?? []);
      setTickets(checks[5].data ?? []);
      setPayouts(checks[6].data ?? []);
      setRefunds(checks[7].data ?? []);
      setPayments(checks[8].data ?? []);
      setCities(checks[9].data ?? []);
      setFeeRules(checks[10].data ?? []);
      setSettingsRows(checks[11].data ?? []);
      setAuditLogs(checks[12].data ?? []);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível carregar a administração.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const refresh = () => void loadAll(true);
    const channel = supabase
      .channel("admin_live_orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadAll]);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const reviewMerchant = async (
    merchantId: string,
    status: "approved" | "rejected" | "blocked",
  ) => {
    const reason = status === "approved" ? null : window.prompt("Informe o motivo:")?.trim();
    if (status !== "approved" && !reason) return;
    setBusy(`merchant:${merchantId}`);
    const { error } = await rpc("admin_review_merchant", {
      _merchant_id: merchantId,
      _status: status,
      _reason: reason,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Estabelecimento ${status === "approved" ? "aprovado" : "atualizado"}.`);
    await loadAll(true);
  };

  const reviewCourier = async (courierId: string, status: "approved" | "rejected" | "blocked") => {
    const reason = status === "approved" ? null : window.prompt("Informe o motivo:")?.trim();
    if (status !== "approved" && !reason) return;
    setBusy(`courier:${courierId}`);
    const { error } = await rpc("admin_review_courier", {
      _courier_id: courierId,
      _status: status,
      _reason: reason,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Entregador ${status === "approved" ? "aprovado" : "atualizado"}.`);
    await loadAll(true);
  };

  const reviewDocument = async (
    kind: "merchant" | "courier",
    documentId: string,
    status: "approved" | "rejected",
  ) => {
    const reason =
      status === "rejected" ? window.prompt("Motivo da reprovação do documento:")?.trim() : null;
    if (status === "rejected" && !reason) return;
    setBusy(`doc:${documentId}`);
    const { error } = await rpc("admin_review_document", {
      _kind: kind,
      _document_id: documentId,
      _status: status,
      _reason: reason,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Documento revisado.");
    await loadAll(true);
  };

  const openDocument = async (kind: "merchant" | "courier", path: string) => {
    const bucket = kind === "merchant" ? "merchant-documents" : "courier-documents";
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return toast.error("Não foi possível abrir o documento.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const setUserActive = async (profile: any, isActive: boolean) => {
    if (profile.id === user?.id && !isActive)
      return toast.error("Você não pode bloquear sua própria conta administrativa.");
    const reason = isActive ? null : window.prompt("Motivo do bloqueio:")?.trim();
    if (!isActive && !reason) return;
    setBusy(`user:${profile.id}`);
    const { error } = await rpc("admin_set_user_active", {
      _user_id: profile.id,
      _is_active: isActive,
      _reason: reason,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(isActive ? "Usuário reativado." : "Usuário bloqueado.");
    await loadAll(true);
  };

  const updateTicket = async (ticket: any, status: string) => {
    setBusy(`ticket:${ticket.id}`);
    const { error } = await rpc("admin_update_support_ticket", {
      _ticket_id: ticket.id,
      _status: status,
      _priority: ticket.priority,
      _assigned_admin_id: user?.id ?? null,
    });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Chamado atualizado.");
    await loadAll(true);
  };

  const replyTicket = async (ticket: any, internal: boolean) => {
    const message = window
      .prompt(
        internal ? "Nota interna para a equipe:" : "Resposta que será enviada ao solicitante:",
        "",
      )
      ?.trim();
    if (!message) return;
    if (message.length > 5000) {
      toast.error("A mensagem pode ter no máximo 5.000 caracteres.");
      return;
    }

    setBusy(`ticket-reply:${ticket.id}`);
    const { error } = await rpc("admin_reply_support_ticket", {
      _ticket_id: ticket.id,
      _message: message,
      _is_internal: internal,
      _set_in_progress: !internal,
    });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(internal ? "Nota interna registrada." : "Resposta enviada ao chamado.");
    await loadAll(true);
  };

  const processRefund = async (refund: any) => {
    setBusy(`refund:${refund.id}`);
    const { error } = await supabase.functions.invoke("process-refund", {
      body: { refundId: refund.id },
    });
    setBusy(null);
    if (error) return toast.error("Não foi possível processar o estorno agora.");
    toast.success("Estorno processado/conciliado.");
    await loadAll(true);
  };

  const settlePayout = async (
    payout: any,
    status: "processing" | "paid" | "failed" | "cancelled",
  ) => {
    let provider = payout.provider || null;
    let providerPayoutId = payout.provider_payout_id || null;
    let failureReason = null;
    if (status === "paid") {
      provider = window.prompt("Provedor do repasse:", provider || "manual")?.trim() || "manual";
      providerPayoutId = window
        .prompt("Referência/ID do repasse concluído:", providerPayoutId || "")
        ?.trim();
      if (!providerPayoutId)
        return toast.error("Informe a referência real do repasse antes de marcar como pago.");
    }
    if (status === "failed") {
      failureReason = window.prompt("Motivo da falha:")?.trim();
      if (!failureReason) return;
    }
    setBusy(`payout:${payout.id}`);
    const { error } = await rpc("admin_settle_payout", {
      _payout_id: payout.id,
      _new_status: status,
      _provider: provider,
      _provider_payout_id: providerPayoutId,
      _failure_reason: failureReason,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Saque atualizado.");
    await loadAll(true);
  };

  const toggleCity = async (city: any) => {
    setBusy(`city:${city.id}`);
    const { error } = await rpc("admin_set_city_active", {
      _city_id: city.id,
      _is_active: !city.is_active,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(city.is_active ? "Cidade desativada." : "Cidade ativada.");
    await loadAll(true);
  };

  const editFeeRule = async (rule: any) => {
    const commissionRaw = window.prompt(
      "Comissão do estabelecimento (%):",
      String(rule.merchant_commission_percent ?? 0),
    );
    if (commissionRaw === null) return;
    const courierBaseRaw = window.prompt(
      "Base do entregador (R$):",
      String(rule.courier_base_fee ?? 0),
    );
    if (courierBaseRaw === null) return;
    const perKmRaw = window.prompt(
      "Valor por km do entregador (R$):",
      String(rule.courier_per_km ?? 0),
    );
    if (perKmRaw === null) return;
    const minimumRaw = window.prompt(
      "Ganho mínimo do entregador (R$):",
      String(rule.courier_minimum_fee ?? 0),
    );
    if (minimumRaw === null) return;
    const customerFeeRaw = window.prompt(
      "Taxa de serviço do cliente (R$):",
      String(rule.customer_service_fee ?? 0),
    );
    if (customerFeeRaw === null) return;

    const values = {
      commission: Number(commissionRaw.replace(",", ".")),
      courierBase: Number(courierBaseRaw.replace(",", ".")),
      perKm: Number(perKmRaw.replace(",", ".")),
      minimum: Number(minimumRaw.replace(",", ".")),
      customerFee: Number(customerFeeRaw.replace(",", ".")),
    };

    if (
      !Number.isFinite(values.commission) ||
      values.commission < 0 ||
      values.commission > 100 ||
      !Number.isFinite(values.courierBase) ||
      values.courierBase < 0 ||
      !Number.isFinite(values.perKm) ||
      values.perKm < 0 ||
      !Number.isFinite(values.minimum) ||
      values.minimum < 0 ||
      !Number.isFinite(values.customerFee) ||
      values.customerFee < 0
    ) {
      toast.error("Revise os valores da regra financeira.");
      return;
    }

    setBusy(`fee:${rule.id}`);
    const { error } = await rpc("admin_update_fee_rule", {
      _fee_rule_id: rule.id,
      _merchant_commission_percent: values.commission,
      _courier_base_fee: values.courierBase,
      _courier_per_km: values.perKm,
      _courier_minimum_fee: values.minimum,
      _customer_service_fee: values.customerFee,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Regra financeira atualizada e auditada.");
    await loadAll(true);
  };

  const editSetting = async (setting: any) => {
    const raw = window.prompt(`Valor JSON para ${setting.key}:`, JSON.stringify(setting.value));
    if (raw === null) return;
    try {
      const value = JSON.parse(raw);
      setBusy(`setting:${setting.key}`);
      const { error } = await rpc("admin_update_platform_setting", {
        _key: setting.key,
        _value: value,
      });
      setBusy(null);
      if (error) throw error;
      toast.success("Configuração atualizada e auditada.");
      await loadAll(true);
    } catch (error: any) {
      setBusy(null);
      toast.error(error?.message || "JSON inválido.");
    }
  };

  const pendingMerchants = useMemo(
    () => merchants.filter((item) => ["pending", "under_review"].includes(item.approval_status)),
    [merchants],
  );
  const pendingCouriers = useMemo(
    () => couriers.filter((item) => ["pending", "under_review"].includes(item.status)),
    [couriers],
  );
  const activeOrders = useMemo(
    () => orders.filter((item) => !["delivered", "cancelled", "refunded"].includes(item.status)),
    [orders],
  );
  const openTickets = useMemo(
    () => tickets.filter((item) => !["closed", "resolved"].includes(item.status)),
    [tickets],
  );
  const pendingPayouts = useMemo(
    () => payouts.filter((item) => ["pending", "processing"].includes(item.status)),
    [payouts],
  );
  const pendingRefunds = useMemo(
    () => refunds.filter((item) => ["pending", "processing", "failed"].includes(item.status)),
    [refunds],
  );
  const paidVolume = useMemo(
    () =>
      payments
        .filter((item) => item.status === "paid")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [payments],
  );
  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );
  const rolesByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const role of roles) map.set(role.user_id, [...(map.get(role.user_id) ?? []), role.role]);
    return map;
  }, [roles]);

  if (loading)
    return (
      <div className="grid min-h-dvh place-items-center bg-black">
        <Loader2 className="h-9 w-9 animate-spin text-primary" />
      </div>
    );

  const tabs = [
    { id: "dashboard", label: "Visão geral", icon: LayoutDashboard },
    { id: "merchants", label: "Estabelecimentos", icon: Building2, badge: pendingMerchants.length },
    { id: "couriers", label: "Entregadores", icon: Bike, badge: pendingCouriers.length },
    { id: "orders", label: "Pedidos", icon: ShoppingBag, badge: activeOrders.length },
    { id: "realtime", label: "Tempo real", icon: Activity, badge: activeOrders.length },
    { id: "users", label: "Usuários", icon: Users },
    { id: "reviews", label: "Avaliações", icon: Star },
    { id: "coverage", label: "Cobertura", icon: MapPinned },
    {
      id: "finance",
      label: "Financeiro",
      icon: WalletCards,
      badge: pendingPayouts.length + pendingRefunds.length,
    },
    { id: "support", label: "Suporte", icon: Headphones, badge: openTickets.length },
    { id: "settings", label: "Operação", icon: Settings },
    { id: "audit", label: "Auditoria", icon: ShieldCheck },
  ];

  return (
    <WorkspaceShell
      brand="Administração"
      subtitle="APOIS ENTREGA"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onLogout={logout}
      userLabel={user?.email}
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-zinc-500">
          Dados operacionais protegidos por RLS e trilha de auditoria.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadAll(true)}
          disabled={refreshing}
          className="border-zinc-800 bg-zinc-950"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {activeTab === "dashboard" && (
        <Dashboard
          profiles={profiles}
          merchants={merchants}
          couriers={couriers}
          orders={orders}
          activeOrders={activeOrders}
          openTickets={openTickets}
          pendingPayouts={pendingPayouts}
          paidVolume={paidVolume}
        />
      )}

      {activeTab === "merchants" && (
        <div className="space-y-4">
          {merchants.map((merchant) => (
            <ApplicationCard
              key={merchant.id}
              kind="merchant"
              item={merchant}
              profile={profileById.get(merchant.owner_user_id)}
              busy={busy === `merchant:${merchant.id}`}
              onReview={reviewMerchant}
              onDocument={reviewDocument}
              onOpenDocument={openDocument}
            />
          ))}
          {merchants.length === 0 ? (
            <EmptyState
              title="Nenhum estabelecimento"
              description="Cadastros de estabelecimentos aparecerão aqui."
            />
          ) : null}
        </div>
      )}

      {activeTab === "couriers" && (
        <div className="space-y-4">
          {couriers.map((courier) => (
            <ApplicationCard
              key={courier.id}
              kind="courier"
              item={courier}
              profile={profileById.get(courier.user_id)}
              busy={busy === `courier:${courier.id}`}
              onReview={reviewCourier}
              onDocument={reviewDocument}
              onOpenDocument={openDocument}
            />
          ))}
          {couriers.length === 0 ? (
            <EmptyState
              title="Nenhum entregador"
              description="Cadastros de entregadores aparecerão aqui."
            />
          ) : null}
        </div>
      )}

      {activeTab === "orders" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-black text-xs uppercase text-zinc-500">
                <tr>
                  <th className="p-4">Pedido</th>
                  <th>Estabelecimento</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Pagamento</th>
                  <th>Total</th>
                  <th>Cliente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="p-4 font-black">#{order.order_number}</td>
                    <td>{order.merchants?.name || "—"}</td>
                    <td>{dateTime(order.created_at)}</td>
                    <td>
                      <Status value={order.status} />
                    </td>
                    <td>
                      <Status value={order.payment_status} />
                    </td>
                    <td className="font-bold text-primary">{money(order.total)}</td>
                    <td className="font-mono text-xs text-zinc-500">
                      {order.customer_user_id?.slice(0, 8) || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "realtime" && <AdminRealtimeOperationsPanel />}

      {activeTab === "users" && (
        <div className="grid gap-3 xl:grid-cols-2">
          {profiles.map((profile) => (
            <div key={profile.id} className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black">{profile.full_name || "Usuário sem nome"}</p>
                  <p className="text-xs text-zinc-500">
                    {profile.phone || "Sem telefone"} · {profile.id}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(rolesByUser.get(profile.id) ?? ["customer"]).map((role) => (
                      <span
                        key={role}
                        className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black uppercase text-primary"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                  {profile.blocked_reason ? (
                    <p className="mt-2 text-xs text-red-300">{profile.blocked_reason}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy === `user:${profile.id}`}
                  onClick={() => void setUserActive(profile, !profile.is_active)}
                  className={
                    profile.is_active
                      ? "border-red-500/20 text-red-400"
                      : "border-emerald-500/20 text-emerald-400"
                  }
                >
                  {profile.is_active ? "Bloquear" : "Reativar"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "reviews" && <AdminReviewsPanel />}

      {activeTab === "coverage" && (
        <AdminCoveragePanel cities={cities} onRefresh={() => loadAll(true)} />
      )}

      {activeTab === "finance" && (
        <FinancePanel
          payouts={payouts}
          refunds={refunds}
          payments={payments}
          pendingPayouts={pendingPayouts}
          pendingRefunds={pendingRefunds}
          busy={busy}
          onPayout={settlePayout}
          onRefund={processRefund}
        />
      )}

      {activeTab === "support" && (
        <AdminSupportPanel
          tickets={tickets}
          busy={busy}
          onStatus={updateTicket}
          onReply={replyTicket}
        />
      )}

      {activeTab === "settings" && (
        <OperationPanel
          cities={cities}
          feeRules={feeRules}
          settingsRows={settingsRows}
          busy={busy}
          onToggleCity={toggleCity}
          onEditFee={editFeeRule}
          onEditSetting={editSetting}
        />
      )}

      {activeTab === "audit" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-black text-xs uppercase text-zinc-500">
                <tr>
                  <th className="p-4">Data</th>
                  <th>Admin</th>
                  <th>Ação</th>
                  <th>Entidade</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="p-4">{dateTime(log.created_at)}</td>
                    <td className="font-mono text-xs">{log.admin_id?.slice(0, 8)}</td>
                    <td className="font-bold">{log.action}</td>
                    <td>{log.entity_type}</td>
                    <td className="font-mono text-xs text-zinc-500">{log.entity_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}

function Dashboard({
  profiles,
  merchants,
  couriers,
  orders,
  activeOrders,
  openTickets,
  pendingPayouts,
  paidVolume,
}: any) {
  const delivered = orders.filter((item: any) => item.status === "delivered").length;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Usuários" value={profiles.length} />
        <MetricCard
          label="Estabelecimentos ativos"
          value={merchants.filter((item: any) => item.is_active).length}
        />
        <MetricCard
          label="Entregadores aprovados"
          value={
            couriers.filter((item: any) => item.status === "approved" && item.is_active).length
          }
        />
        <MetricCard label="Volume pago" value={money(paidVolume)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pedidos em operação" value={activeOrders.length} />
        <MetricCard label="Entregues" value={delivered} />
        <MetricCard label="Chamados abertos" value={openTickets.length} />
        <MetricCard label="Saques pendentes" value={pendingPayouts.length} />
      </div>
    </div>
  );
}

function ApplicationCard({ kind, item, profile, busy, onReview, onDocument, onOpenDocument }: any) {
  const isMerchant = kind === "merchant";
  const status = isMerchant ? item.approval_status : item.status;
  const docs = isMerchant ? (item.merchant_documents ?? []) : (item.courier_documents ?? []);
  const title = isMerchant ? item.name : profile?.full_name || `Entregador ${item.id.slice(0, 8)}`;
  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black">{title}</h2>
            <Status value={status} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {isMerchant
              ? `${item.document || "Sem documento"} · ${item.city || "Cidade não informada"}/${item.state || ""}`
              : `${item.cpf || "Sem CPF"} · ${item.vehicle_type || "veículo não informado"} ${item.vehicle_model || ""}`}
          </p>
          {item.rejection_reason ? (
            <p className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-300">
              {item.rejection_reason}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void onReview(item.id, "approved")}
          >
            Aprovar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void onReview(item.id, "rejected")}
            className="border-red-500/20 text-red-400"
          >
            Reprovar
          </Button>
          {status === "approved" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void onReview(item.id, "blocked")}
              className="border-zinc-800"
            >
              Bloquear
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {docs.map((doc: any) => (
          <div key={doc.id} className="rounded-xl border border-zinc-900 bg-black p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold">{doc.document_type.replaceAll("_", " ")}</p>
                <Status value={doc.status} />
              </div>
              <FileCheck2 className="h-4 w-4 text-zinc-600" />
            </div>
            {doc.rejection_reason ? (
              <p className="mt-2 text-xs text-red-300">{doc.rejection_reason}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void onOpenDocument(kind, doc.storage_path)}
                className="text-xs font-bold text-primary"
              >
                Abrir
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDocument(kind, doc.id, "approved")}
                className="text-xs font-bold text-emerald-400"
              >
                Aprovar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDocument(kind, doc.id, "rejected")}
                className="text-xs font-bold text-red-400"
              >
                Reprovar
              </button>
            </div>
          </div>
        ))}
        {docs.length === 0 ? (
          <p className="text-sm text-zinc-600">Nenhum documento enviado.</p>
        ) : null}
      </div>
    </div>
  );
}

function FinancePanel({
  payouts,
  refunds,
  payments,
  pendingPayouts,
  pendingRefunds,
  busy,
  onPayout,
  onRefund,
}: any) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Pagamentos" value={payments.length} />
        <MetricCard label="Estornos pendentes" value={pendingRefunds.length} />
        <MetricCard label="Saques pendentes" value={pendingPayouts.length} />
      </div>
      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <h2 className="font-black">Saques e repasses</h2>
        <div className="mt-4 space-y-2">
          {payouts.map((payout: any) => (
            <div
              key={payout.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black p-3"
            >
              <div>
                <p className="font-black">{money(payout.amount)}</p>
                <p className="text-xs text-zinc-500">
                  {payout.wallets?.owner_type || "carteira"} · {dateTime(payout.requested_at)}
                </p>
                <p className="text-[10px] text-zinc-600">PIX: {payout.pix_key_snapshot}</p>
              </div>
              <div className="flex items-center gap-2">
                <Status value={payout.status} />
                {["pending", "processing"].includes(payout.status) ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy === `payout:${payout.id}`}
                      onClick={() => void onPayout(payout, "processing")}
                      className="border-zinc-800"
                    >
                      Processando
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy === `payout:${payout.id}`}
                      onClick={() => void onPayout(payout, "paid")}
                    >
                      Pago
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy === `payout:${payout.id}`}
                      onClick={() => void onPayout(payout, "failed")}
                      className="border-red-500/20 text-red-400"
                    >
                      Falhou
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <h2 className="font-black">Estornos</h2>
        <div className="mt-4 space-y-2">
          {refunds.map((refund: any) => (
            <div
              key={refund.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black p-3"
            >
              <div>
                <p className="font-black">{money(refund.amount)}</p>
                <p className="text-xs text-zinc-500">
                  {refund.reason} · pedido {refund.order_id?.slice(0, 8)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Status value={refund.status} />
                {["pending", "processing", "failed"].includes(refund.status) ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy === `refund:${refund.id}`}
                    onClick={() => void onRefund(refund)}
                  >
                    Processar
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function OperationPanel({
  cities,
  feeRules,
  settingsRows,
  busy,
  onToggleCity,
  onEditFee,
  onEditSetting,
}: any) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <div className="flex items-center gap-2">
          <MapPinned className="h-5 w-5 text-primary" />
          <h2 className="font-black">Cidades</h2>
        </div>
        <div className="mt-4 space-y-2">
          {cities.map((city: any) => (
            <div
              key={city.id}
              className="flex items-center justify-between rounded-xl bg-black p-3"
            >
              <div>
                <p className="font-bold">
                  {city.name}/{city.state}
                </p>
                <p className="text-xs text-zinc-600">
                  Raio padrão: {city.default_delivery_radius_km} km
                </p>
              </div>
              <button
                type="button"
                onClick={() => void onToggleCity(city)}
                disabled={busy === `city:${city.id}`}
                className={`rounded-full px-3 py-1 text-xs font-black disabled:opacity-50 ${city.is_active ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-900 text-zinc-500"}`}
              >
                {city.is_active ? "Ativa" : "Inativa"}
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <div className="flex items-center gap-2">
          <CircleDollarSign className="h-5 w-5 text-primary" />
          <h2 className="font-black">Regras financeiras</h2>
        </div>
        <div className="mt-4 space-y-2">
          {feeRules.map((rule: any) => (
            <button
              type="button"
              onClick={() => void onEditFee(rule)}
              disabled={busy === `fee:${rule.id}`}
              key={rule.id}
              className="w-full rounded-xl bg-black p-3 text-left disabled:opacity-50"
            >
              <div className="flex justify-between">
                <b>{rule.name}</b>
                <Status value={rule.is_active ? "active" : "inactive"} />
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Comissão {rule.merchant_commission_percent}% · entregador{" "}
                {money(rule.courier_base_fee)} + {money(rule.courier_per_km)}/km
              </p>
            </button>
          ))}
        </div>
      </section>
      <section className="xl:col-span-2 rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <h2 className="font-black">Configurações da plataforma</h2>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {settingsRows.map((setting: any) => (
            <button
              type="button"
              onClick={() => void onEditSetting(setting)}
              disabled={busy === `setting:${setting.key}`}
              key={setting.key}
              className="rounded-xl bg-black p-3 text-left disabled:opacity-50"
            >
              <p className="font-mono text-xs font-bold text-primary">{setting.key}</p>
              <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                {setting.description || JSON.stringify(setting.value)}
              </p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const normalized = String(value || "unknown");
  const positive = ["paid", "approved", "delivered", "completed", "active", "resolved"].includes(
    normalized,
  );
  const negative = ["failed", "rejected", "blocked", "cancelled", "refunded", "inactive"].includes(
    normalized,
  );
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase ${positive ? "bg-emerald-500/10 text-emerald-400" : negative ? "bg-red-500/10 text-red-400" : "bg-primary/10 text-primary"}`}
    >
      {normalized.replaceAll("_", " ")}
    </span>
  );
}
