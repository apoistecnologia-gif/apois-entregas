import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Star,
  Store,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  cancelCustomerOrder,
  CustomerOrdersError,
  fetchCustomerOrderDetail,
  type CustomerOrderDetail,
} from "@/lib/remote-orders";

export const Route = createFileRoute("/pedido/$orderId/")({
  component: OrderDetailsPage,
});

const ORDER_STATUS_LABELS: Record<string, string> = {
  created: "Pedido criado",
  pending_payment: "Aguardando pagamento",
  paid: "Pagamento confirmado",
  confirmed: "Pedido confirmado",
  accepted: "Pedido aceito",
  preparing: "Em preparo",
  ready: "Pedido pronto",
  ready_for_pickup: "Pronto para retirada",
  searching_driver: "Buscando entregador",
  driver_assigned: "Entregador encontrado",
  driver_arriving_store: "Entregador indo ao estabelecimento",
  picked_up: "Pedido coletado",
  out_for_delivery: "Saiu para entrega",
  on_the_way: "A caminho",
  delivered: "Pedido entregue",
  cancelled: "Pedido cancelado",
  refunded: "Valor estornado",
};

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  searching: "Buscando entregador",
  offered: "Oferta enviada a entregadores",
  accepted: "Entregador aceitou",
  arriving_pickup: "Entregador a caminho do estabelecimento",
  at_pickup: "Entregador chegou ao estabelecimento",
  picked_up: "Pedido coletado",
  on_the_way: "Entrega a caminho",
  arrived_destination: "Entregador chegou ao destino",
  delivered: "Entrega concluída",
  cancelled: "Entrega cancelada",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  processing: "Processando",
  paid: "Pago",
  cancelled: "Cancelado",
  failed: "Falhou",
  refunded: "Estornado",
};

const CANCELLABLE_STATUSES = new Set(["created", "pending_payment", "paid", "confirmed"]);

