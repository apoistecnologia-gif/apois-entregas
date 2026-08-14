import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ShoppingBag, Loader2, RefreshCw } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { AppBottomNav } from "@/components/AppBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useEffect, useState } from "react";

export const Route = createFileRoute("/pedidos")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
    return { session };
  },
  component: PedidosPage,
  head: () => ({
    meta: [{ title: "Meus Pedidos | APOIS ENTREGA" }],
  }),
});

const statusLabels: Record<string, string> = {
  created: "Criado",
  pending_payment: "Aguardando pagamento",
  paid: "Pagamento confirmado",
  confirmed: "Confirmado",
  accepted: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  ready_for_pickup: "Pronto para retirada",
  searching_driver: "Buscando entregador",
  driver_assigned: "Entregador encontrado",
  driver_arriving_store: "Entregador indo à loja",
  picked_up: "Pedido coletado",
  out_for_delivery: "Saiu para entrega",
  on_the_way: "A caminho",
  delivered: "Concluído",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

function orderStatusLabel(status: string, fulfillmentType: string | null | undefined) {
  if (status === "delivered" && fulfillmentType === "pickup") return "Retirado";
  return statusLabels[status] ?? status.replaceAll("_", " ");
}

function PedidosPage() {
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchOrders = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setLoadError(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("Erro ao identificar cliente para carregar pedidos:", userError);
      setOrders([]);
      setLoadError("Não foi possível identificar sua sessão. Tente novamente.");
      if (showLoading) setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("orders" as any)
      .select("*, merchants(name, logo_url)")
      .eq("customer_user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar pedidos reais:", error);
      setOrders([]);
      setLoadError("Não foi possível carregar seus pedidos agora.");
    } else {
      setOrders(data || []);
    }

    if (showLoading) setLoading(false);
  }, []);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribe = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || disposed) return;

      channel = supabase
        .channel(`customer-orders-list:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: `customer_user_id=eq.${user.id}`,
          },
          () => {
            void fetchOrders(false);
          },
        )
        .subscribe();
    };

    void subscribe();

    return () => {
      disposed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-zinc-900 bg-black/80 px-4 pb-4 pt-[max(env(safe-area-inset-top),1rem)] backdrop-blur-lg">
        <button
          type="button"
          onClick={() => navigate({ to: "/inicio" })}
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar ao início"
        >
          <ArrowLeft />
        </button>
        <h1 className="text-xl font-bold">Meus Pedidos</h1>
        <button
          type="button"
          onClick={() => navigate({ to: "/sacola" })}
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
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : loadError ? (
          <div className="flex h-full flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-zinc-900">
              <ShoppingBag className="h-8 w-8 text-zinc-600" />
            </div>
            <h2 className="text-lg font-bold">Não foi possível carregar seus pedidos</h2>
            <p className="mt-2 max-w-xs text-sm text-zinc-500">{loadError}</p>
            <button
              type="button"
              onClick={() => void fetchOrders()}
              className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-black uppercase text-black transition-transform active:scale-95"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </button>
          </div>
        ) : orders.length > 0 ? (
          orders.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => navigate({ to: `/pedido/${order.id}` })}
              className="flex w-full items-center gap-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-4 text-left transition-transform active:scale-[0.98]"
            >
              {order.merchants?.logo_url ? (
                <img
                  src={order.merchants.logo_url}
                  className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/10"
                  alt={order.merchants?.name || "Estabelecimento"}
                />
              ) : (
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-zinc-900 text-lg font-black text-primary ring-1 ring-white/10">
                  {order.merchants?.name?.charAt(0).toUpperCase() || "A"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate font-bold leading-tight text-white">
                    {order.merchants?.name || "Estabelecimento"}
                  </h3>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase text-primary ring-1 ring-primary/20">
                    {orderStatusLabel(order.status, order.fulfillment_type)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Pedido #{order.order_number} •{" "}
                  {order.fulfillment_type === "pickup" ? "Retirada" : "Entrega"} •{" "}
                  {new Date(order.created_at).toLocaleDateString("pt-BR")}
                </p>
                <p className="mt-1 text-sm font-bold text-white">
                  R$ {Number(order.total).toFixed(2).replace(".", ",")}
                </p>
              </div>
            </button>
          ))
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-zinc-900">
              <ShoppingBag className="h-8 w-8 text-zinc-600" />
            </div>
            <h2 className="text-lg font-bold">Nenhum pedido recente</h2>
            <p className="mt-2 text-sm text-zinc-500">Você ainda não realizou pedidos conosco.</p>
          </div>
        )}
      </main>
      <AppBottomNav activeTab="pedidos" />
    </div>
  );
}
