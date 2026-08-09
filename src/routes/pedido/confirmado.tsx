import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, ArrowRight, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const orderSearchSchema = z.object({
  orderId: z.string(),
});

type DeliveryAddressSnapshot = {
  street?: string | null;
  number?: string | null;
};

export const Route = createFileRoute("/pedido/confirmado")({
  ssr: false,
  validateSearch: orderSearchSchema,
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
  component: OrderConfirmedPage,
  head: () => ({
    meta: [{ title: "Pagamento do pedido | APOIS ENTREGA" }],
  }),
});

function OrderConfirmedPage() {
  const navigate = useNavigate();
  const { orderId } = Route.useSearch();
  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const fetchOrder = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (disposed) return;
      if (userError || !user) {
        setLoadError("Não foi possível identificar sua sessão.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("orders" as any)
        .select("id,order_number,status,payment_status,total,delivery_address,merchants(name)")
        .eq("id", orderId)
        .eq("customer_user_id", user.id)
        .maybeSingle();

      if (disposed) return;
      if (error || !data) {
        console.error("Erro ao carregar pedido real:", error);
        setLoadError("Não foi possível carregar este pedido.");
      } else {
        setOrder(data);
      }
      setLoading(false);
    };

    void fetchOrder();
    return () => {
      disposed = true;
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!order || loadError) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-black p-6 text-center text-white">
        <h2 className="mb-2 text-xl font-bold">Pedido não encontrado</h2>
        <p className="mb-5 text-sm text-zinc-500">{loadError || "Não encontramos este pedido."}</p>
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

  let deliveryAddress: DeliveryAddressSnapshot = {};
  if (typeof order.delivery_address === "string") {
    try {
      const parsed = JSON.parse(order.delivery_address);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        deliveryAddress = parsed as DeliveryAddressSnapshot;
      }
    } catch {
      deliveryAddress = {};
    }
  } else if (order.delivery_address && typeof order.delivery_address === "object") {
    deliveryAddress = order.delivery_address as DeliveryAddressSnapshot;
  }

  const isRefunded = order.status === "refunded" || order.payment_status === "refunded";
  const isCancelled = order.status === "cancelled";
  const isUnavailable = isRefunded || isCancelled;
  const fulfillmentStarted = [
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
    "delivered",
  ].includes(order.status);

  const title = isRefunded
    ? "Pagamento reembolsado"
    : isCancelled
      ? "Pedido cancelado"
      : "Pagamento confirmado ✓";
  const description = isRefunded
    ? "O pagamento deste pedido foi reembolsado. Consulte os detalhes para acompanhar o registro do estorno."
    : isCancelled
      ? "Este pedido foi cancelado e não seguirá para preparo ou entrega."
      : fulfillmentStarted
        ? "O pagamento foi confirmado e o pedido já avançou no fluxo do estabelecimento."
        : "O pagamento foi confirmado e o pedido foi registrado. Acompanhe a próxima atualização em Meus Pedidos.";

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-black p-6 text-center text-white">
      <div
        className={`mb-6 flex h-20 w-20 items-center justify-center rounded-full ${
          isUnavailable
            ? "bg-red-500/10 text-red-400"
            : "bg-primary/20 text-primary shadow-[0_0_30px_rgba(255,215,0,0.3)]"
        }`}
      >
        {isUnavailable ? <XCircle className="h-12 w-12" /> : <CheckCircle2 className="h-12 w-12" />}
      </div>

      <h1 className="mb-2 text-2xl font-black uppercase tracking-tight text-white">{title}</h1>
      <p className="mb-8 text-zinc-500">{description}</p>

      <div className="mb-10 w-full space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-6 text-left">
        <div className="flex justify-between border-b border-zinc-900 pb-3">
          <span className="text-xs font-bold uppercase text-zinc-500">Número</span>
          <span className="font-mono font-bold text-primary">#{order.order_number}</span>
        </div>
        <div className="flex justify-between border-b border-zinc-900 py-3">
          <span className="text-xs font-bold uppercase text-zinc-500">Estabelecimento</span>
          <span className="font-bold text-white">{order.merchants?.name || "Estabelecimento"}</span>
        </div>
        <div className="flex justify-between border-b border-zinc-900 py-3">
          <span className="text-xs font-bold uppercase text-zinc-500">Total</span>
          <span className="font-bold text-white">
            R$ {Number(order.total).toFixed(2).replace(".", ",")}
          </span>
        </div>
        <div className="flex justify-between border-b border-zinc-900 py-3">
          <span className="text-xs font-bold uppercase text-zinc-500">Pagamento</span>
          <span className="font-bold uppercase text-zinc-300">{order.payment_status}</span>
        </div>
        <div className="pt-3">
          <span className="text-xs font-bold uppercase text-zinc-500">Entrega</span>
          <p className="mt-1 line-clamp-1 text-sm font-medium text-zinc-400">
            {deliveryAddress.street
              ? `${deliveryAddress.street}, ${deliveryAddress.number || "s/n"}`
              : "Endereço registrado no pedido"}
          </p>
        </div>
      </div>

      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={() => navigate({ to: `/pedido/${orderId}` })}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-black uppercase text-black transition-transform active:scale-95"
        >
          Ver detalhes do pedido
          <ArrowRight className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/inicio" })}
          className="w-full py-3 text-sm font-bold uppercase text-zinc-500"
        >
          Voltar ao início
        </button>
      </div>
    </div>
  );
}
