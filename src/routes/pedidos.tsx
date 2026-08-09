import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ShoppingBag, Loader2, RefreshCw } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { AppBottomNav } from "@/components/AppBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/pedidos")({
  // Customer auth is persisted by Supabase in browser storage. Disable SSR for this
  // protected route so a hard reload cannot evaluate the guard without that session.
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

function PedidosPage() {
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    setLoadError(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("Erro ao identificar cliente para carregar pedidos:", userError);
      setOrders([]);
      setLoadError("Não foi possível identificar sua sessão. Tente novamente.");
      setLoading(false);
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

    setLoading(false);
  };

  useEffect(() => {
    void fetchOrders();
  }, []);

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-zinc-900 bg-black/80 p-4 backdrop-blur-lg">
        <button
          onClick={() => navigate({ to: "/inicio" })}
          className="rounded-full bg-zinc-900 p-2"
        >
          <ArrowLeft />
        </button>
        <h1 className="text-xl font-bold">Meus Pedidos</h1>
        <button
          onClick={() => navigate({ to: "/sacola" })}
          className="relative rounded-full bg-zinc-900 p-2"
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
              onClick={() => navigate({ to: "/pedido/$orderId", params: { orderId: order.id } })}
              className="w-full rounded-2xl border border-zinc-900 bg-zinc-950 p-4 text-left transition-colors hover:bg-zinc-900"
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <p className="text-sm font-black">Pedido #{order.order_number}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {order.merchants?.name || "Estabelecimento"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                    order.status === "delivered"
                      ? "bg-green-500/10 text-green-400"
                      : order.status === "cancelled"
                        ? "bg-red-500/10 text-red-400"
                        : "bg-primary/10 text-primary"
                  }`}
                >
                  {order.status === "delivered"
                    ? "Entregue"
                    : order.status === "cancelled"
                      ? "Cancelado"
                      : order.status === "refunded"
                        ? "Estornado"
                        : "Em andamento"}
                </span>
              </div>
              <div className="flex items-end justify-between border-t border-zinc-900 pt-3">
                <div>
                  <p className="text-[10px] uppercase text-zinc-600">Pagamento</p>
                  <p className="text-xs font-bold uppercase text-zinc-400">{order.payment_status}</p>
                </div>
                <p className="font-black text-primary">
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
            <p className="mt-2 max-w-xs text-sm text-zinc-500">
              Seus pedidos aparecerão aqui depois que você finalizar uma compra.
            </p>
          </div>
        )}
      </main>

      <AppBottomNav />
    </div>
  );
}
