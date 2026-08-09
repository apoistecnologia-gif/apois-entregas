import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, MapPin, CheckCircle2, Bike, PackageCheck, UtensilsCrossed, Star, Loader2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/pedido/$orderId/")({
  component: OrderDetailsPage,
  head: () => ({ meta: [{ title: "Detalhes do Pedido | APOIS ENTREGA" }] }),
});

function OrderDetailsPage() {
  const navigate = useNavigate();
  const { orderId } = useParams({ from: "/pedido/$orderId/" });
  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const fetchOrder = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*, merchants (*), order_items (*)")
      .eq("id", orderId)
      .single();
    if (error) {
      toast.error("Não foi possível carregar os detalhes deste pedido.");
      setOrder(null);
    } else {
      setOrder(data);
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    void fetchOrder();
    const channel = supabase
      .channel(`order_status_${orderId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, (payload) => {
        setOrder((previous: any) => previous ? { ...previous, ...payload.new } : null);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [orderId, fetchOrder]);

  const cancelOrder = async () => {
    if (!order || cancelling) return;
    const reason = window.prompt("Por que você deseja cancelar este pedido?")?.trim();
    if (!reason) return;
    if (!window.confirm("Confirma o cancelamento? Depois de cancelado, o pedido não seguirá para preparo/entrega.")) return;

    setCancelling(true);
    try {
      const { data, error } = await supabase.rpc("customer_cancel_order", { _order_id: order.id, _reason: reason });
      if (error) throw error;
      const refundId = data?.refund_id ?? null;
      if (refundId) {
        const { error: refundError } = await supabase.functions.invoke("process-refund", { body: { refundId } });
        if (refundError) {
          toast.warning("Pedido cancelado. O estorno foi registrado e continuará pendente para nova tentativa.");
        } else {
          toast.success("Pedido cancelado e estorno processado.");
        }
      } else {
        toast.success("Pedido cancelado.");
      }
      await fetchOrder();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível cancelar este pedido.");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <div className="flex h-screen w-full items-center justify-center bg-black"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (!order) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-black p-6 text-center text-white">
        <h2 className="mb-4 text-xl font-bold">Pedido não encontrado</h2>
        <button type="button" onClick={() => navigate({ to: "/pedidos" })} className="rounded-xl bg-primary px-6 py-3 font-bold uppercase text-black shadow-lg shadow-primary/20 transition-transform active:scale-95">Voltar para Meus Pedidos</button>
      </div>
    );
  }

  const getStatusStep = (status: string) => {
    switch (status) {
      case "confirmed":
      case "accepted": return 0;
      case "preparing": return 1;
      case "ready":
      case "ready_for_pickup":
      case "searching_driver":
      case "driver_assigned":
      case "driver_arriving_store": return 2;
      case "picked_up":
      case "out_for_delivery":
      case "on_the_way": return 3;
      case "delivered": return 4;
      default: return -1;
    }
  };

  const currentStepIdx = getStatusStep(order.status);
  const isCancelled = order.status === "cancelled";
  const isRefunded = order.status === "refunded" || order.payment_status === "refunded";
  const canCancel = ["created", "pending_payment", "paid", "confirmed"].includes(order.status);

  const stepStatus = (index: number) => {
    if (currentStepIdx < 0) return "pending";
    if (order.status === "delivered" && index <= currentStepIdx) return "completed";
    if (index < currentStepIdx) return "completed";
    if (index === currentStepIdx) return "current";
    return "pending";
  };

  const steps = [
    { label: "Pedido confirmado", icon: CheckCircle2, status: stepStatus(0) },
    { label: "Estabelecimento preparando", icon: UtensilsCrossed, status: stepStatus(1) },
    { label: "Pedido pronto", icon: PackageCheck, status: stepStatus(2) },
    { label: "Saiu para entrega", icon: Bike, status: stepStatus(3) },
    { label: "Entregue", icon: CheckCircle2, status: stepStatus(4) },
  ];

  let deliveryAddress: any = order.delivery_address;
  if (typeof deliveryAddress === "string") {
    try { deliveryAddress = JSON.parse(deliveryAddress); } catch { deliveryAddress = {}; }
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center gap-4 border-b border-zinc-900 bg-black/80 p-4 backdrop-blur-lg">
        <button type="button" onClick={() => navigate({ to: "/pedidos" })} className="rounded-full bg-zinc-900 p-2"><ArrowLeft /></button>
        <div><h1 className="text-lg font-bold">Pedido #{order.order_number}</h1><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{order.merchants?.name}</p></div>
      </header>

      <main className="flex-1 space-y-6 overflow-y-auto p-4 pb-20">
        {(isCancelled || isRefunded) ? (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-sm font-black uppercase text-zinc-300">{isRefunded ? "Pedido reembolsado" : "Pedido cancelado"}</p>
            <p className="mt-1 text-xs text-zinc-500">{isRefunded ? "O pagamento deste pedido foi reembolsado." : order.payment_status === "paid" ? "O pedido foi cancelado. Se houver estorno pendente, ele será conciliado pelo sistema." : "Este pedido foi cancelado e não seguirá para entrega."}</p>
          </section>
        ) : (
          <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-6">
            <div className="space-y-6">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.label} className="relative flex gap-4">
                    {index !== steps.length - 1 ? <div className={`absolute left-4 top-8 h-10 w-[2px] ${step.status === "completed" ? "bg-primary" : "bg-zinc-800"}`} /> : null}
                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ring-2 ring-black ${step.status === "completed" ? "bg-primary text-black" : step.status === "current" ? "bg-zinc-800 text-primary ring-primary/20" : "bg-zinc-900 text-zinc-700"}`}><Icon className="h-4 w-4" /></div>
                    <div className="flex-1 pt-1"><p className={`text-sm font-bold ${step.status === "pending" ? "text-zinc-700" : "text-white"}`}>{step.label}</p>{step.status === "current" ? <p className="animate-pulse text-[10px] font-bold text-primary">EM ANDAMENTO</p> : null}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {canCancel ? (
          <button type="button" disabled={cancelling} onClick={cancelOrder} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 py-4 font-bold text-red-400 disabled:opacity-50">
            {cancelling ? <Loader2 className="h-5 w-5 animate-spin" /> : <XCircle className="h-5 w-5" />}{cancelling ? "Cancelando..." : "Cancelar pedido"}
          </button>
        ) : null}

        {order.status === "delivered" ? <button type="button" onClick={() => navigate({ to: `/pedido/${orderId}/avaliar` })} className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 py-4 font-bold text-primary shadow-lg shadow-primary/5 transition-transform active:scale-95"><Star className="h-5 w-5 fill-primary" />Avaliar pedido</button> : null}

        <section className="space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <h3 className="text-sm font-black uppercase tracking-wider text-zinc-500">Resumo do pedido</h3>
          <div className="space-y-3">
            {order.order_items?.map((item: any) => (
              <div key={item.id} className="space-y-1">
                <div className="flex justify-between text-sm"><span className="text-zinc-300">{item.quantity}x {item.product_name}</span><span className="font-bold">R$ {Number(item.line_total).toFixed(2).replace(".", ",")}</span></div>
                {item.selected_options ? <p className="text-[10px] text-zinc-500">{Array.isArray(item.selected_options) ? item.selected_options.map((option: any) => option.optionName).join(" • ") : typeof item.selected_options === "object" ? Object.values(item.selected_options).map((option: any) => option.optionName).join(" • ") : ""}</p> : null}
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-zinc-900 pt-3">
            <div className="flex justify-between text-xs text-zinc-500"><span>Subtotal</span><span>R$ {Number(order.subtotal).toFixed(2).replace(".", ",")}</span></div>
            <div className="flex justify-between text-xs text-zinc-500"><span>Taxa de entrega</span><span>R$ {Number(order.delivery_fee).toFixed(2).replace(".", ",")}</span></div>
            <div className="flex justify-between pt-2 text-lg font-black text-primary"><span>Total</span><span>R$ {Number(order.total).toFixed(2).replace(".", ",")}</span></div>
          </div>
        </section>

        <section className="flex gap-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-900"><MapPin className="h-5 w-5 text-primary" /></div>
          <div><p className="text-xs font-bold uppercase text-zinc-500">Endereço de entrega</p><p className="mt-0.5 text-sm font-bold">{deliveryAddress?.street || "—"}, {deliveryAddress?.number || "s/n"}</p><p className="text-[11px] text-zinc-500">{deliveryAddress?.label ? `${deliveryAddress.label} • ` : ""}{deliveryAddress?.neighborhood || ""}</p></div>
        </section>

        <div className="grid grid-cols-2 gap-4">
          <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4"><p className="mb-1 text-[10px] font-bold uppercase text-zinc-500">Pagamento</p><p className="text-sm font-bold uppercase">{order.payment_method} · {order.payment_status}</p></section>
          <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4"><p className="mb-1 text-[10px] font-bold uppercase text-zinc-500">Data</p><p className="text-sm font-bold">{new Date(order.created_at).toLocaleDateString("pt-BR")}</p></section>
        </div>
      </main>
    </div>
  );
}
