import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, MapPin, CheckCircle2, Bike, PackageCheck, UtensilsCrossed, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalOrderById, LocalOrder } from "@/lib/local-orders";

export const Route = createFileRoute("/pedido/$orderId/")({
  component: OrderDetailsPage,
});

function OrderDetailsPage() {
  const navigate = useNavigate();
  const { orderId } = useParams({ from: "/pedido/$orderId/" });
  const [order, setOrder] = useState<LocalOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrder = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      
      const foundOrder = getLocalOrderById(user.id, orderId);
      if (foundOrder) setOrder(foundOrder);
      setLoading(false);
    };
    
    fetchOrder();
  }, [orderId]);

  if (loading) return (
    <div className="flex h-screen w-full items-center justify-center bg-black">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
    </div>
  );

  if (!order) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-black p-6 text-center text-white">
        <h2 className="text-xl font-bold mb-4">Pedido não encontrado</h2>
        <button 
          onClick={() => navigate({ to: "/pedidos" })}
          className="bg-primary text-black px-6 py-3 rounded-xl font-bold uppercase shadow-lg shadow-primary/20 active:scale-95 transition-transform"
        >
          Voltar para Meus Pedidos
        </button>
      </div>
    );
  }

  const getStatusStep = (status: string) => {
    const states = ['confirmado', 'preparando', 'pronto', 'saiu_para_entrega', 'entregue'];
    return states.indexOf(status);
  };

  const currentStepIdx = getStatusStep(order.status || 'confirmado');

  const steps = [
    { label: "Pedido confirmado", icon: CheckCircle2, status: currentStepIdx >= 0 ? (currentStepIdx === 0 ? "current" : "completed") : "pending" },
    { label: "Estabelecimento preparando", icon: UtensilsCrossed, status: currentStepIdx >= 1 ? (currentStepIdx === 1 ? "current" : "completed") : "pending" },
    { label: "Pedido pronto", icon: PackageCheck, status: currentStepIdx >= 2 ? (currentStepIdx === 2 ? "current" : "completed") : "pending" },
    { label: "Saiu para entrega", icon: Bike, status: currentStepIdx >= 3 ? (currentStepIdx === 3 ? "current" : "completed") : "pending" },
    { label: "Entregue", icon: CheckCircle2, status: currentStepIdx >= 4 ? (currentStepIdx === 4 ? "current" : "completed") : "pending" },
  ];

  return (
    <div className="flex h-screen w-full flex-col bg-black text-white overflow-hidden">
      <header className="sticky top-0 z-50 flex items-center gap-4 bg-black/80 p-4 backdrop-blur-lg border-b border-zinc-900">
        <button onClick={() => navigate({ to: "/pedidos" })} className="p-2 rounded-full bg-zinc-900"><ArrowLeft /></button>
        <div>
          <h1 className="text-lg font-bold">Pedido {order.id}</h1>
          <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">{order.merchant.name}</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6 pb-20">
        {/* Status Timeline */}
        <section className="bg-zinc-950 p-6 rounded-2xl border border-zinc-900">
          <div className="space-y-6">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div key={idx} className="flex gap-4 relative">
                  {idx !== steps.length - 1 && (
                    <div className={`absolute left-4 top-8 w-[2px] h-10 ${step.status === 'completed' ? 'bg-primary' : 'bg-zinc-800'}`} />
                  )}
                  <div className={`grid h-8 w-8 place-items-center rounded-full ring-2 ring-black shrink-0 ${step.status === 'completed' ? 'bg-primary text-black' : step.status === 'current' ? 'bg-zinc-800 text-primary ring-primary/20' : 'bg-zinc-900 text-zinc-700'}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 pt-1">
                    <p className={`text-sm font-bold ${step.status === 'pending' ? 'text-zinc-700' : 'text-white'}`}>{step.label}</p>
                    {step.status === 'current' && <p className="text-[10px] text-primary font-bold animate-pulse">EM ANDAMENTO</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Action Button for Delivery */}
        {order.status === 'entregue' && !order.rating && (
          <button 
            onClick={() => navigate({ to: `/pedido/${orderId}/avaliar` })}
            className="w-full bg-primary/10 border border-primary/20 text-primary py-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/5 active:scale-95 transition-transform"
          >
            <Star className="h-5 w-5 fill-primary" />
            Avaliar pedido
          </button>
        )}

        {/* Order Details */}
        <section className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900 space-y-4">
          <h3 className="text-sm font-black uppercase text-zinc-500 tracking-wider">Resumo do pedido</h3>
          <div className="space-y-3">
            {order.items.map((i) => (
              <div key={i.lineId} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-300">{i.quantity}x {i.name}</span>
                  <span className="font-bold">R$ {(i.price * i.quantity).toFixed(2).replace('.', ',')}</span>
                </div>
                {i.selectedOptions.length > 0 && (
                  <p className="text-[10px] text-zinc-500">
                    {i.selectedOptions.map(opt => opt.optionName).join(' • ')}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="pt-3 border-t border-zinc-900 space-y-2">
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Subtotal</span>
              <span>R$ {order.subtotal.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Taxa de entrega</span>
              <span>R$ {order.deliveryFee.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between font-black text-primary text-lg pt-2">
              <span>Total</span>
              <span>R$ {order.total.toFixed(2).replace('.', ',')}</span>
            </div>
          </div>
        </section>

        {order.observation && (
          <section className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900">
            <p className="text-xs font-bold text-zinc-500 uppercase mb-1">Observação</p>
            <p className="text-sm text-zinc-400 italic">"{order.observation}"</p>
          </section>
        )}

        {/* Delivery Address */}
        <section className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900 flex gap-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-900 shrink-0"><MapPin className="h-5 w-5 text-primary" /></div>
          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase">Endereço de entrega</p>
            <p className="text-sm font-bold mt-0.5">{order.address.street}, {order.address.number}</p>
            <p className="text-[11px] text-zinc-500">{order.address.label} • {order.address.neighborhood}</p>
          </div>
        </section>

        {/* Payment and Meta */}
        <div className="grid grid-cols-2 gap-4">
           <section className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900">
              <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Pagamento</p>
              <p className="text-sm font-bold uppercase">{order.paymentMethod}</p>
           </section>
           <section className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900">
              <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">Data</p>
              <p className="text-sm font-bold">{new Date(order.createdAt).toLocaleDateString('pt-BR')}</p>
           </section>
        </div>
      </main>
    </div>
  );
}
