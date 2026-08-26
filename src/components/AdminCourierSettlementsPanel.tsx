import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard } from "@/components/WorkspaceShell";
import { usePromptDialog } from "@/components/ui/prompt-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Settlement = {
  id: string;
  merchant_id: string;
  courier_id: string;
  settlement_date: string;
  delivery_count: number;
  total_amount: number | string;
  status: string;
  effective_status: string;
  due_at: string;
  dispute_reason: string | null;
  proof_storage_path: string | null;
  admin_resolution_outcome: string | null;
  admin_resolution_reason: string | null;
};

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
  overdue: "Vencido",
  merchant_marked_paid: "Pagamento informado",
  confirmed: "Confirmado",
  disputed: "Em contestação",
  admin_resolved: "Resolvido",
};

const FILTERS = [
  ["pending", "Pendentes"],
  ["overdue", "Vencidos"],
  ["disputed", "Contestados"],
  ["confirmed", "Confirmados"],
  ["all", "Todos"],
] as const;

export function AdminCourierSettlementsPanel() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [merchantNames, setMerchantNames] = useState<Record<string, string>>({});
  const [courierNames, setCourierNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("overdue");
  const { prompt, promptDialog } = usePromptDialog();

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const settlementsRes = await from("courier_settlements_view")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (settlementsRes.error) throw settlementsRes.error;
      const rows = (settlementsRes.data ?? []) as Settlement[];
      setSettlements(rows);

      const merchantIds = Array.from(new Set(rows.map((row) => row.merchant_id)));
      const courierIds = Array.from(new Set(rows.map((row) => row.courier_id)));
      const [merchantsRes, couriersRes] = await Promise.all([
        merchantIds.length
          ? from("merchants").select("id,name").in("id", merchantIds)
          : Promise.resolve({ data: [] }),
        courierIds.length
          ? from("couriers").select("id,user_id").in("id", courierIds)
          : Promise.resolve({ data: [] }),
      ]);
      setMerchantNames(
        Object.fromEntries(
          ((merchantsRes.data ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]),
        ),
      );
      const couriers = (couriersRes.data ?? []) as { id: string; user_id: string }[];
      const userIds = couriers.map((c) => c.user_id);
      const profilesRes = userIds.length
        ? await from("profiles").select("id,full_name").in("id", userIds)
        : { data: [] };
      const profileByUser = new Map(
        ((profilesRes.data ?? []) as { id: string; full_name: string | null }[]).map((p) => [
          p.id,
          p.full_name,
        ]),
      );
      setCourierNames(
        Object.fromEntries(
          couriers.map((c) => [c.id, profileByUser.get(c.user_id) || "Entregador"]),
        ),
      );
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível carregar os repasses.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return settlements.filter((settlement) => {
      switch (filter) {
        case "pending":
          return settlement.effective_status === "awaiting_payment";
        case "overdue":
          return settlement.effective_status === "overdue";
        case "disputed":
          return settlement.status === "disputed";
        case "confirmed":
          return settlement.status === "confirmed";
        default:
          return true;
      }
    });
  }, [filter, settlements]);

  const overdueCount = settlements.filter((s) => s.effective_status === "overdue").length;
  const disputedCount = settlements.filter((s) => s.status === "disputed").length;

  const resolveDispute = async (settlement: Settlement) => {
    const values = await prompt({
      title: "Resolver disputa de repasse",
      description: `Repasse de ${money(settlement.total_amount)} entre ${merchantNames[settlement.merchant_id] ?? "estabelecimento"} e ${courierNames[settlement.courier_id] ?? "entregador"}.`,
      fields: [
        {
          key: "outcome",
          label:
            'Resultado: digite "pago" (comprovante confirmado) ou "pendente" (estabelecimento ainda precisa pagar)',
          placeholder: "pago ou pendente",
          required: true,
        },
        {
          key: "reason",
          label: "Motivo da resolução (obrigatório, fica registrado na auditoria)",
          placeholder: "Ex.: comprovante verificado com o estabelecimento por telefone",
          type: "textarea",
          required: true,
        },
      ],
      confirmLabel: "Resolver",
    });
    if (!values) return;
    const normalized = (values["outcome"] ?? "").trim().toLowerCase();
    if (!["pago", "pendente"].includes(normalized)) {
      toast.error('Digite exatamente "pago" ou "pendente".');
      return;
    }
    const reason = (values["reason"] ?? "").trim();
    setBusy(settlement.id);
    try {
      const { error } = await rpc("admin_resolve_courier_settlement_dispute", {
        _settlement_id: settlement.id,
        _outcome: normalized === "pago" ? "paid_confirmed" : "payment_required",
        _reason: reason,
      });
      if (error) throw error;
      toast.success("Disputa resolvida.");
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível resolver a disputa.");
    } finally {
      setBusy(null);
    }
  };

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
      {promptDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Financeiro</p>
          <h2 className="mt-1 text-xl font-black">Repasses de estabelecimentos a entregadores</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Modelo manual: o Pix é feito pelo estabelecimento fora do app. A APOIS acompanha e
            resolve contestações.
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

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Vencidos" value={overdueCount} />
        <MetricCard label="Contestados" value={disputedCount} />
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
        <EmptyState title="Nenhum repasse encontrado" description="Ajuste os filtros acima." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-zinc-900/60 text-[10px] font-black uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Estabelecimento</th>
                  <th className="px-4 py-3">Entregador</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Entregas</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Prazo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Comprovante</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {filtered.map((settlement) => (
                  <tr key={settlement.id}>
                    <td className="px-4 py-3 font-bold">
                      {merchantNames[settlement.merchant_id] ?? "—"}
                    </td>
                    <td className="px-4 py-3">{courierNames[settlement.courier_id] ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {new Date(settlement.settlement_date).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">{settlement.delivery_count}</td>
                    <td className="px-4 py-3 font-black text-primary">
                      {money(settlement.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {dateTime(settlement.due_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                          settlement.effective_status === "overdue" ||
                          settlement.status === "disputed"
                            ? "bg-red-500/10 text-red-300"
                            : "bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        {STATUS_LABEL[settlement.effective_status] ?? settlement.effective_status}
                      </span>
                      {settlement.dispute_reason ? (
                        <p className="mt-1 max-w-[220px] text-[10px] text-zinc-600">
                          "{settlement.dispute_reason}"
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {settlement.proof_storage_path ? "Sim" : "Não"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {settlement.status === "disputed" ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="border-red-500/30 bg-red-500/5 text-xs text-red-300"
                          disabled={busy === settlement.id}
                          onClick={() => void resolveDispute(settlement)}
                        >
                          {busy === settlement.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <ShieldAlert className="mr-2 h-4 w-4" />
                          )}
                          Resolver disputa
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
