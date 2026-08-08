import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, ShoppingBag, Store } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppBottomNav } from "@/components/AppBottomNav";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import {
  CustomerOrdersError,
  fetchCustomerOrders,
  type CustomerOrderListItem,
} from "@/lib/remote-orders";

export const Route = createFileRoute("/pedidos")({
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
  component: PedidosPage,
});

const STATUS_LABELS: Record<string, string> = {
  created: "Criado",
  pending_payment: "Aguardando PIX",
  paid: "Pago",
  confirmed: "Confirmado",
  accepted: "Aceito",
  preparing: "Preparando",
  ready: "Pronto",
  ready_for_pickup: "Pronto",
  searching_driver: "Buscando entregador",
  driver_assigned: "Entregador encontrado",
  driver_arriving_store: "Entregador a caminho",
  picked_up: "Coletado",
  out_for_delivery: "Saiu para entrega",
  on_the_way: "A caminho",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Estornado",
};

function money(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function PedidosPage() {
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const [orders, setOrders] = useState<CustomerOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const remoteOrders = await fetchCustomerOrders(100);
      setOrders(remoteOrders);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof CustomerOrdersError
          ? loadError.message
          : "Não foi possível carregar seus pedidos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const channel = supabase
      .channel("customer-orders-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void loadOrders();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadOrders]);

  const openOrder = (order: CustomerOrderListItem) => {
    const needsPix =
      order.payment_method === "pix" &&
      !["paid", "refunded"].includes(order.payment_status) &&
      !["cancelled", "refunded"].includes(order.status);

    if (needsPix) {
      void navigate({ to: "/pedido/confirmado", search: { orderId: order.id } });
      return;
    }
    void navigate({ to: `/pedido/${order.id}` });
  };

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-zinc-900 bg-black/80 p-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => void navigate({ to: "/inicio" })}
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar ao início"
        >
          <ArrowLeft />
        </button>
        <h1 className="text-xl font-bold">Meus Pedidos</h1>
        <button
          type="button"
          onClick={() => void navigate({ to: "/sacola" })}
          className="relative rounded-full bg-zinc-900 p-2"
          aria-label="Abrir sacola"
        >
          <ShoppingBag />
          {totalItems > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-black">
              {totalItems}
            </span>
          )}
        </button>
      </header>

      <main className="scrollbar-none flex-1 space-y-4 overflow-y-auto p-4 pb-24">
        {loading && (
          <div className="flex h-52 items-center justify-center text-primary">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-950 bg-red-950/20 p-5 text-center">
            <p className="text-sm text-red-200">{error}</p>
            <button
              type="button"
              onClick={() => void loadOrders()}
              className="mt-4 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-black"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!loading && !error && orders.length > 0 &&
          orders.map((order) => {
            const merchant = order.merchants;
            const needsPix =
              order.payment_method === "pix" &&
              !["paid", "refunded"].includes(order.payment_status) &&
              !["cancelled", "refunded"].includes(order.status);

            return (
              <button
                type="button"
                key={order.id}
                onClick={() => openOrder(order)}
                className="flex w-full items-center gap-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-4 text-left transition-transform active:scale-[0.98]"
              >
                {merchant?.logo_url ? (
                  <img
                    src={merchant.logo_url}
                    className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/10"
                    alt={merchant.name}
                  />
                ) : (
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-zinc-900 ring-1 ring-white/10">
                    <Store className="h-5 w-5 text-zinc-700" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate font-bold leading-tight">
                      {merchant?.name ?? "Estabelecimento"}
                    </h3>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase text-primary ring-1 ring-primary/20">
                      {needsPix ? "Pagar PIX" : STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Pedido #{order.order_number} · {new Date(order.created_at).toLocaleDateString("pt-BR")}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="text-sm font-bold">{money(order.total)}</p>
                    {needsPix && <p className="text-[10px] font-bold text-amber-400">Pagamento pendente</p>}
                  </div>
                </div>
              </button>
            );
          })}

        {!loading && !error && orders.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-zinc-900">
              <ShoppingBag className="h-8 w-8 text-zinc-600" />
            </div>
            <h2 className="text-lg font-bold">Nenhum pedido recente</h2>
            <p className="mt-2 text-sm text-zinc-500">Seus pedidos reais aparecerão aqui.</p>
          </div>
        )}
      </main>
      <AppBottomNav activeTab="pedidos" />
    </div>
  );
}
