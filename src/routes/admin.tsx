import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Bike,
  Building2,
  CircleDollarSign,
  Download,
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
import { AdminOrdersPanel } from "@/components/AdminOrdersPanel";
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

function adminCsvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadAdminOrdersCsv(orders: any[]) {
  const header = [
    "Pedido",
    "Data",
    "Estabelecimento",
    "Status",
    "Pagamento",
    "Modalidade",
    "Subtotal",
    "Desconto",
    "Taxa de entrega",
    "Taxa de serviço",
    "Total",
    "Repasse estabelecimento",
    "Ganho entregador",
    "Receita plataforma",
  ];
  const rows = orders.map((order) => [
    order.order_number,
    order.created_at ? new Date(order.created_at).toLocaleString("pt-BR") : "",
    order.merchants?.name ?? order.merchant_id,
    order.status,
    order.payment_status,
    order.fulfillment_type ?? "delivery",
    Number(order.subtotal ?? 0).toFixed(2),
    Number(order.discount ?? 0).toFixed(2),
    Number(order.delivery_fee ?? 0).toFixed(2),
    Number(order.service_fee ?? 0).toFixed(2),
    Number(order.total ?? 0).toFixed(2),
    Number(order.merchant_net ?? 0).toFixed(2),
    Number(order.courier_earnings ?? 0).toFixed(2),
    Number(order.platform_fee ?? 0).toFixed(2),
  ]);
  const csv = [header, ...rows].map((row) => row.map(adminCsvCell).join(";")).join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `apois-admin-pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

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
  const [merchantSubscriptions, setMerchantSubscriptions] = useState<any[]>([]);
  const [cities, setCities] = useState<any[]>([]);
  const [feeRules, setFeeRules] = useState<any[]>([]);
  const [settingsRows, setSettingsRows] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);

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
          .select(
            "id,category_id,name,slug,description,logo_url,cover_url,tags,delivery_fee,delivery_min_minutes,delivery_max_minutes,rating,review_count,is_open,closes_at,is_active,address_line,neighborhood,city,state,latitude,longitude,created_at,updated_at,minimum_order,pickup_enabled,delivery_enabled,approval_status,temporarily_closed,city_id, merchant_documents(*), merchant_categories(name)",
          )
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
          .select(
            "*, support_messages(id,sender_user_id,message,attachment_paths,is_internal,created_at)",
          )
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
        from("merchant_subscriptions")
          .select(
            "*, merchants(id,name,city,state), merchant_subscription_payments(id,status,amount,method,paid_at,expires_at,created_at,provider_authorized_payment_id)",
          )
          .order("updated_at", { ascending: false })
          .limit(500),
        from("cities").select("*").order("name"),
        from("fee_rules").select("*").order("created_at", { ascending: false }),
        from("platform_settings").select("*").order("key"),
        from("admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(100),
        rpc("get_authorized_merchant_private_data", { _merchant_id: null }),
      ]);
      const firstError = checks.find((result) => result.error)?.error;
      if (firstError) throw firstError;
      setProfiles(checks[0].data ?? []);
      setRoles(checks[1].data ?? []);
      const privateMerchantById = new Map(
        (checks[14].data ?? []).map((row: any) => [row.merchant_id, row]),
      );
      setMerchants(
        (checks[2].data ?? []).map((row: any) => ({
          ...row,
          ...(privateMerchantById.get(row.id) ?? {}),
        })),
      );
      setCouriers(checks[3].data ?? []);
      setOrders(checks[4].data ?? []);
      setTickets(checks[5].data ?? []);
      setPayouts(checks[6].data ?? []);
      setRefunds(checks[7].data ?? []);
      setPayments(checks[8].data ?? []);
      setMerchantSubscriptions(checks[9].data ?? []);
      setCities(checks[10].data ?? []);
      setFeeRules(checks[11].data ?? []);
      setSettingsRows(checks[12].data ?? []);
      setAuditLogs(checks[13].data ?? []);
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

  const createMerchantManually = async () => {
    const ownerLookup = window
      .prompt("Telefone ou ID do usuário que será dono do estabelecimento:")
      ?.trim();
    if (!ownerLookup) return;
    const digits = ownerLookup.replace(/\D/g, "");
    const owner = profiles.find(
      (profile) =>
        profile.id === ownerLookup ||
        (digits.length >= 8 && String(profile.phone ?? "").replace(/\D/g, "") === digits),
    );
    if (!owner) {
      toast.error("Usuário não encontrado. Cadastre a conta do responsável primeiro.");
      return;
    }

    const categoriesRes = await from("merchant_categories")
      .select("id,name")
      .eq("is_active", true)
      .order("name");
    if (categoriesRes.error) return toast.error(categoriesRes.error.message);
    const categories = categoriesRes.data ?? [];
    if (!categories.length) return toast.error("Nenhuma categoria de estabelecimento ativa.");
    const categoryName = window
      .prompt(
        `Categoria do estabelecimento:\n${categories.map((item: any) => `• ${item.name}`).join("\n")}`,
      )
      ?.trim();
    if (!categoryName) return;
    const category = categories.find(
      (item: any) =>
        item.name.toLocaleLowerCase("pt-BR") === categoryName.toLocaleLowerCase("pt-BR"),
    );
    if (!category)
      return toast.error("Categoria não encontrada. Digite exatamente um nome da lista.");

    const name = window.prompt("Nome do estabelecimento:")?.trim();
    if (!name) return;
    const legalName = window.prompt("Razão social (opcional):")?.trim() ?? "";
    const document = window.prompt("CNPJ/CPF do estabelecimento:")?.trim() ?? "";
    const phone = window.prompt("Telefone do estabelecimento:", owner.phone ?? "")?.trim() ?? "";
    const email = window.prompt("E-mail do estabelecimento (opcional):")?.trim() ?? "";
    const addressLine = window.prompt("Endereço (rua, número e complemento):")?.trim() ?? "";
    const neighborhood = window.prompt("Bairro:")?.trim() ?? "";
    const city = window.prompt("Cidade:")?.trim() ?? "";
    const state = window.prompt("UF:")?.trim().toUpperCase() ?? "";
    if (!addressLine || !city || state.length !== 2) {
      toast.error("Informe endereço, cidade e UF para cadastrar o estabelecimento.");
      return;
    }
    const approve = window.confirm(
      "Deseja cadastrar e JÁ APROVAR/LIBERAR este estabelecimento?\n\nOK = aprovado e ativo agora\nCancelar = enviar para análise",
    );

    setBusy("merchant:new");
    const { data, error } = await rpc("admin_create_merchant", {
      _owner_user_id: owner.id,
      _category_id: category.id,
      _name: name,
      _legal_name: legalName,
      _document: document,
      _contact_phone: phone,
      _contact_email: email,
      _address_line: addressLine,
      _neighborhood: neighborhood,
      _city: city,
      _state: state,
      _latitude: null,
      _longitude: null,
      _approve: approve,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(
      approve
        ? "Estabelecimento cadastrado e liberado."
        : "Estabelecimento cadastrado para análise.",
    );
    await loadAll(true);
    if (data) setSelectedMerchantId(String(data));
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

  const suspendMerchant = async (merchantId: string, suspended: boolean) => {
    const reason = suspended ? window.prompt("Motivo da suspensão:")?.trim() : null;
    if (suspended && !reason) return;
    setBusy(`merchant:${merchantId}`);
    const { error } = await rpc("admin_suspend_merchant", {
      _merchant_id: merchantId,
      _suspended: suspended,
      _reason: reason,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(suspended ? "Estabelecimento suspenso." : "Estabelecimento reativado.");
    await loadAll(true);
  };

  const deleteMerchant = async (merchantId: string, merchantName: string) => {
    const confirmed = window.confirm(
      `Excluir definitivamente ${merchantName}? Esta ação só será permitida se não houver histórico de pedidos.`,
    );
    if (!confirmed) return;
    const typed = window
      .prompt(`Digite EXCLUIR para confirmar a exclusão de ${merchantName}:`)
      ?.trim();
    if (typed !== "EXCLUIR") {
      toast.error("Exclusão cancelada: confirmação inválida.");
      return;
    }
    setBusy(`merchant:${merchantId}`);
    const { error } = await rpc("admin_delete_merchant", { _merchant_id: merchantId });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Estabelecimento excluído.");
    if (selectedMerchantId === merchantId) setSelectedMerchantId(null);
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

  const createFeeRule = async () => {
    if (cities.length === 0) {
      toast.error("Cadastre uma cidade antes de criar uma regra financeira.");
      return;
    }

    const suggestedCity = cities.find((city) => city.is_active) ?? cities[0];
    const cityInput = window
      .prompt("Cidade da regra (Nome/UF):", `${suggestedCity.name}/${suggestedCity.state}`)
      ?.trim();
    if (!cityInput) return;
    const normalized = cityInput.toLocaleLowerCase("pt-BR").replaceAll(" ", "");
    const city = cities.find(
      (item) =>
        `${item.name}/${item.state}`.toLocaleLowerCase("pt-BR").replaceAll(" ", "") === normalized,
    );
    if (!city) {
      toast.error("Cidade não encontrada. Use o formato Nome/UF exibido no painel.");
      return;
    }

    const name = window.prompt("Nome da regra:", `Regra ${city.name}/${city.state}`)?.trim();
    if (!name) return;
    const commissionRaw = window.prompt("Comissão do estabelecimento (%):", "0");
    if (commissionRaw === null) return;
    const courierBaseRaw = window.prompt("Base do entregador (R$):", "0");
    if (courierBaseRaw === null) return;
    const perKmRaw = window.prompt("Valor por km do entregador (R$):", "0");
    if (perKmRaw === null) return;
    const minimumRaw = window.prompt("Ganho mínimo do entregador (R$):", "0");
    if (minimumRaw === null) return;
    const customerFeeRaw = window.prompt("Taxa de serviço do cliente (R$):", "0");
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

    setBusy("fee:new");
    const { error } = await rpc("admin_create_fee_rule", {
      _name: name,
      _city_id: city.id,
      _merchant_id: null,
      _merchant_commission_percent: values.commission,
      _courier_base_fee: values.courierBase,
      _courier_per_km: values.perKm,
      _courier_minimum_fee: values.minimum,
      _customer_service_fee: values.customerFee,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Regra financeira criada e auditada.");
    await loadAll(true);
  };

  const toggleFeeRule = async (rule: any) => {
    setBusy(`fee:${rule.id}`);
    const { error } = await rpc("admin_set_fee_rule_active", {
      _fee_rule_id: rule.id,
      _is_active: !rule.is_active,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(rule.is_active ? "Regra financeira desativada." : "Regra financeira ativada.");
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
  const overdueMerchantSubscriptions = useMemo(
    () =>
      merchantSubscriptions.filter(
        (item) =>
          !item.current_period_end || new Date(item.current_period_end).getTime() <= Date.now(),
      ),
    [merchantSubscriptions],
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
  const selectedMerchant = useMemo(
    () => merchants.find((item) => item.id === selectedMerchantId) ?? null,
    [merchants, selectedMerchantId],
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
    { id: "reports", label: "Relatórios", icon: BarChart3 },
    {
      id: "finance",
      label: "Financeiro",
      icon: WalletCards,
      badge: pendingPayouts.length + pendingRefunds.length + overdueMerchantSubscriptions.length,
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

      {activeTab === "merchants" &&
        (selectedMerchant ? (
          <MerchantApplicationDetails
            merchant={selectedMerchant}
            profile={profileById.get(selectedMerchant.owner_user_id)}
            busyKey={busy}
            onBack={() => setSelectedMerchantId(null)}
            onReview={reviewMerchant}
            onSuspend={suspendMerchant}
            onDelete={deleteMerchant}
            onDocument={reviewDocument}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
              <div>
                <p className="font-black">Cadastro administrativo</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Cadastre um estabelecimento manualmente e, se necessário, já deixe a conta
                  aprovada e ativa.
                </p>
              </div>
              <Button
                type="button"
                disabled={busy === "merchant:new"}
                onClick={() => void createMerchantManually()}
                className="font-black"
              >
                {busy === "merchant:new" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Building2 className="mr-2 h-4 w-4" />
                )}
                Cadastrar estabelecimento
              </Button>
            </div>
            {merchants.map((merchant) => (
              <ApplicationCard
                key={merchant.id}
                kind="merchant"
                item={merchant}
                profile={profileById.get(merchant.owner_user_id)}
                busy={busy === `merchant:${merchant.id}`}
                onReview={reviewMerchant}
                onSuspend={suspendMerchant}
                onDelete={deleteMerchant}
                onDocument={reviewDocument}
                onOpenDocument={openDocument}
                onOpenDetails={() => setSelectedMerchantId(merchant.id)}
              />
            ))}
            {merchants.length === 0 ? (
              <EmptyState
                title="Nenhum estabelecimento"
                description="Cadastros de estabelecimentos aparecerão aqui."
              />
            ) : null}
          </div>
        ))}

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

      {activeTab === "orders" && <AdminOrdersPanel />}

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

      {activeTab === "reports" && (
        <AdminReportsPanel orders={orders} refunds={refunds} payouts={payouts} />
      )}

      {activeTab === "finance" && (
        <FinancePanel
          payouts={payouts}
          refunds={refunds}
          payments={payments}
          merchantSubscriptions={merchantSubscriptions}
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
          onCreateFee={createFeeRule}
          onEditFee={editFeeRule}
          onToggleFee={toggleFeeRule}
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

function ApplicationCard({
  kind,
  item,
  profile,
  busy,
  onReview,
  onSuspend,
  onDelete,
  onDocument,
  onOpenDocument,
  onOpenDetails,
}: any) {
  const isMerchant = kind === "merchant";
  const status = isMerchant ? item.approval_status : item.status;
  const docs = isMerchant ? (item.merchant_documents ?? []) : (item.courier_documents ?? []);
  const requiredDocumentTypes = isMerchant
    ? ["documento_empresa", "responsavel", "comprovante_endereco"]
    : item.vehicle_type === "bicicleta"
      ? ["foto_perfil"]
      : ["cnh", "documento_veiculo", "foto_perfil"];
  const missingDocuments = requiredDocumentTypes.filter(
    (type) => !docs.some((doc: any) => doc.document_type === type && doc.status === "approved"),
  );
  const identityReady =
    isMerchant ||
    item.vehicle_type === "bicicleta" ||
    (Boolean(item.vehicle_plate?.trim()) && Boolean(item.cnh_number?.trim()));
  const approvalReady = missingDocuments.length === 0 && identityReady;
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
          {isMerchant && onOpenDetails ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-primary/30 text-primary"
              onClick={onOpenDetails}
            >
              Ver cadastro completo
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={busy || !approvalReady || status === "approved"}
            title={
              status === "approved"
                ? "Estabelecimento já aprovado"
                : approvalReady
                  ? "Aprovar parceiro"
                  : "Aprove primeiro todos os documentos e dados obrigatórios."
            }
            onClick={() => void onReview(item.id, "approved")}
          >
            {status === "approved" ? "Aprovado" : "Aprovar"}
          </Button>
          {status !== "approved" ? (
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
          ) : null}
          {isMerchant && status === "approved" ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void onSuspend(item.id, item.is_active)}
                className="border-amber-500/30 text-amber-300"
              >
                {item.is_active ? "Suspender" : "Reativar"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void onReview(item.id, "blocked")}
                className="border-red-500/30 text-red-400"
              >
                Bloquear
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void onDelete(item.id, title)}
                className="border-red-700/50 text-red-500"
              >
                Excluir
              </Button>
            </>
          ) : null}
          {!isMerchant && status === "approved" ? (
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
      {!approvalReady ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
          {missingDocuments.length > 0
            ? `Aprovação bloqueada: faltam documentos aprovados (${missingDocuments
                .map((type) => type.replaceAll("_", " "))
                .join(", ")}).`
            : "Aprovação bloqueada: complete placa e CNH do veículo antes de aprovar."}
        </div>
      ) : null}
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

function MerchantApplicationDetails({
  merchant,
  profile,
  busyKey,
  onBack,
  onReview,
  onSuspend,
  onDelete,
  onDocument,
}: any) {
  const [preview, setPreview] = useState<{ url: string; doc: any } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const docs = merchant.merchant_documents ?? [];
  const requiredDocumentTypes = ["documento_empresa", "responsavel", "comprovante_endereco"];
  const missingDocuments = requiredDocumentTypes.filter(
    (type) => !docs.some((doc: any) => doc.document_type === type && doc.status === "approved"),
  );
  const approvalReady = missingDocuments.length === 0;
  const merchantBusy = busyKey === `merchant:${merchant.id}`;

  const showDocument = async (doc: any) => {
    setPreviewing(doc.id);
    const { data, error } = await supabase.storage
      .from("merchant-documents")
      .createSignedUrl(doc.storage_path, 600);
    setPreviewing(null);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível carregar este documento.");
      return;
    }
    setPreview({ url: data.signedUrl, doc });
  };

  const field = (label: string, value: unknown) => (
    <div className="rounded-xl border border-zinc-900 bg-black p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-zinc-200">
        {String(value || "Não informado")}
      </p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="mb-2 text-sm font-bold text-primary">
            ← Voltar para estabelecimentos
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-black">{merchant.name}</h2>
            <Status value={merchant.approval_status} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Revisão completa antes da aprovação do parceiro.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={merchantBusy || !approvalReady || merchant.approval_status === "approved"}
            title={
              merchant.approval_status === "approved"
                ? "Estabelecimento já aprovado"
                : approvalReady
                  ? "Aprovar estabelecimento"
                  : "Aprove primeiro todos os documentos obrigatórios."
            }
            onClick={() => void onReview(merchant.id, "approved")}
          >
            {merchant.approval_status === "approved"
              ? "Estabelecimento aprovado"
              : "Aprovar estabelecimento"}
          </Button>
          {merchant.approval_status !== "approved" ? (
            <Button
              type="button"
              variant="outline"
              disabled={merchantBusy}
              onClick={() => void onReview(merchant.id, "rejected")}
              className="border-red-500/30 text-red-400"
            >
              Recusar cadastro
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={merchantBusy}
                onClick={() => void onSuspend(merchant.id, merchant.is_active)}
                className="border-amber-500/30 text-amber-300"
              >
                {merchant.is_active ? "Suspender" : "Reativar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={merchantBusy}
                onClick={() => void onReview(merchant.id, "blocked")}
                className="border-red-500/30 text-red-400"
              >
                Bloquear
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={merchantBusy}
                onClick={() => void onDelete(merchant.id, merchant.name)}
                className="border-red-700/50 text-red-500"
              >
                Excluir
              </Button>
            </>
          )}
        </div>
      </div>

      {!approvalReady ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Aprovação bloqueada até revisar:{" "}
          {missingDocuments.map((type) => type.replaceAll("_", " ")).join(", ")}.
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          Todos os documentos obrigatórios estão aprovados. O cadastro pode ser aprovado após a
          conferência dos dados abaixo.
        </div>
      )}

      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <h3 className="text-lg font-black">Dados do estabelecimento</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {field("Nome fantasia", merchant.name)}
          {field("Razão social", merchant.legal_name)}
          {field("CNPJ / MEI", merchant.document)}
          {field("Categoria", merchant.merchant_categories?.name)}
          {field("Telefone", merchant.contact_phone)}
          {field("E-mail", merchant.contact_email)}
          {field("Responsável", profile?.full_name)}
          {field("Telefone do responsável", profile?.phone)}
          {field("Cadastrado em", dateTime(merchant.created_at))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <h3 className="text-lg font-black">Endereço e localização</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {field("Endereço", merchant.address_line)}
          {field("Bairro", merchant.neighborhood)}
          {field("Cidade / UF", [merchant.city, merchant.state].filter(Boolean).join(" / "))}
          {field("Latitude", merchant.latitude)}
          {field("Longitude", merchant.longitude)}
          {field("ID do estabelecimento", merchant.id)}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <div>
          <h3 className="text-lg font-black">Documentos para conferência</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Abra cada documento em tamanho maior e aprove ou recuse individualmente.
          </p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {docs.map((doc: any) => {
            const docBusy = busyKey === `doc:${doc.id}`;
            return (
              <div key={doc.id} className="rounded-2xl border border-zinc-800 bg-black p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-black capitalize">
                      {doc.document_type.replaceAll("_", " ")}
                    </p>
                    <div className="mt-2">
                      <Status value={doc.status} />
                    </div>
                  </div>
                  <FileCheck2 className="h-5 w-5 text-zinc-600" />
                </div>
                {doc.rejection_reason ? (
                  <p className="mt-3 text-sm text-red-300">{doc.rejection_reason}</p>
                ) : null}
                <div className="mt-4 grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-zinc-700"
                    disabled={previewing === doc.id}
                    onClick={() => void showDocument(doc)}
                  >
                    {previewing === doc.id ? "Carregando..." : "Visualizar documento"}
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      disabled={docBusy || doc.status === "approved"}
                      onClick={() => void onDocument("merchant", doc.id, "approved")}
                      className="bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      Aprovar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={docBusy}
                      onClick={() => void onDocument("merchant", doc.id, "rejected")}
                      className="border-red-500/30 text-red-400"
                    >
                      Recusar
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {preview ? (
        <section className="rounded-2xl border border-primary/30 bg-zinc-950 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-black capitalize">
                {preview.doc.document_type.replaceAll("_", " ")}
              </p>
              <p className="text-xs text-zinc-500">Visualização ampliada para conferência.</p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => window.open(preview.url, "_blank", "noopener,noreferrer")}
              >
                Abrir em nova aba
              </Button>
              <Button type="button" variant="outline" onClick={() => setPreview(null)}>
                Fechar
              </Button>
            </div>
          </div>
          {String(preview.doc.storage_path).toLowerCase().endsWith(".pdf") ? (
            <iframe
              title="Documento do estabelecimento"
              src={preview.url}
              className="h-[70vh] w-full rounded-xl border border-zinc-800 bg-white"
            />
          ) : (
            <div className="grid min-h-[420px] place-items-center overflow-auto rounded-xl border border-zinc-800 bg-black p-3">
              <img
                src={preview.url}
                alt="Documento do estabelecimento"
                className="max-h-[70vh] max-w-full object-contain"
              />
            </div>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              disabled={busyKey === `doc:${preview.doc.id}` || preview.doc.status === "approved"}
              onClick={() => void onDocument("merchant", preview.doc.id, "approved")}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              Aprovar este documento
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busyKey === `doc:${preview.doc.id}`}
              onClick={() => void onDocument("merchant", preview.doc.id, "rejected")}
              className="border-red-500/30 text-red-400"
            >
              Recusar este documento
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function AdminReportsPanel({ orders, refunds, payouts }: any) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthOrders = orders.filter((order: any) => {
    const createdAt = order.created_at ? new Date(order.created_at).getTime() : 0;
    return createdAt >= monthStart;
  });
  const paidOrders = monthOrders.filter(
    (order: any) =>
      order.payment_status === "paid" && !["cancelled", "refunded"].includes(order.status),
  );
  const delivered = monthOrders.filter((order: any) => order.status === "delivered");
  const gmv = paidOrders.reduce((sum: number, order: any) => sum + Number(order.total ?? 0), 0);
  const platformRevenue = delivered.reduce(
    (sum: number, order: any) => sum + Number(order.platform_fee ?? 0),
    0,
  );
  const merchantRepasse = delivered.reduce(
    (sum: number, order: any) => sum + Number(order.merchant_net ?? 0),
    0,
  );
  const courierEarnings = delivered.reduce(
    (sum: number, order: any) => sum + Number(order.courier_earnings ?? 0),
    0,
  );
  const monthRefunds = refunds.filter((refund: any) => {
    const createdAt = refund.created_at ? new Date(refund.created_at).getTime() : 0;
    return createdAt >= monthStart && ["completed", "refunded"].includes(refund.status);
  });
  const refundVolume = monthRefunds.reduce(
    (sum: number, refund: any) => sum + Number(refund.amount ?? 0),
    0,
  );
  const monthPayouts = payouts.filter((payout: any) => {
    const createdAt = payout.requested_at ? new Date(payout.requested_at).getTime() : 0;
    return createdAt >= monthStart && payout.status === "paid";
  });
  const payoutVolume = monthPayouts.reduce(
    (sum: number, payout: any) => sum + Number(payout.amount ?? 0),
    0,
  );
  const completionRate = monthOrders.length > 0 ? (delivered.length / monthOrders.length) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">Relatórios operacionais</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Consolidado do mês atual com valores calculados a partir dos pedidos e liquidações
            reais.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => downloadAdminOrdersCsv(monthOrders)}
          disabled={monthOrders.length === 0}
          className="border-zinc-800 bg-zinc-950"
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar pedidos CSV
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pedidos no mês" value={monthOrders.length} />
        <MetricCard label="GMV pago" value={money(gmv)} />
        <MetricCard label="Receita da plataforma" value={money(platformRevenue)} />
        <MetricCard
          label="Taxa de conclusão"
          value={`${completionRate.toFixed(1).replace(".", ",")}%`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pedidos entregues" value={delivered.length} />
        <MetricCard label="Repasse a estabelecimentos" value={money(merchantRepasse)} />
        <MetricCard label="Ganhos de entregadores" value={money(courierEarnings)} />
        <MetricCard label="Estornos concluídos" value={money(refundVolume)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Saques pagos</p>
          <p className="mt-2 text-2xl font-black">{money(payoutVolume)}</p>
          <p className="mt-1 text-xs text-zinc-600">
            {monthPayouts.length} repasse(s) concluído(s) no mês.
          </p>
        </section>
        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Ticket médio pago
          </p>
          <p className="mt-2 text-2xl font-black">
            {money(paidOrders.length > 0 ? gmv / paidOrders.length : 0)}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Baseado apenas em pedidos pagos e não estornados.
          </p>
        </section>
        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Pedidos pagos válidos
          </p>
          <p className="mt-2 text-2xl font-black">{paidOrders.length}</p>
          <p className="mt-1 text-xs text-zinc-600">
            Exclui cancelados e reembolsados do indicador de GMV.
          </p>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950">
        <div className="border-b border-zinc-900 p-5">
          <h3 className="font-black">Pedidos recentes do período</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-black/40 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-5 py-3">Pedido</th>
                <th className="px-5 py-3">Estabelecimento</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Pagamento</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3 text-right">Receita APOIS</th>
              </tr>
            </thead>
            <tbody>
              {monthOrders.slice(0, 50).map((order: any) => (
                <tr key={order.id} className="border-t border-zinc-900/80">
                  <td className="px-5 py-3 font-bold">#{order.order_number}</td>
                  <td className="px-5 py-3 text-zinc-300">{order.merchants?.name ?? "—"}</td>
                  <td className="px-5 py-3">
                    <Status value={order.status} />
                  </td>
                  <td className="px-5 py-3 text-zinc-400">{order.payment_status}</td>
                  <td className="px-5 py-3 text-right font-bold">{money(order.total)}</td>
                  <td className="px-5 py-3 text-right font-bold text-primary">
                    {money(order.platform_fee)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {monthOrders.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            Ainda não há pedidos registrados neste mês.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function FinancePanel({
  payouts,
  refunds,
  payments,
  merchantSubscriptions,
  pendingPayouts,
  pendingRefunds,
  busy,
  onPayout,
  onRefund,
}: any) {
  const subscriptionIsCurrent = (subscription: any) =>
    Boolean(
      subscription.current_period_end &&
      new Date(subscription.current_period_end).getTime() > Date.now(),
    );
  const currentSubscriptions = merchantSubscriptions.filter(subscriptionIsCurrent);
  const overdueSubscriptions = merchantSubscriptions.filter(
    (subscription: any) => !subscriptionIsCurrent(subscription),
  );
  const subscriptionPayments = merchantSubscriptions.flatMap(
    (subscription: any) => subscription.merchant_subscription_payments ?? [],
  );
  const approvedSubscriptionRevenue = subscriptionPayments
    .filter((payment: any) => payment.status === "approved")
    .reduce((sum: number, payment: any) => sum + Number(payment.amount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Mensalidades vigentes" value={currentSubscriptions.length} />
        <MetricCard label="Mensalidades pendentes" value={overdueSubscriptions.length} />
        <MetricCard label="Receita de mensalidades" value={money(approvedSubscriptionRevenue)} />
        <MetricCard label="Saques pendentes" value={pendingPayouts.length} />
      </div>

      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Mensalidades dos estabelecimentos</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Cobrança fixa de R$ 69,90 por mês. Estabelecimentos sem período pago vigente ficam
              bloqueados automaticamente para novos pedidos.
            </p>
          </div>
          <Status value={overdueSubscriptions.length > 0 ? "pending" : "active"} />
        </div>
        <div className="mt-4 space-y-2">
          {merchantSubscriptions.map((subscription: any) => {
            const current = subscriptionIsCurrent(subscription);
            const paymentsForSubscription = [
              ...(subscription.merchant_subscription_payments ?? []),
            ].sort((a: any, b: any) =>
              String(b.paid_at ?? b.created_at ?? "").localeCompare(
                String(a.paid_at ?? a.created_at ?? ""),
              ),
            );
            const latestPayment = paymentsForSubscription[0] ?? null;
            const environment = subscription.metadata?.environment ?? "unknown";
            return (
              <div
                key={subscription.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black p-3"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black">
                      {subscription.merchants?.name ?? subscription.merchant_id}
                    </p>
                    <Status value={current ? "active" : "pending"} />
                    {environment !== "production" ? (
                      <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase text-amber-400">
                        teste
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {subscription.merchants?.city || "Cidade não informada"}
                    {subscription.merchants?.state ? `/${subscription.merchants.state}` : ""} ·
                    mensalidade {money(subscription.amount)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Acesso pago até: {dateTime(subscription.current_period_end)} · último pagamento:{" "}
                    {latestPayment
                      ? `${latestPayment.status} em ${dateTime(latestPayment.paid_at ?? latestPayment.created_at)}`
                      : "nenhum"}
                  </p>
                </div>
                <Status value={subscription.provider_status || (current ? "paid" : "pending")} />
              </div>
            );
          })}
          {merchantSubscriptions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
              Nenhuma mensalidade de estabelecimento registrada.
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard label="Pagamentos de pedidos" value={payments.length} />
        <MetricCard label="Estornos pendentes" value={pendingRefunds.length} />
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
  onCreateFee,
  onEditFee,
  onToggleFee,
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-5 w-5 text-primary" />
            <h2 className="font-black">Regras financeiras</h2>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void onCreateFee()}
            disabled={busy === "fee:new"}
          >
            {busy === "fee:new" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Nova regra
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {feeRules.map((rule: any) => (
            <div key={rule.id} className="rounded-xl bg-black p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <b>{rule.name}</b>
                  <p className="mt-1 text-xs text-zinc-500">
                    Comissão {rule.merchant_commission_percent}% · entregador{" "}
                    {money(rule.courier_base_fee)} + {money(rule.courier_per_km)}/km · mínimo{" "}
                    {money(rule.courier_minimum_fee)} · serviço {money(rule.customer_service_fee)}
                  </p>
                </div>
                <Status value={rule.is_active ? "active" : "inactive"} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onEditFee(rule)}
                  disabled={busy === `fee:${rule.id}`}
                  className="border-zinc-800"
                >
                  Editar valores
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void onToggleFee(rule)}
                  disabled={busy === `fee:${rule.id}`}
                  className={
                    rule.is_active
                      ? "border-red-500/20 text-red-400"
                      : "border-emerald-500/20 text-emerald-400"
                  }
                >
                  {rule.is_active ? "Desativar" : "Ativar"}
                </Button>
              </div>
            </div>
          ))}
          {feeRules.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
              Nenhuma regra financeira criada. Sem regra ativa, a plataforma usa a taxa de entrega
              da loja e não cobra taxa de serviço/comissão.
            </div>
          ) : null}
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
