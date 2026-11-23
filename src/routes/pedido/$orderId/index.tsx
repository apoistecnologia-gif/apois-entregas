import { createFileRoute, redirect, useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  KeyRound,
  Loader2,
  MapPin,
  PackageCheck,
  Star,
  Store,
  Tag,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CustomerDeliveryMap } from "@/components/CustomerDeliveryMap";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePromptDialog } from "@/components/ui/prompt-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/pedido/$orderId/")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
    return { session };
  },
  component: OrderDetailsPage,
  head: () => ({ meta: [{ title: "Detalhes do Pedido | APOIS ENTREGA" }] }),
});

const money = (value: unknown) =>
  `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;

function OrderDetailsPage() {
  const navigate = useNavigate();
  const { orderId } = useParams({ from: "/pedido/$orderId/" });
  const [order, setOrder] = useState<any | null>(null);
  const [deliveryJob, setDeliveryJob] = useState<any | null>(null);
  const [pickupPin, setPickupPin] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const { confirm, confirmDialog } = useConfirmDialog();
  const { prompt, promptDialog } = usePromptDialog();

  const fetchOrder = useCallback(async () => {
    const orderResult = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();

    if (orderResult.error || !orderResult.data) {
      console.warn(
        "customer order lookup failed",
        orderResult.error?.code,
        orderResult.error?.message,
      );
      toast.error("Não foi possível carregar os detalhes deste pedido.");
      setOrder(null);
      setDeliveryJob(null);
      setPickupPin(null);
      setLoading(false);
      return;
    }

    const baseOrder: any = orderResult.data;
    const [merchantResult, itemsResult] = await Promise.all([
      supabase.from("merchants").select("*").eq("id", baseOrder.merchant_id).maybeSingle(),
      supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
    ]);
    if (merchantResult.error)
      console.warn("customer merchant relation lookup failed", merchantResult.error.code);
    if (itemsResult.error)
      console.warn("customer order items lookup failed", itemsResult.error.code);

    const nextOrder: any = {
      ...baseOrder,
      merchants: merchantResult.data ?? null,
      order_items: itemsResult.data ?? [],
    };
    setOrder(nextOrder);

    if (nextOrder.fulfillment_type === "delivery") {
      const { data: jobData, error } = await (supabase.from as any)("delivery_jobs")
        .select("id,courier_id,status,delivery_latitude,delivery_longitude")
        .eq("order_id", orderId)
        .maybeSingle();
      if (error) console.warn("Não foi possível carregar o rastreamento da entrega:", error.code);
      setDeliveryJob(jobData ?? null);

      if (jobData?.status === "arrived_destination") {
        const { data: secretData, error: secretError } = await (supabase.from as any)(
          "delivery_confirmation_secrets",
        )
          .select("pin_code,locked_until")
          .eq("order_id", orderId)
          .maybeSingle();
        if (secretError) console.warn("PIN de entrega indisponível:", secretError.code);
        setPickupPin(secretData?.pin_code ?? null);
      } else {
        setPickupPin(null);
      }
    } else {
      const { data, error } = await (supabase.from as any)("delivery_confirmation_secrets")
        .select("pin_code,locked_until")
        .eq("order_id", orderId)
        .maybeSingle();
      if (error) console.warn("PIN de retirada indisponível:", error.code);
      setPickupPin(data?.pin_code ?? null);
      setDeliveryJob(null);
    }

    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    void fetchOrder();
    const orderChannel = supabase
      .channel(`order_status_${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => void fetchOrder(),
      )
      .subscribe();
    const deliveryChannel = supabase
      .channel(`order_delivery_${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_jobs", filter: `order_id=eq.${orderId}` },
        () => void fetchOrder(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(orderChannel);
      void supabase.removeChannel(deliveryChannel);
    };
  }, [fetchOrder, orderId]);

  const cancelOrder = async () => {
    if (!order || cancelling) return;
    const values = await prompt({
      title: "Cancelar pedido",
      description: "Por que você deseja cancelar este pedido?",
      fields: [
        {
          key: "reason",
          label: "Motivo",
          type: "textarea",
          required: true,
          maxLength: 300,
        },
      ],
      confirmLabel: "Continuar",
      destructive: true,
    });
    const reason = values?.["reason"]?.trim();
    if (!reason) return;
    const ok = await confirm({
      title: "Confirmar cancelamento",
      description:
        "Confirma o cancelamento? Depois de cancelado, o pedido não seguirá para preparo ou recebimento.",
      confirmLabel: "Confirmar cancelamento",
      destructive: true,
    });
    if (!ok) return;

    setCancelling(true);
    try {
      const { data, error } = await supabase.rpc("customer_cancel_order", {
        _order_id: order.id,
        _reason: reason,
      });
      if (error) throw error;
      const refundId = (data as any)?.refund_id ?? null;
      if (refundId) {
        const { error: refundError } = await supabase.functions.invoke("process-superapp-refund", {
          body: { refundId },
        });
        if (refundError)
          toast.warning(
            "Pedido cancelado. O estorno foi registrado e continuará pendente para nova tentativa.",
          );
        else toast.success("Pedido cancelado e estorno processado.");
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

  const deliverySteps = useMemo(() => {
    if (!order) return [];
    const stepIndex = (() => {
      switch (order.status) {
        case "confirmed":
        case "accepted":
          return 0;
        case "preparing":
          return 1;
        case "ready":
        case "searching_driver":
        case "driver_assigned":
        case "driver_arriving_store":
          return 2;
        case "picked_up":
        case "out_for_delivery":
        case "on_the_way":
          return 3;
        case "delivered":
          return 4;
        default:
          return -1;
      }
    })();
    const status = (index: number) => {
      if (stepIndex < 0) return "pending";
      if (order.status === "delivered" && index <= stepIndex) return "completed";
      if (index < stepIndex) return "completed";
      if (index === stepIndex) return "current";
      return "pending";
    };
    return [
      { label: "Pedido confirmado", icon: CheckCircle2, status: status(0) },
      { label: "Estabelecimento preparando", icon: UtensilsCrossed, status: status(1) },
      { label: "Pedido pronto", icon: PackageCheck, status: status(2) },
      { label: "Saiu para entrega", icon: Bike, status: status(3) },
      { label: "Entregue", icon: CheckCircle2, status: status(4) },
    ];
  }, [order]);

  const pickupSteps = useMemo(() => {
    if (!order) return [];
    const stepIndex = (() => {
      switch (order.status) {
        case "confirmed":
        case "accepted":
          return 0;
        case "preparing":
          return 1;
        case "ready":
        case "ready_for_pickup":
          return 2;
        case "delivered":
          return 3;
        default:
          return -1;
      }
    })();
    const status = (index: number) => {
      if (stepIndex < 0) return "pending";
      if (order.status === "delivered" && index <= stepIndex) return "completed";
      if (index < stepIndex) return "completed";
      if (index === stepIndex) return "current";
      return "pending";
    };
    return [
      { label: "Pedido confirmado", icon: CheckCircle2, status: status(0) },
      { label: "Estabelecimento preparando", icon: UtensilsCrossed, status: status(1) },
      { label: "Pronto para retirada", icon: PackageCheck, status: status(2) },
      { label: "Pedido retirado", icon: CheckCircle2, status: status(3) },
    ];
  }, [order]);

  if (loading)
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  if (!order) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-black p-6 text-center text-white">
        <h2 className="mb-4 text-xl font-bold">Pedido não encontrado</h2>
        <button
          type="button"
          onClick={() => navigate({ to: "/pedidos" })}
          className="rounded-xl bg-primary px-6 py-3 font-bold uppercase text-black shadow-lg shadow-primary/20 transition-transform active:scale-95"
        >
          Voltar para Meus Pedidos
        </button>
      </div>
    );
  }

  const isPickup = order.fulfillment_type === "pickup";
  const steps = isPickup ? pickupSteps : deliverySteps;
  const isCancelled = order.status === "cancelled";
  const isRefunded = order.status === "refunded" || order.payment_status === "refunded";
  const canCancel = ["created", "pending_payment", "paid", "confirmed"].includes(order.status);
  const pickupReady = isPickup && ["ready", "ready_for_pickup"].includes(order.status);

  let deliveryAddress: any = order.delivery_address;
  if (typeof deliveryAddress === "string") {
    try {
      deliveryAddress = JSON.parse(deliveryAddress);
    } catch {
      deliveryAddress = {};
    }
  }

  const merchantAddress = [
    order.merchants?.address_line,
    order.merchants?.neighborhood,
    [order.merchants?.city, order.merchants?.state].filter(Boolean).join(" - "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-black text-white">
        <header className="sticky top-0 z-50 flex items-center gap-4 border-b border-zinc-900 bg-black/80 p-4 backdrop-blur-lg">
          <button
            type="button"
            onClick={() => navigate({ to: "/pedidos" })}
            className="rounded-full bg-zinc-900 p-2"
            aria-label="Voltar para meus pedidos"
          >
            <ArrowLeft />
          </button>
          <div>
            <h1 className="text-lg font-bold">Pedido #{order.order_number}</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              {order.merchants?.name}
            </p>
          </div>
        </header>

        <main className="flex-1 space-y-6 overflow-y-auto p-4 pb-20">
          {isCancelled || isRefunded ? (
            <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-sm font-black uppercase text-zinc-300">
                {isRefunded ? "Pedido reembolsado" : "Pedido cancelado"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {isRefunded
                  ? "O pagamento deste pedido foi reembolsado."
                  : order.payment_status === "paid"
                    ? "O pedido foi cancelado. Se houver estorno pendente, ele será conciliado pelo sistema."
                    : "Este pedido foi cancelado e não seguirá para recebimento."}
              </p>
            </section>
          ) : (
            <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-6">
              <div className="space-y-6">
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.label} className="relative flex gap-4">
                      {index !== steps.length - 1 ? (
                        <div
                          className={`absolute left-4 top-8 h-10 w-[2px] ${step.status === "completed" ? "bg-primary" : "bg-zinc-800"}`}
                        />
                      ) : null}
                      <div
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ring-2 ring-black ${step.status === "completed" ? "bg-primary text-black" : step.status === "current" ? "bg-zinc-800 text-primary ring-primary/20" : "bg-zinc-900 text-zinc-700"}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 pt-1">
                        <p
                          className={`text-sm font-bold ${step.status === "pending" ? "text-zinc-700" : "text-white"}`}
                        >
                          {step.label}
                        </p>
                        {step.status === "current" ? (
                          <p className="animate-pulse text-[10px] font-bold text-primary">
                            EM ANDAMENTO
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {!isPickup && !isCancelled && !isRefunded ? (
            <CustomerDeliveryMap job={deliveryJob} />
          ) : null}

          {!isPickup && deliveryJob?.status === "arrived_destination" ? (
            <section className="rounded-3xl border border-primary/30 bg-primary/5 p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-black">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-primary">
                    Entregador chegou
                  </p>
                  <h2 className="mt-1 text-lg font-black">Informe este PIN ao entregador</h2>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    Só informe o código quando estiver com o pedido em mãos. Ele confirma a
                    conclusão da entrega.
                  </p>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-zinc-800 bg-black p-5 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">
                  Código de entrega
                </p>
                <p className="mt-2 text-4xl font-black tracking-[0.35em] text-primary">
                  {pickupPin ?? "••••"}
                </p>
                {!pickupPin ? (
                  <p className="mt-2 text-xs text-zinc-500">Atualizando seu PIN com segurança...</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {pickupReady ? (
            <section className="rounded-3xl border border-primary/30 bg-primary/5 p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-black">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-primary">
                    Pronto para retirada
                  </p>
                  <h2 className="mt-1 text-lg font-black">Mostre este PIN no estabelecimento</h2>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    Só informe o código quando estiver retirando o pedido. O estabelecimento usa o
                    PIN para concluir a entrega com segurança.
                  </p>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border border-zinc-800 bg-black p-5 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">
                  Código de retirada
                </p>
                <p className="mt-2 text-4xl font-black tracking-[0.35em] text-primary">
                  {pickupPin ?? "••••"}
                </p>
                {!pickupPin ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    Atualizando o código de retirada. Tente novamente em alguns instantes.
                  </p>
                ) : null}
              </div>
              <div className="mt-4 flex gap-3 rounded-2xl border border-zinc-900 bg-black p-4">
                <Store className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-bold">{order.merchants?.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    {merchantAddress || "Consulte o estabelecimento no app antes de se deslocar."}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {canCancel ? (
            <button
              type="button"
              disabled={cancelling}
              onClick={cancelOrder}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 py-4 font-bold text-red-400 disabled:opacity-50"
            >
              {cancelling ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              {cancelling ? "Cancelando..." : "Cancelar pedido"}
            </button>
          ) : null}

          {order.status === "delivered" ? (
            <button
              type="button"
              onClick={() => navigate({ to: `/pedido/${orderId}/avaliar` })}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/10 py-4 font-bold text-primary shadow-lg shadow-primary/5 transition-transform active:scale-95"
            >
              <Star className="h-5 w-5 fill-primary" />
              Avaliar pedido
            </button>
          ) : null}

          <section className="space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-500">
              Resumo do pedido
            </h3>
            <div className="space-y-3">
              {order.order_items?.map((item: any) => (
                <div key={item.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-300">
                      {item.quantity}x {item.product_name}
                    </span>
                    <span className="font-bold">{money(item.line_total)}</span>
                  </div>
                  {item.selected_options ? (
                    <p className="text-[10px] text-zinc-500">
                      {Array.isArray(item.selected_options)
                        ? item.selected_options.map((option: any) => option.optionName).join(" • ")
                        : typeof item.selected_options === "object"
                          ? Object.values(item.selected_options)
                              .map((option: any) => option.optionName)
                              .join(" • ")
                          : ""}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t border-zinc-900 pt-3">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Subtotal</span>
                <span>{money(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-zinc-500">
                <span>{isPickup ? "Retirada" : "Taxa de entrega"}</span>
                <span>{money(order.delivery_fee)}</span>
              </div>
              {Number(order.discount ?? 0) > 0 ? (
                <div className="flex justify-between text-xs text-emerald-400">
                  <span className="flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" /> Desconto
                  </span>
                  <span>- {money(order.discount)}</span>
                </div>
              ) : null}
              <div className="mt-2 flex justify-between border-t border-zinc-900 pt-3 text-lg font-black text-primary">
                <span>Total</span>
                <span>{money(order.total)}</span>
              </div>
            </div>
          </section>

          <section className="flex gap-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-900">
              {isPickup ? (
                <Store className="h-5 w-5 text-primary" />
              ) : (
                <MapPin className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-zinc-500">
                {isPickup ? "Local de retirada" : "Endereço de entrega"}
              </p>
              {isPickup ? (
                <>
                  <p className="mt-0.5 text-sm font-bold">{order.merchants?.name}</p>
                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    {merchantAddress || "Endereço do estabelecimento não informado."}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-0.5 text-sm font-bold">
                    {deliveryAddress?.street || "—"}, {deliveryAddress?.number || "s/n"}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {deliveryAddress?.label ? `${deliveryAddress.label} • ` : ""}
                    {deliveryAddress?.neighborhood || ""}
                  </p>
                </>
              )}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-4">
            <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
              <p className="mb-1 text-[10px] font-bold uppercase text-zinc-500">Pagamento</p>
              <p className="text-sm font-bold uppercase">
                {order.payment_method} · {order.payment_status}
              </p>
            </section>
            <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
              <p className="mb-1 text-[10px] font-bold uppercase text-zinc-500">Data</p>
              <p className="text-sm font-bold">
                {new Date(order.created_at).toLocaleDateString("pt-BR")}
              </p>
            </section>
          </div>
        </main>
      </div>
      {confirmDialog}
      {promptDialog}
    </>
  );
}
