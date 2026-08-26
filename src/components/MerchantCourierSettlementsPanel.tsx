import { CalendarClock, Copy, Loader2, RefreshCw, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard } from "@/components/WorkspaceShell";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Settlement = {
  id: string;
  courier_id: string;
  settlement_date: string;
  delivery_count: number;
  total_amount: number | string;
  status: string;
  effective_status: string;
  due_at: string;
  merchant_marked_paid_at: string | null;
  courier_confirmed_at: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  admin_resolved_at: string | null;
  created_at: string;
};

type Delivery = { id: string; delivery_job_id: string; amount: number | string };

const from = (table: string) => (supabase.from as any)(table);
const rpc = (name: string, args?: Record<string, unknown>) =>
  (supabase.rpc as any)(name, args ?? {});
const money = (value: unknown) =>
  `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;
const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "A receber",
  overdue: "Repasse vencido",
  merchant_marked_paid: "Pagamento informado",
  confirmed: "Pagamento confirmado",
  disputed: "Em contestação",
  admin_resolved: "Resolvido pela APOIS",
};

const STATUS_CLASS: Record<string, string> = {
  awaiting_payment: "bg-primary/10 text-primary",
  overdue: "bg-red-500/10 text-red-300",
  merchant_marked_paid: "bg-amber-500/10 text-amber-300",
  confirmed: "bg-emerald-500/10 text-emerald-300",
  disputed: "bg-red-500/10 text-red-300",
  admin_resolved: "bg-zinc-500/10 text-zinc-300",
};

const FILTERS = [
  ["today", "Hoje"],
  ["pending", "Pendentes"],
  ["overdue", "Vencidos"],
  ["paid", "Pagos"],
  ["disputed", "Contestados"],
  ["all", "Histórico"],
] as const;

export function MerchantCourierSettlementsPanel({ merchantId }: { merchantId: string }) {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [courierNames, setCourierNames] = useState<Record<string, string>>({});
  const [pixKeys, setPixKeys] = useState<
    Record<string, { key: string; type: string | null } | null>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deliveriesBySettlement, setDeliveriesBySettlement] = useState<Record<string, Delivery[]>>(
    {},
  );
  const { confirm, confirmDialog } = useConfirmDialog();

  const load = useCallback(
    async (quiet = false) => {
      quiet ? setRefreshing(true) : setLoading(true);
      try {
        const settlementsRes = await from("courier_settlements_view")
          .select("*")
          .eq("merchant_id", merchantId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (settlementsRes.error) throw settlementsRes.error;
        const rows = (settlementsRes.data ?? []) as Settlement[];
        setSettlements(rows);

        const courierIds = Array.from(new Set(rows.map((row) => row.courier_id)));
        if (courierIds.length > 0) {
          const couriersRes = await from("couriers").select("id,user_id").in("id", courierIds);
          const couriers = (couriersRes.data ?? []) as { id: string; user_id: string }[];
          const userIds = couriers.map((courier) => courier.user_id);
          const [profilesRes, walletsRes] = await Promise.all([
            userIds.length
              ? from("profiles").select("id,full_name").in("id", userIds)
              : Promise.resolve({ data: [] }),
            from("wallets").select("id,courier_id").in("courier_id", courierIds),
          ]);
          const profileByUser = new Map(
            ((profilesRes.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [
              p.id,
              p.full_name,
            ]),
          );
          const names: Record<string, string> = {};
          for (const courier of couriers) {
            names[courier.id] = profileByUser.get(courier.user_id) || "Entregador";
          }
          setCourierNames(names);

          const wallets = (walletsRes.data ?? []) as { id: string; courier_id: string }[];
          const walletIds = wallets.map((w) => w.id);
          const accountsRes = walletIds.length
            ? await from("payout_accounts")
                .select("wallet_id,pix_key,pix_key_type")
                .in("wallet_id", walletIds)
            : { data: [] };
          const accountByWallet = new Map(
            (
              (accountsRes.data ?? []) as {
                wallet_id: string;
                pix_key: string;
                pix_key_type: string | null;
              }[]
            ).map((a) => [a.wallet_id, a]),
          );
          const keys: Record<string, { key: string; type: string | null } | null> = {};
          for (const wallet of wallets) {
            const account = accountByWallet.get(wallet.id);
            keys[wallet.courier_id] = account
              ? { key: account.pix_key, type: account.pix_key_type }
              : null;
          }
          setPixKeys(keys);
        } else {
          setCourierNames({});
          setPixKeys({});
        }
      } catch (error: any) {
        toast.error(error?.message || "Não foi possível carregar os repasses.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [merchantId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handleClose = async () => {
    setClosing(true);
    try {
      const { data, error } = await rpc("close_courier_settlements", { _merchant_id: merchantId });
      if (error) throw error;
      const count = Array.isArray(data) ? data.length : 0;
      toast.success(
        count > 0
          ? `${count} fechamento(s) atualizado(s) com as entregas concluídas.`
          : "Nenhuma entrega nova para fechar no momento.",
      );
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível gerar o fechamento.");
    } finally {
      setClosing(false);
    }
  };

  const handleCopyPix = async (courierId: string) => {
    const account = pixKeys[courierId];
    if (!account?.key) {
      toast.error("Este entregador ainda não cadastrou uma chave Pix.");
      return;
    }
    try {
      await navigator.clipboard.writeText(account.key);
      toast.success("Chave Pix copiada.");
    } catch {
      toast.error("Não foi possível copiar a chave Pix.");
    }
  };

  const handleMarkPaid = async (settlement: Settlement) => {
    const ok = await confirm({
      title: "Confirmar pagamento do repasse?",
      description: `Confirme que você já realizou o Pix de ${money(settlement.total_amount)} para ${courierNames[settlement.courier_id] || "o entregador"}. Esta ação não pode ser desfeita.`,
      confirmLabel: "Já paguei",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    setBusy(settlement.id);
    try {
      const { error } = await rpc("merchant_mark_courier_settlement_paid", {
        _settlement_id: settlement.id,
      });
      if (error) throw error;
      toast.success("Pagamento informado ao entregador.");
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível registrar o pagamento.");
    } finally {
      setBusy(null);
    }
  };

  const toggleDeliveries = async (settlementId: string) => {
    if (expanded === settlementId) {
      setExpanded(null);
      return;
    }
    setExpanded(settlementId);
    if (!deliveriesBySettlement[settlementId]) {
      const { data, error } = await from("courier_settlement_deliveries")
        .select("id,delivery_job_id,amount")
        .eq("settlement_id", settlementId);
      if (!error) {
        setDeliveriesBySettlement((current) => ({
          ...current,
          [settlementId]: (data ?? []) as Delivery[],
        }));
      }
    }
  };

  const filtered = useMemo(() => {
    const today = new Date().toDateString();
    return settlements.filter((settlement) => {
      switch (filter) {
        case "today":
          return new Date(settlement.created_at).toDateString() === today;
        case "pending":
          return settlement.effective_status === "awaiting_payment";
        case "overdue":
          return settlement.effective_status === "overdue";
        case "paid":
          return ["merchant_marked_paid", "confirmed", "admin_resolved"].includes(
            settlement.status,
          );
        case "disputed":
          return settlement.status === "disputed";
        default:
          return true;
      }
    });
  }, [filter, settlements]);

  const pendingTotal = useMemo(
    () =>
      settlements
        .filter(
          (s) => s.effective_status === "awaiting_payment" || s.effective_status === "overdue",
        )
        .reduce((sum, s) => sum + Number(s.total_amount || 0), 0),
    [settlements],
  );
  const overdueCount = settlements.filter((s) => s.effective_status === "overdue").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-3xl border border-zinc-900 bg-zinc-950 py-20 text-sm text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Carregando repasses...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Financeiro</p>
          <h2 className="mt-1 text-xl font-black">Repasses a entregadores</h2>
          <p className="mt-1 text-xs text-zinc-500">
            A APOIS calcula o valor de cada entregador; o Pix é feito por você, fora do app. A APOIS
            não guarda esse dinheiro.
          </p>
        </div>
        <div className="flex gap-2">
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
          <Button type="button" disabled={closing} onClick={() => void handleClose()}>
            {closing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CalendarClock className="mr-2 h-4 w-4" />
            )}
            Fechar entregas de hoje
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="A receber (aberto)" value={money(pendingTotal)} />
        <MetricCard label="Repasses vencidos" value={overdueCount} />
        <MetricCard label="Total de fechamentos" value={settlements.length} />
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Filtros de repasse">
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-xl border px-3 py-2 text-xs font-black ${filter === id ? "border-primary bg-primary/10 text-primary" : "border-zinc-800 text-zinc-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum repasse encontrado"
          description="Os fechamentos diários de entregadores aparecerão aqui após entregas concluídas."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((settlement) => {
            const account = pixKeys[settlement.courier_id];
            const canMarkPaid = settlement.status === "awaiting_payment";
            return (
              <article
                key={settlement.id}
                className={`rounded-2xl border p-4 ${settlement.effective_status === "overdue" ? "border-red-500/30 bg-red-500/[0.04]" : "border-zinc-900 bg-zinc-950"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-black">
                      <Truck className="h-4 w-4 text-primary" />
                      {courierNames[settlement.courier_id] || "Entregador"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {new Date(settlement.settlement_date).toLocaleDateString("pt-BR")} ·{" "}
                      {settlement.delivery_count} entrega(s) · prazo {dateTime(settlement.due_at)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${STATUS_CLASS[settlement.effective_status] ?? "bg-zinc-800 text-zinc-300"}`}
                  >
                    {STATUS_LABEL[settlement.effective_status] ?? settlement.effective_status}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-black p-3">
                    <p className="text-[10px] font-black uppercase text-zinc-600">
                      Total do repasse
                    </p>
                    <p className="mt-1 text-lg font-black text-primary">
                      {money(settlement.total_amount)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-black p-3">
                    <p className="text-[10px] font-black uppercase text-zinc-600">
                      Chave Pix do entregador
                    </p>
                    <p className="mt-1 truncate text-sm font-bold">
                      {account?.key ?? "Não cadastrada"}
                      {account?.type ? ` (${account.type})` : ""}
                    </p>
                  </div>
                </div>

                {settlement.status === "disputed" ? (
                  <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-xs text-red-300">
                    O entregador contestou este repasse
                    {settlement.dispute_reason ? `: "${settlement.dispute_reason}"` : "."} A equipe
                    APOIS foi notificada.
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-zinc-800 bg-black"
                    onClick={() => void handleCopyPix(settlement.courier_id)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar chave Pix
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-zinc-800 bg-black"
                    onClick={() => void toggleDeliveries(settlement.id)}
                  >
                    {expanded === settlement.id ? "Ocultar entregas" : "Ver entregas"}
                  </Button>
                  {canMarkPaid ? (
                    <Button
                      type="button"
                      disabled={busy === settlement.id}
                      onClick={() => void handleMarkPaid(settlement)}
                    >
                      {busy === settlement.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Marcar como pago
                    </Button>
                  ) : null}
                </div>

                {expanded === settlement.id ? (
                  <div className="mt-3 space-y-1 rounded-xl border border-zinc-900 bg-black p-3">
                    {(deliveriesBySettlement[settlement.id] ?? []).length === 0 ? (
                      <p className="text-xs text-zinc-600">Carregando entregas...</p>
                    ) : (
                      (deliveriesBySettlement[settlement.id] ?? []).map((delivery) => (
                        <div
                          key={delivery.id}
                          className="flex items-center justify-between text-xs text-zinc-400"
                        >
                          <span>Entrega #{delivery.delivery_job_id.slice(0, 8)}</span>
                          <span className="font-bold text-zinc-200">{money(delivery.amount)}</span>
                        </div>
                      ))
                    )}
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
