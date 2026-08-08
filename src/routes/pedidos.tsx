import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { AppBottomNav } from "@/components/AppBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { getLocalOrders, LocalOrder } from "@/lib/local-orders";

export const Route = createFileRoute("/pedidos")({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession();
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
});

function PedidosPage() {
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const [orders, setOrders] = useState<LocalOrder[]>([]);

  useEffect(() => {
    const fetchOrders = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const savedOrders = getLocalOrders(user.id);
      setOrders(savedOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    };
    
    fetchOrders();
  }, []);

  return (
    <div className="flex h-screen w-full flex-col bg-black text-white overflow-hidden relative">
      <header className="sticky top-0 z-50 flex items-center justify-between p-4 bg-black/80 backdrop-blur-lg border-b border-zinc-900">
        <button onClick={() => navigate({ to: "/inicio" })} className="p-2 rounded-full bg-zinc-900"><ArrowLeft /></button>
        <h1 className="text-xl font-bold">Meus Pedidos</h1>
        <button onClick={() => navigate({ to: "/sacola" })} className="relative p-2 rounded-full bg-zinc-900">
          <ShoppingBag />
          {totalItems > 0 && <span className="absolute -top-1 -right-1 bg-primary text-black text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">{totalItems}</span>}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-24 scrollbar-none space-y-4">
        {orders.length > 0 ? (
          orders.map((order: any) => (
            <button 
              key={order.id}
              onClick={() => navigate({ to: `/pedido/${order.id}` })}
              className="w-full flex items-center gap-4 bg-zinc-950 border border-zinc-900 p-4 rounded-2xl active:scale-[0.98] transition-transform text-left"
            >
              <img src={order.merchant.logo} className="w-12 h-12 rounded-xl object-cover ring-1 ring-white/10" alt="" />
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-white leading-tight">{order.merchant.name}</h3>
                  <span className="text-[10px] font-black uppercase text-primary bg-primary/10 px-2 py-0.5 rounded-full ring-1 ring-primary/20">
                    {order.status}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Pedido {order.id} • {new Date(order.createdAt).toLocaleDateString('pt-BR')}
                </p>
                <p className="text-sm font-bold text-white mt-1">
                  R$ {order.total.toFixed(2).replace('.', ',')}
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
