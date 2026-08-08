import { useCallback, useEffect, useState } from "react";
import { RefreshCw, RotateCcw, X } from "lucide-react";
import { requireSupabase } from "./supabase";

type RefundRow = {
  id: string;
  payment_id: string;
  order_id: string;
  amount: number;
  reason: string;
  status: string;
  provider_refund_id: string | null;
  processed_at: string | null;
  created_at: string;
};
type OrderRow = { id: string; order_number: number };
type ProcessResponse = { refund?: { id?: string; status?: string; providerRefundId?: string | null } };

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
function statusClass(status: string) {
  if (status === "completed") return "good";
  if (status === "failed" || status === "cancelled") return "bad";
  return "warn";
}

export default function AdminRefundPortal() {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [orders, setOrders] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const verifyAdmin = useCallback(async () => {
    const client = requireSupabase();
    const { data: auth } = await client.auth.getSession();
    if (!auth.session) {
      setAllowed(false);
      return;
    }
    const { data } = await client.rpc("current_user_is_admin");
    setAllowed(Boolean(data));
  }, []);

  useEffect(() => {
    void verifyAdmin();
    const client = requireSupabase();
    const { data: listener } = client.auth.onAuthStateChange(() => void verifyAdmin());
    return () => listener.subscription.unsubscribe();
  }, [verifyAdmin]);

  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    setMessage(null);
    const client = requireSupabase();
    const { data: refundRows, error } = await client
      .from("refunds")
      .select("id,payment_id,order_id,amount,reason,status,provider_refund_id,processed_at,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      setMessage("Não foi possível carregar os estornos.");
      setLoading(false);
      return;
    }
    const normalized = ((refundRows ?? []) as RefundRow[]).map((refund) => ({ ...refund, amount: Number(refund.amount) }));
    setRefunds(normalized);
    const orderIds = [...new Set(normalized.map((refund) => refund.order_id))];
    if (orderIds.length > 0) {
      const { data: orderRows } = await client.from("orders").select("id,order_number").in("id", orderIds);
      const next: Record<string, number> = {};
      ((orderRows ?? []) as OrderRow[]).forEach((order) => { next[order.id] = order.order_number; });
      setOrders(next);
    } else {
      setOrders({});
    }
    setLoading(false);
  }, [allowed]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  if (!allowed) return null;
  const pendingCount = refunds.filter((refund) => ["pending", "processing", "failed"].includes(refund.status)).length;

  const retry = async (refund: RefundRow) => {
    setBusy(refund.id);
    setMessage(null);
    const { data, error } = await requireSupabase().functions.invoke<ProcessResponse>("process-refund", {
      body: { refundId: refund.id },
    });
    if (error) {
      setMessage("O estorno não foi concluído agora. Ele continua registrado para nova tentativa.");
    } else {
      setMessage(data?.refund?.status === "completed" ? "Estorno confirmado pelo Mercado Pago." : "Estorno enviado e ainda em processamento.");
    }
    await load();
    setBusy(null);
  };

  return (
    <>
      <button
        type="button"
        className="secondary"
        onClick={() => setOpen(true)}
        style={{ position: "fixed", right: 22, bottom: 22, zIndex: 70, boxShadow: "0 12px 35px rgba(0,0,0,.45)" }}
      >
        <RotateCcw size={15} /> Estornos{pendingCount > 0 ? ` (${pendingCount})` : ""}
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Central de estornos" style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,.78)", display: "grid", placeItems: "center", padding: 18 }}>
          <section className="card section" style={{ width: "min(980px,100%)", maxHeight: "92vh", overflow: "auto" }}>
            <div className="section-title">
              <div><h2>Central de estornos</h2><p className="muted">Reembolsos registrados pelo backend e conciliados com Mercado Pago.</p></div>
              <div className="actions">
                <button type="button" className="secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={14} /> Atualizar</button>
                <button type="button" className="secondary" onClick={() => setOpen(false)}><X size={14} /> Fechar</button>
              </div>
            </div>
            {message && <div className="error" style={{ marginBottom: 12 }}>{message}</div>}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Pedido</th><th>Valor</th><th>Motivo</th><th>Status</th><th>Criado</th><th>Provedor</th><th>Ação</th></tr></thead>
                <tbody>
                  {refunds.map((refund) => (
                    <tr key={refund.id}>
                      <td>#{orders[refund.order_id] ?? refund.order_id.slice(0, 8)}</td>
                      <td>{money(refund.amount)}</td>
                      <td>{refund.reason}</td>
                      <td><span className={`status ${statusClass(refund.status)}`}>{refund.status}</span></td>
                      <td>{dateTime(refund.created_at)}</td>
                      <td>{refund.provider_refund_id ?? "—"}</td>
                      <td>
                        {["pending", "processing", "failed"].includes(refund.status) ? (
                          <button type="button" className="primary" disabled={busy === refund.id} onClick={() => void retry(refund)}>
                            {busy === refund.id ? "Processando..." : "Tentar novamente"}
                          </button>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {refunds.length === 0 && <div className="empty">Nenhum estorno registrado.</div>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
