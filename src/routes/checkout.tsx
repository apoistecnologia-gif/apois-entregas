import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MapPin, ChevronRight, CircleDollarSign, CreditCard, ShieldCheck } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/checkout")({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
    return { session };
  },
  component: CheckoutPage,
});

function CheckoutPage() {
  const navigate = useNavigate();
  const { items, merchant, totalPrice, clearCart } = useCart();
  const [address, setAddress] = useState<any>(null);
  const [observation, setObservation] = useState("");

  useEffect(() => {
    if (items.length === 0) {
      navigate({ to: "/sacola" });
    }
    fetchDefaultAddress();
  }, [items]);

  const fetchDefaultAddress = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await (supabase as any)
      .from('customer_addresses')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single();
    if (data) setAddress(data);
  };

  const subtotal = totalPrice;
  const deliveryFee = merchant?.deliveryFee || 0;
  const discount = 5.00;
  const total = subtotal + deliveryFee - discount;

  const handleConfirm = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const paymentMethod = sessionStorage.getItem('apois_payment_method') || 'pix';
    const orderId = `APOIS-${Math.floor(100000 + Math.random() * 900000)}`;
    const newOrder = {
      id: orderId,
      createdAt: new Date().toISOString(),
      merchant,
      items,
      subtotal,
      deliveryFee,
      discount,
      total,
      address,
      paymentMethod,
      observation,
      status: 'confirmado'
    };
    
    const ordersKey = `apois_orders_${user.id}`;
    const existingOrders = JSON.parse(localStorage.getItem(ordersKey) || '[]');
    localStorage.setItem(ordersKey, JSON.stringify([...existingOrders, newOrder]));
    
    clearCart();
    navigate({ to: "/pedido/confirmado", search: { orderId } });
  };

  if (!merchant || items.length === 0) return null;

  return (
    <div className="flex h-screen w-full flex-col bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center gap-4 bg-black/80 p-4 backdrop-blur-lg">
        <button onClick={() => navigate({ to: "/sacola" })} className="p-2 rounded-full bg-zinc-900"><ArrowLeft /></button>
        <h1 className="text-xl font-bold">Checkout</h1>
      </header>
      
      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        <section className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900">
          <p className="text-xs text-zinc-500 uppercase font-bold mb-2">Endereço</p>
          <div className="flex items-center gap-3">
            <MapPin className="text-primary" />
            <p className="font-bold">{address ? `${address.street}, ${address.number}` : "Carregando..."}</p>
          </div>
        </section>

        <section className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900">
          <p className="text-xs text-zinc-500 uppercase font-bold mb-2">Itens</p>
          {items.map(i => <div key={i.id} className="flex justify-between text-sm py-1"><span>{i.quantity}x {i.name}</span><span>R$ {(i.price * i.quantity).toFixed(2)}</span></div>)}
        </section>

        <section className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900">
          <p className="text-xs text-zinc-500 uppercase font-bold mb-2">Pagamento</p>
          <div className="flex items-center gap-3">
            <CreditCard className="text-primary h-5 w-5" />
            <p className="font-bold uppercase">{typeof window !== 'undefined' ? sessionStorage.getItem('apois_payment_method') || 'pix' : 'pix'}</p>
          </div>
        </section>

        <section className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900">
          <textarea 
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="Alguma observação para o estabelecimento?"
            className="w-full bg-zinc-900 rounded-xl p-3 text-sm focus:outline-none"
          />
        </section>

        <section className="space-y-2 text-sm text-zinc-400">
          <div className="flex justify-between"><span>Subtotal</span><span>R$ {subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>Taxa de entrega</span><span>R$ {deliveryFee.toFixed(2)}</span></div>
          <div className="flex justify-between text-primary font-bold text-lg"><span>Total</span><span>R$ {total.toFixed(2)}</span></div>
        </section>
      </main>

      <footer className="p-4 border-t border-zinc-900 bg-black">
        <button onClick={handleConfirm} className="w-full bg-primary text-black font-black py-4 rounded-xl uppercase">Confirmar pedido</button>
      </footer>
    </div>
  );
}
