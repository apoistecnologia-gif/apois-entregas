import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ShoppingBag, Loader2, RefreshCw } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { AppBottomNav } from "@/components/AppBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

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
    <div className="flex h-screen w-full flex-col bg-black text-white overflow-hidden relative">
      <header className="sticky top-0 z-50 flex items-center justify-between p-4 bg-black/80 backdrop-blur-lg border-b border-zinc-900">
        <button
          onClick={() => navigate({ to: "/inicio" })}
          className="p-2 rounded-full bg-zinc-900"
        >
          <ArrowLeft />
        </button>
        <h1 className="text-xl font-bold">Meus Pedidos</h1>
        <button
          onClick={() => navigate({ to: "/sacola" })}
          className="relative p-2 rounded-full bg-zinc-900"
        >
          <ShoppingBag />
          {totalItems > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-black text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
              {totalItems}
            </span>
          )}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-24 scrollbar-none space-y-4">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : loadError ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-20">
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag className="w-8 h-8 text-zinc-600" />
            </div>
            <h2 className="text-lg font-bold">Não foi possível carregar seus pedidos</h2>
            <p className="text-zinc-500 text-sm mt-2 max-w-xs">{loadError}</p>
            <button
              type="button"
              onClick={() => void fetchOrders()}
              className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-black uppercase text-black active:scale-95 transition-transform"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </button>
          </div>
        ) : orders.length > 0 ? (
          orders.map((order) => (
            <button
              key={order.id}
              onClick={() => navigate({ to: `/pedido/${order.id}` })}
              className="w-full flex items-center gap-4 bg-zinc-950 border border-zinc-900 p-4 rounded-2xl active:scale-[0.98] transition-transform text-left"
            >
              <img
                src={
                  order.merchants?.logo_url ||
                  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c"
                }
                className="w-12 h-12 rounded-xl object-cover ring-1 ring-white/10"
                alt=""
              />
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-white leading-tight">
                    {order.merchants?.name || "Estabelecimento"}
                  </h3>
                  <span className="text-[10px] font-black uppercase text-primary bg-primary/10 px-2 py-0.5 rounded-full ring-1 ring-primary/20">
                    {orderStatusLabel(order.status, order.fulfillment_type)}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Pedido #{order.order_number} •{" "}
                  {order.fulfillment_type === "pickup" ? "Retirada" : "Entrega"} •{" "}
                  {new Date(order.created_at).toLocaleDateString("pt-BR")}
                </p>
                <p className="text-sm font-bold text-white mt-1">
                  R$ {Number(order.total).toFixed(2).replace(".", ",")}
                </p>
              </div>
            </button>
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center py-20">
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag className="w-8 h-8 text-zinc-600" />
            </div>
            <h2 className="text-lg font-bold">Nenhum pedido recente</h2>
            <p className="text-zinc-500 text-sm mt-2">Você ainda não realizou pedidos conosco.</p>
          </div>
        )}
      </main>
      <AppBottomNav activeTab="pedidos" />
    </div>
  );
}