function money(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function readText(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === "string" ? record[key] : "";
}

function formatAddress(address: Record<string, unknown>): { firstLine: string; secondLine: string } {
  const street = readText(address, "street") || readText(address, "address_line");
  const number = readText(address, "number");
  const neighborhood = readText(address, "neighborhood");
  const city = readText(address, "city");
  const state = readText(address, "state");
  const label = readText(address, "label");

  return {
    firstLine: [street, number].filter(Boolean).join(", ") || "Endereço de entrega",
    secondLine:
      [label, neighborhood, [city, state].filter(Boolean).join("/")].filter(Boolean).join(" · ") ||
      "Endereço cadastrado",
  };
}

function OrderDetailsPage() {
  const navigate = useNavigate();
  const { orderId } = useParams({ from: "/pedido/$orderId/" });
  const [order, setOrder] = useState<CustomerOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadOrder = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const remoteOrder = await fetchCustomerOrderDetail(orderId);
        setOrder(remoteOrder);
        setError(null);
      } catch (loadError) {
        setError(
          loadError instanceof CustomerOrdersError
            ? loadError.message
            : "Não foi possível carregar o pedido.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orderId],
  );

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    const channel = supabase
      .channel(`customer-order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => void loadOrder(true),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_status_history", filter: `order_id=eq.${orderId}` },
        () => void loadOrder(true),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_jobs", filter: `order_id=eq.${orderId}` },
        () => void loadOrder(true),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadOrder, orderId]);

  const address = useMemo(
    () => (order ? formatAddress(order.delivery_address) : { firstLine: "", secondLine: "" }),
    [order],
  );

  const handleCancel = async () => {
    if (!order || cancelling) return;
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      setActionMessage("Informe o motivo do cancelamento.");
      return;
    }

    setCancelling(true);
    setActionMessage(null);
    try {
      const result = await cancelCustomerOrder(order.id, reason);
      setShowCancel(false);
      setCancelReason("");
      setActionMessage(
        result.refund_pending
          ? "Pedido cancelado. O estorno foi encaminhado para processamento."
          : "Pedido cancelado com sucesso.",
      );
      await loadOrder(true);
    } catch (cancelError) {
      setActionMessage(
        cancelError instanceof CustomerOrdersError
          ? cancelError.message
          : "Não foi possível cancelar o pedido.",
      );
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black text-primary">
        <Loader2 className="h-9 w-9 animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-black p-6 text-center text-white">
        <h2 className="mb-2 text-xl font-bold">Pedido não encontrado</h2>
        <p className="mb-6 text-sm text-zinc-500">{error ?? "Não encontramos esse pedido na sua conta."}</p>
        <button
          onClick={() => void navigate({ to: "/pedidos" })}
          className="rounded-xl bg-primary px-6 py-3 font-bold uppercase text-black"
        >
          Meus pedidos
        </button>
      </div>
    );
  }

  const statusHistory = order.order_status_history.length
    ? order.order_status_history
    : [
        {
          id: `current-${order.id}`,
          status: order.status,
          changed_by_user_id: null,
          created_at: order.updated_at,
        },
      ];
  const courier = order.delivery?.couriers;
  const canCancel = CANCELLABLE_STATUSES.has(order.status);
  const isFinal = ["delivered", "cancelled", "refunded"].includes(order.status);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center gap-4 border-b border-zinc-900 bg-black/90 p-4 backdrop-blur-lg">
        <button
          onClick={() => void navigate({ to: "/pedidos" })}
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar para meus pedidos"
        >
          <ArrowLeft />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">Pedido #{order.order_number}</h1>
            {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
          </div>
          <p className="truncate text-[10px] font-black uppercase tracking-widest text-zinc-500">
            {order.merchants?.name ?? "Estabelecimento"}
          </p>
        </div>
      </header>

      <main className="flex-1 space-y-5 overflow-y-auto p-4 pb-24">
        {actionMessage && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-zinc-200">
            {actionMessage}
          </div>
        )}

        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Status atual</p>
              <h2 className="mt-1 text-lg font-black text-primary">
                {ORDER_STATUS_LABELS[order.status] ?? order.status.replaceAll("_", " ")}
              </h2>
            </div>
            {isFinal ? (
              order.status === "delivered" ? (
                <CheckCircle2 className="h-8 w-8 text-primary" />
              ) : (
                <XCircle className="h-8 w-8 text-zinc-500" />
              )
            ) : (
              <Clock3 className="h-8 w-8 text-primary" />
            )}
          </div>

          <div className="space-y-0">
            {statusHistory.map((entry, index) => {
              const completed = index < statusHistory.length - 1;
              return (
                <div key={entry.id} className="relative flex gap-4 pb-5 last:pb-0">
                  {index !== statusHistory.length - 1 && (
                    <div className="absolute left-[15px] top-8 h-[calc(100%-20px)] w-px bg-primary/40" />
                  )}
                  <div
                    className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                      completed ? "bg-primary text-black" : "bg-primary/15 text-primary"
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="text-sm font-bold">
                      {ORDER_STATUS_LABELS[entry.status] ?? entry.status.replaceAll("_", " ")}
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-600">
                      {new Date(entry.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {order.delivery && (
          <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-900">
                <Bike className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Entrega</p>
                <p className="font-bold">
                  {DELIVERY_STATUS_LABELS[order.delivery.status] ?? order.delivery.status.replaceAll("_", " ")}
                </p>
              </div>
            </div>

            {courier && (
              <div className="mt-4 flex items-center gap-3 rounded-xl bg-zinc-900/60 p-3">
                {courier.profile?.avatar_url || courier.photo_url ? (
                  <img
                    src={courier.profile?.avatar_url ?? courier.photo_url ?? ""}
                    alt="Entregador"
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-black text-lg font-black text-primary">
                    {(courier.profile?.full_name ?? "E").slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{courier.profile?.full_name ?? "Entregador APOIS"}</p>
                  <p className="text-xs text-zinc-500">
                    {[courier.vehicle_model, courier.vehicle_plate].filter(Boolean).join(" · ") ||
                      courier.vehicle_type ||
                      "Entrega APOIS"}
                  </p>
                  {courier.review_count > 0 && (
                    <p className="mt-1 text-[10px] text-primary">★ {Number(courier.rating).toFixed(1)}</p>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {order.deliveryPin && order.status !== "delivered" && (
          <section className="rounded-2xl border border-primary/30 bg-primary/10 p-5 text-center">
            <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-primary" />
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">PIN da entrega</p>
            <p className="my-2 font-mono text-4xl font-black tracking-[0.35em] text-primary">
              {order.deliveryPin}
            </p>
            <p className="text-xs text-zinc-500">Informe este código ao entregador somente no momento da entrega.</p>
          </section>
        )}

        {order.status === "delivered" && !order.review && (
          <button
            onClick={() => void navigate({ to: `/pedido/${orderId}/avaliar` })}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 py-4 font-bold text-primary"
          >
            <Star className="h-5 w-5 fill-primary" />
            Avaliar pedido
          </button>
        )}

        {order.review && (
          <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
            <p className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-500">Sua avaliação</p>
            <div className="flex items-center gap-2 text-primary">
              <Star className="h-4 w-4 fill-current" />
              <span className="font-bold">Estabelecimento: {order.review.merchant_rating ?? "—"}/5</span>
            </div>
            {order.review.courier_rating && (
              <div className="mt-1 flex items-center gap-2 text-primary">
                <Bike className="h-4 w-4" />
                <span className="font-bold">Entrega: {order.review.courier_rating}/5</span>
              </div>
            )}
            {order.review.comment && <p className="mt-3 text-sm text-zinc-400">{order.review.comment}</p>}
          </section>
        )}

        <section className="space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-500">Resumo do pedido</h3>
          </div>
          <div className="space-y-3">
            {order.order_items.map((item) => (
              <div key={item.id} className="space-y-1">
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-zinc-300">
                    {item.quantity}x {item.product_name}
                  </span>
                  <span className="shrink-0 font-bold">{money(item.line_total)}</span>
                </div>
                {item.selected_options.length > 0 && (
                  <p className="text-[10px] text-zinc-500">
                    {item.selected_options.map((option) => option.optionName).join(" • ")}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-zinc-900 pt-3">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Subtotal</span>
              <span>{money(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Taxa de entrega</span>
              <span>{money(order.delivery_fee)}</span>
            </div>
            {order.service_fee > 0 && (
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Taxa de serviço</span>
                <span>{money(order.service_fee)}</span>
              </div>
            )}
            {order.discount > 0 && (
              <div className="flex justify-between text-xs text-primary">
                <span>Desconto</span>
                <span>- {money(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 text-lg font-black text-primary">
              <span>Total</span>
              <span>{money(order.total)}</span>
            </div>
          </div>
        </section>

        {order.observation && (
          <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
            <p className="mb-1 text-xs font-bold uppercase text-zinc-500">Observação</p>
            <p className="text-sm text-zinc-400">{order.observation}</p>
          </section>
        )}

        <section className="flex gap-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-900">
            <MapPin className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-zinc-500">Endereço de entrega</p>
            <p className="mt-0.5 text-sm font-bold">{address.firstLine}</p>
            <p className="text-[11px] text-zinc-500">{address.secondLine}</p>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-4">
          <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
            <p className="mb-1 text-[10px] font-bold uppercase text-zinc-500">Pagamento</p>
            <p className="text-sm font-bold uppercase">{order.payment_method}</p>
            <p className="mt-1 text-[10px] text-zinc-500">
              {PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status}
            </p>
          </section>
          <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
            <p className="mb-1 text-[10px] font-bold uppercase text-zinc-500">Data</p>
            <p className="text-sm font-bold">{new Date(order.created_at).toLocaleDateString("pt-BR")}</p>
            <p className="mt-1 text-[10px] text-zinc-500">
              {new Date(order.created_at).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </section>
        </div>

        {order.cancelled_at && (
          <section className="rounded-2xl border border-red-950 bg-red-950/20 p-4">
            <p className="text-xs font-black uppercase tracking-wider text-red-400">Pedido cancelado</p>
            {order.cancellation_reason && (
              <p className="mt-2 text-sm text-zinc-400">Motivo: {order.cancellation_reason}</p>
            )}
          </section>
        )}

        {canCancel && !showCancel && (
          <button
            type="button"
            onClick={() => setShowCancel(true)}
            className="w-full rounded-xl border border-red-950 py-3 text-sm font-bold text-red-400"
          >
            Cancelar pedido
          </button>
        )}

        {canCancel && showCancel && (
          <section className="space-y-3 rounded-2xl border border-red-950 bg-red-950/10 p-4">
            <div>
              <p className="font-bold">Cancelar pedido</p>
              <p className="mt-1 text-xs text-zinc-500">
                O cancelamento só será aceito enquanto o pedido ainda estiver em uma etapa permitida pelo servidor.
              </p>
            </div>
            <textarea
              value={cancelReason}
              maxLength={500}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Informe o motivo"
              className="h-24 w-full rounded-xl border border-zinc-800 bg-black p-3 text-sm outline-none focus:border-red-900"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCancel(false);
                  setCancelReason("");
                }}
                disabled={cancelling}
                className="flex-1 rounded-xl bg-zinc-900 py-3 text-sm font-bold"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => void handleCancel()}
                disabled={cancelling || cancelReason.trim().length < 3}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar
              </button>
            </div>
          </section>
        )}

        <section className="flex items-center gap-3 rounded-xl bg-zinc-950 px-4 py-3 text-xs text-zinc-600">
          <Store className="h-4 w-4 shrink-0" />
          <span>Dados atualizados pelo estabelecimento, entregador e sistema APOIS em tempo real.</span>
        </section>
      </main>
    </div>
  );
}
