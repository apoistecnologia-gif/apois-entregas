import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, PackageCheck, Truck, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getApoisProductMode } from "@/lib/product-routing";

type MerchantOrder = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  fulfillment_type: string | null;
  total: number | string | null;
  created_at: string | null;
};

const ACTIVE_STATUSES = [
  "confirmed",
  "accepted",
  "preparing",
  "ready",
  "ready_for_pickup",
  "searching_driver",
  "driver_assigned",
  "driver_arriving_store",
  "picked_up",
  "out_for_delivery",
  "on_the_way",
];

const PRE_PICKUP_CANCELLABLE_STATUSES = [
  "confirmed",
  "accepted",
  "preparing",
  "ready",
  "searching_driver",
  "driver_assigned",
  "driver_arriving_store",
];

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Novo pedido",
  accepted: "Pedido aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  ready_for_pickup: "Pronto para retirada",
  searching_driver: "Buscando entregador",
  driver_assigned: "Entregador atribuído",
  driver_arriving_store: "Entregador indo à loja",
  picked_up: "Coletado",
  out_for_delivery: "Saiu para entrega",
  on_the_way: "A caminho",
};

const READY_PROMPT_STORAGE_KEY = "apois_merchant_ready_delivery_prompts";

function money(value: MerchantOrder["total"]) {
  return `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;
}

function loadReadyPromptedOrders() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed = JSON.parse(localStorage.getItem(READY_PROMPT_STORAGE_KEY) ?? "[]");
    return new Set<string>(
      Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [],
    );
  } catch {
    return new Set<string>();
  }
}

function persistReadyPromptedOrders(ids: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(READY_PROMPT_STORAGE_KEY, JSON.stringify(Array.from(ids).slice(-150)));
}

function markReadyPrompted(ids: Set<string>, orderId: string) {
  ids.add(orderId);
  persistReadyPromptedOrders(ids);
}

function courierDispatchErrorMessage(message?: string | null) {
  const normalized = String(message ?? "").toLowerCase();
  if (normalized.includes("merchant pickup location required")) {
    return {
      title: "Confirme a localização da loja.",
      description:
        "Antes de solicitar um entregador, abra as configurações do estabelecimento e confirme o ponto exato da loja no mapa.",
    };
  }
  if (normalized.includes("delivery coordinates required")) {
    return {
      title: "O endereço de entrega não tem localização válida.",
      description:
        "Este pedido não possui coordenadas confirmadas no mapa. Cancele o pedido de teste ou faça um novo pedido com endereço válido.",
    };
  }
  if (normalized.includes("courier dispatch radius required")) {
    return {
      title: "Busca de entregadores ainda não configurada para esta cidade.",
      description:
        "O administrador precisa definir o raio de busca de entregadores antes de iniciar os chamados.",
    };
  }
  if (normalized.includes("pix payment must be confirmed")) {
    return {
      title: "Pagamento ainda não confirmado.",
      description: "A busca por entregador só pode começar depois da confirmação do pagamento.",
    };
  }
  if (normalized.includes("order must be ready")) {
    return {
      title: "O pedido ainda não está pronto para despacho.",
      description: "Conclua as etapas de aceite e preparo antes de solicitar um entregador.",
    };
  }
  return {
    title: "Não foi possível solicitar o entregador.",
    description: message || "Tente novamente em instantes.",
  };
}

function cancellationErrorMessage(message?: string | null) {
  const normalized = String(message ?? "").toLowerCase();
  if (normalized.includes("order can no longer be rejected")) {
    return "Este pedido já foi coletado ou avançou além do ponto em que o estabelecimento pode cancelar.";
  }
  if (normalized.includes("cancellation reason is required")) {
    return "Informe o motivo do cancelamento.";
  }
  return message || "Não foi possível cancelar o pedido.";
}

function MerchantOrderControlCenter() {
  const enabled = getApoisProductMode() === "merchant";
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [open, setOpen] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const readyPromptedRef = useRef<Set<string>>(loadReadyPromptedOrders());

  const loadOrders = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("orders" as any)
      .select(
        "id,order_number,status,payment_status,payment_method,fulfillment_type,total,created_at",
      )
      .eq("merchant_id", id)
      .eq("payment_status", "paid")
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      console.warn("Falha ao carregar central operacional de pedidos:", error.code);
      return;
    }
    setOrders((data ?? []) as MerchantOrder[]);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    const resolveMerchant = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || disposed) {
        if (!disposed) {
          setMerchantId(null);
          setOrders([]);
        }
        return;
      }

      const { data } = await supabase
        .from("merchant_members" as any)
        .select("merchant_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const id = typeof data?.merchant_id === "string" ? data.merchant_id : null;
      if (disposed) return;
      setMerchantId(id);
      if (id) await loadOrders(id);
    };

    void resolveMerchant();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => void resolveMerchant());
    return () => {
      disposed = true;
      authListener.subscription.unsubscribe();
    };
  }, [enabled, loadOrders]);

  useEffect(() => {
    if (!enabled || !merchantId) return;
    const channel = supabase
      .channel(`merchant_order_controls_${merchantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `merchant_id=eq.${merchantId}`,
        },
        () => void loadOrders(merchantId),
      )
      .subscribe();

    const interval = window.setInterval(() => void loadOrders(merchantId), 5000);
    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [enabled, loadOrders, merchantId]);

  useEffect(() => {
    if (!enabled) return;
    const readyOrder = orders.find(
      (order) =>
        order.status === "ready" &&
        order.fulfillment_type === "delivery" &&
        !readyPromptedRef.current.has(order.id),
    );
    if (!readyOrder) return;

    markReadyPrompted(readyPromptedRef.current, readyOrder.id);
    setOpen(true);
    toast.success(`Pedido #${readyOrder.order_number} está pronto.`, {
      id: `merchant-ready-${readyOrder.id}`,
      description: "Agora solicite um entregador para iniciar a busca.",
      duration: 12_000,
    });
  }, [enabled, orders]);

  const urgentCount = useMemo(
    () => orders.filter((order) => order.status === "confirmed").length,
    [orders],
  );

  const readyDeliveryOrder = useMemo(
    () =>
      orders.find(
        (order) =>
          order.status === "ready" &&
          order.fulfillment_type === "delivery" &&
          (order.payment_method !== "pix" || order.payment_status === "paid"),
      ) ?? null,
    [orders],
  );

  const transition = async (orderId: string, status: string) => {
    if (!merchantId || busyOrderId) return;
    setBusyOrderId(orderId);
    const { error } = await (supabase as any).rpc("merchant_transition_order", {
      _order_id: orderId,
      _new_status: status,
    });
    setBusyOrderId(null);
    if (error) {
      toast.error(error.message || "Não foi possível atualizar o pedido.");
      return;
    }

    if (status === "accepted") toast.success("Pedido aceito.");
    else if (status === "preparing") toast.success("Preparo iniciado.");
    else if (status === "ready") {
      markReadyPrompted(readyPromptedRef.current, orderId);
      setOpen(true);
      toast.success("Pedido marcado como pronto.", {
        id: `merchant-ready-${orderId}`,
        description: "Agora solicite um entregador para iniciar a busca.",
        duration: 12_000,
      });
    } else toast.success("Pedido atualizado.");

    await loadOrders(merchantId);
  };

  const requestCourier = async (orderId: string) => {
    if (!merchantId || busyOrderId) return;
    setBusyOrderId(orderId);
    const { data, error } = await (supabase as any).rpc("merchant_request_courier", {
      _order_id: orderId,
    });
    setBusyOrderId(null);

    if (error || !data) {
      const feedback = courierDispatchErrorMessage(error?.message);
      toast.error(feedback.title, {
        description: feedback.description,
        duration: 14_000,
      });
      return;
    }

    toast.success("Busca por entregador iniciada.", {
      description:
        "O sistema continuará procurando entregadores aptos, online e próximos ao estabelecimento.",
      duration: 12_000,
    });
    await loadOrders(merchantId);
  };

  const reject = async (orderId: string) => {
    if (!merchantId || busyOrderId) return;
    const reason = window.prompt("Informe o motivo do cancelamento:")?.trim();
    if (!reason) return;

    setBusyOrderId(orderId);
    const { data, error } = await (supabase as any).rpc("merchant_reject_order", {
      _order_id: orderId,
      _reason: reason,
    });

    if (!error && data?.refund_id) {
      const { error: refundError } = await supabase.functions.invoke("process-refund", {
        body: { refundId: data.refund_id },
      });
      if (refundError) {
        toast.warning("Pedido cancelado. O estorno ficou pendente para nova tentativa.");
      } else {
        toast.success("Pedido cancelado e estorno processado.");
      }
    } else if (!error) {
      toast.success("Pedido cancelado.");
    }

    setBusyOrderId(null);
    if (error) toast.error(cancellationErrorMessage(error.message));
    await loadOrders(merchantId);
  };

  if (!enabled || !merchantId) return null;

  return (
    <div className="fixed bottom-5 left-5 z-[990] text-white">
      {open ? (
        <section className="mb-3 max-h-[72dvh] w-[min(420px,calc(100vw-2.5rem))] overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl">
          <div className="flex items-center justify-between border-b border-zinc-900 px-4 py-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                Operação
              </p>
              <h2 className="font-black">Central de pedidos</h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-zinc-900 p-2 text-zinc-400"
              aria-label="Fechar central de pedidos"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[60dvh] space-y-3 overflow-y-auto p-3">
            {orders.map((order) => {
              const paymentReady =
                order.payment_method !== "pix" || order.payment_status === "paid";
              const busy = busyOrderId === order.id;
              const canReject = PRE_PICKUP_CANCELLABLE_STATUSES.includes(order.status);

              return (
                <article key={order.id} className="rounded-2xl border border-zinc-800 bg-black p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">Pedido #{order.order_number}</p>
                      <p className="mt-1 text-xs font-bold text-primary">
                        {STATUS_LABELS[order.status] ?? order.status}
                      </p>
                    </div>
                    <p className="font-black text-primary">{money(order.total)}</p>
                  </div>

                  {!paymentReady ? (
                    <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-2 text-xs font-bold text-amber-300">
                      Aguardando confirmação do pagamento.
                    </p>
                  ) : null}

                  <div className="mt-3 grid gap-2">
                    {order.status === "confirmed" ? (
                      <Button
                        type="button"
                        disabled={busy || !paymentReady}
                        onClick={() => void transition(order.id, "accepted")}
                        className="w-full font-black"
                      >
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Aceitar pedido
                      </Button>
                    ) : null}

                    {order.status === "accepted" ? (
                      <Button
                        type="button"
                        disabled={busy || !paymentReady}
                        onClick={() => void transition(order.id, "preparing")}
                        className="w-full font-black"
                      >
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Iniciar preparo
                      </Button>
                    ) : null}

                    {order.status === "preparing" ? (
                      <Button
                        type="button"
                        disabled={busy || !paymentReady}
                        onClick={() => void transition(order.id, "ready")}
                        className="w-full font-black"
                      >
                        {busy ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <PackageCheck className="mr-2 h-4 w-4" />
                        )}
                        Pedido pronto
                      </Button>
                    ) : null}

                    {order.status === "ready" && order.fulfillment_type === "delivery" ? (
                      <Button
                        type="button"
                        disabled={busy || !paymentReady}
                        onClick={() => void requestCourier(order.id)}
                        className="w-full bg-[#FFD700] font-black text-black hover:bg-[#FFD700]/90"
                      >
                        {busy ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Truck className="mr-2 h-4 w-4" />
                        )}
                        Solicitar entregador
                      </Button>
                    ) : null}

                    {order.status === "searching_driver" ? (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-300">
                        Buscando entregador apto, online e próximo.
                      </div>
                    ) : null}

                    {["driver_assigned", "driver_arriving_store"].includes(order.status) ? (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-300">
                        Entregador atribuído para este pedido.
                      </div>
                    ) : null}

                    {order.status === "ready_for_pickup" ? (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs font-bold text-primary">
                        Pronto para retirada. Confirme o PIN do cliente na aba Pedidos.
                      </div>
                    ) : null}

                    {canReject ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void reject(order.id)}
                        className="w-full border-red-500/20 text-red-400"
                      >
                        Cancelar pedido
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}

            {orders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
                Nenhum pedido em andamento.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {readyDeliveryOrder ? (
        <button
          type="button"
          disabled={busyOrderId === readyDeliveryOrder.id}
          onClick={() => void requestCourier(readyDeliveryOrder.id)}
          className="mb-3 flex w-[min(420px,calc(100vw-2.5rem))] items-center justify-center gap-3 rounded-2xl border border-[#FFD700] bg-[#FFD700] px-5 py-4 text-sm font-black uppercase text-black shadow-2xl disabled:opacity-60"
        >
          {busyOrderId === readyDeliveryOrder.id ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Truck className="h-5 w-5" />
          )}
          Solicitar entregador · Pedido #{readyDeliveryOrder.order_number}
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 items-center gap-2 rounded-full border border-primary/40 bg-black px-4 py-3 text-sm font-black text-white shadow-2xl"
      >
        <PackageCheck className="h-4 w-4 text-primary" />
        Pedidos {orders.length > 0 ? `(${orders.length})` : ""}
        {urgentCount > 0 ? (
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs text-black">
            {urgentCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}

export { MerchantOrderControlCenter };
