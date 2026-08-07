import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { 
  ArrowLeft, 
  Trash2, 
  Minus, 
  Plus, 
  MapPin, 
  ChevronRight, 
  CreditCard, 
  CircleDollarSign,
  ShieldCheck,
  ChevronDown
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";


// Dados do estabelecimento são obtidos do CartContext

export const Route = createFileRoute("/sacola")({
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
  component: SacolaPage,
});

function SacolaPage() {
  const navigate = useNavigate();
  const { items, merchant, updateQuantity, removeItem, totalPrice } = useCart();

  const [defaultAddress, setDefaultAddress] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'cartao' | 'dinheiro'>('pix');
  const [discount, setDiscount] = useState(5.00);


  useEffect(() => {
    fetchDefaultAddress();
  }, []);

  const fetchDefaultAddress = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await (supabase as any)
      .from('customer_addresses')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single();

    if (data) setDefaultAddress(data);
  };

  const subtotal = totalPrice;
  const deliveryFee = merchant?.deliveryFee || 0;
  const total = subtotal + deliveryFee - (subtotal > 0 ? discount : 0);


  const handleFinishOrder = () => {
    if (items.length === 0) return;
    if (!defaultAddress) {
      alert("Selecione um endereço de entrega!");
      return;
    }
    navigate({ to: "/checkout" });
  };

  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-black text-white selection:bg-primary selection:text-black">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center gap-4 bg-black/80 p-4 backdrop-blur-lg">
        <button 
          onClick={() => window.history.back()}
          className="grid h-10 w-10 place-items-center rounded-full bg-zinc-900 ring-1 ring-white/10"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="text-xl font-bold">Sacola</h1>
      </header>

      <main className="flex-1 space-y-4 p-4 pb-32">
        {/* Merchant Info */}
        {items.length > 0 && merchant && (
          <section className="flex items-center gap-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-4 shadow-lg shadow-black/50">
            <img 
              src={merchant.logo} 
              alt={merchant.name}
              className="h-16 w-16 rounded-xl object-cover ring-1 ring-primary/20"
            />
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">{merchant.name}</h2>
              <p className="text-sm text-zinc-500">{merchant.category || "Hambúrgueres • Lanches"}</p>
              <div className="mt-1 flex items-center gap-3">
                <span className="flex items-center gap-1 text-[12px] font-medium text-green-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Aberto até {merchant.closeTime}
                </span>
                <span className="flex items-center gap-1 text-[12px] text-zinc-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                  {merchant.deliveryTime}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Products List */}
        <section className="space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950/50 p-1">
          {items.map((item) => (
            <div 
              key={item.id}
              className="group relative flex gap-4 p-3 border-b border-zinc-900/50 last:border-0"
            >
              <div className="relative h-20 w-20 shrink-0">
                <img 
                  src={item.image} 
                  alt={item.name}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=300&auto=format&fit=crop";
                    target.classList.add("opacity-50", "grayscale");
                  }}
                  className="h-full w-full rounded-xl object-cover ring-1 ring-white/5 bg-zinc-900"
                />
                <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[12px] font-black text-black ring-2 ring-black">
                  {item.quantity}
                </span>
              </div>
              
              <div className="flex flex-1 flex-col justify-between py-0.5">
                <div>
                  <h3 className="text-[15px] font-bold text-white">{item.name}</h3>
                  <p className="line-clamp-2 text-[12px] leading-snug text-zinc-500">
                    {item.description}
                  </p>
                </div>
                <p className="text-[15px] font-black text-primary">
                  R$ {item.price.toFixed(2).replace('.', ',')}
                </p>
              </div>

              <div className="flex flex-col items-center justify-between py-1">
                <button 
                  onClick={() => removeItem(item.id)}
                  className="p-1 text-zinc-600 transition-colors hover:text-red-500"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-2 rounded-lg bg-zinc-900 p-1 ring-1 ring-white/10">
                  <button 
                    onClick={() => updateQuantity(item.id, -1)}
                    className="grid h-6 w-6 place-items-center rounded-md bg-zinc-800 text-zinc-400 active:bg-zinc-700"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-[20px] text-center text-[14px] font-bold">{item.quantity}</span>
                  <button 
                    onClick={() => updateQuantity(item.id, 1)}
                    className="grid h-6 w-6 place-items-center rounded-md bg-zinc-800 text-white active:bg-zinc-700"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-24 h-24 rounded-full bg-zinc-900 flex items-center justify-center ring-1 ring-white/10 shadow-2xl">
                <Trash2 className="w-10 h-10 text-zinc-700" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-white">Sua sacola está vazia</h3>
                <p className="text-zinc-500 text-sm max-w-[200px]">Adicione produtos para começar seu pedido</p>
              </div>
              <button 
                onClick={() => navigate({ to: "/inicio" })}
                className="bg-primary text-black px-8 py-3 rounded-xl font-bold uppercase tracking-tight shadow-lg shadow-primary/20 active:scale-95 transition-transform"
              >
                Explorar estabelecimentos
              </button>
            </div>
          )}
        </section>

        {/* Summary */}
        {items.length > 0 && (
          <>
            <section className="space-y-3 px-1 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <div className="flex items-center gap-1">
                  <span>Taxa de entrega</span>
                  <button className="text-zinc-600"><span className="text-[10px] border border-zinc-700 rounded-full px-1">i</span></button>
                </div>
                <span>R$ {deliveryFee.toFixed(2).replace('.', ',')}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-500">
                  <span>Desconto</span>
                  <span>- R$ {discount.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-zinc-900 pt-3 text-lg font-black">
                <span>Total</span>
                <span className="text-primary text-xl">R$ {total.toFixed(2).replace('.', ',')}</span>
              </div>
            </section>

            {/* Address Selector */}
            <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4 shadow-lg">
              <button 
                onClick={() => navigate({ to: "/enderecos" })}
                className="group flex w-full items-center gap-4 text-left"
              >
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <MapPin className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <p className="text-[12px] font-medium text-zinc-500">Endereço de entrega</p>
                  {defaultAddress ? (
                    <>
                      <p className="font-bold text-white line-clamp-1">{defaultAddress.label}: {defaultAddress.street}, {defaultAddress.number}</p>
                      <p className="text-[12px] text-zinc-500">Entregar até 22:00 • {merchant?.deliveryTime}</p>
                    </>
                  ) : (
                    <p className="font-bold text-primary">Selecione um endereço</p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-zinc-700 transition-transform group-active:translate-x-1" />
              </button>
            </section>

            {/* Payment Methods */}
            <section className="space-y-3 pb-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Pagamento</h3>
                <button className="text-xs font-bold text-primary uppercase underline underline-offset-4">Trocar</button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <button 
                  onClick={() => {
                    setPaymentMethod('pix');
                    sessionStorage.setItem('apois_payment_method', 'pix');
                  }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border py-4 transition-all ${paymentMethod === 'pix' ? 'border-primary bg-primary/5 text-primary shadow-[0_0_15px_rgba(255,215,0,0.15)] ring-1 ring-primary/30' : 'border-zinc-900 bg-zinc-950 text-zinc-500'}`}
                >
                  <div className="relative">
                    <CircleDollarSign className="h-6 w-6" />
                    {paymentMethod === 'pix' && <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-primary flex items-center justify-center ring-2 ring-black"><div className="h-1.5 w-1.5 rounded-full bg-black" /></div>}
                  </div>
                  <span className="text-[12px] font-bold">Pix</span>
                </button>
                
                <button 
                  onClick={() => {
                    setPaymentMethod('cartao');
                    sessionStorage.setItem('apois_payment_method', 'cartao');
                  }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border py-4 transition-all ${paymentMethod === 'cartao' ? 'border-primary bg-primary/5 text-primary' : 'border-zinc-900 bg-zinc-950 text-zinc-500'}`}
                >
                  <CreditCard className="h-6 w-6" />
                  <span className="text-[12px] font-bold">Cartão</span>
                </button>
                
                <button 
                  onClick={() => {
                    setPaymentMethod('dinheiro');
                    sessionStorage.setItem('apois_payment_method', 'dinheiro');
                  }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl border py-4 transition-all ${paymentMethod === 'dinheiro' ? 'border-primary bg-primary/5 text-primary' : 'border-zinc-900 bg-zinc-950 text-zinc-500'}`}
                >
                  <CircleDollarSign className="h-6 w-6" />
                  <span className="text-[12px] font-bold">Dinheiro</span>
                </button>
              </div>
            </section>

            <div className="flex items-center justify-center gap-2 text-zinc-600 text-[11px] pb-4">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Ambiente seguro e criptografado</span>
            </div>
          </>
        )}
      </main>

      {/* Footer CTA */}
      <footer className="sticky bottom-0 z-[60] bg-black/90 p-4 pb-8 backdrop-blur-xl border-t border-zinc-900 w-full flex justify-center">
        <div className="w-full max-w-[500px]">
          <button 
            onClick={handleFinishOrder}
            className="flex w-full items-center justify-between rounded-xl bg-primary px-6 py-4 text-black shadow-[0_8px_30px_rgba(255,215,0,0.3)] transition-transform active:scale-95"
          >
            <span className="text-lg font-black uppercase tracking-tight">
              {items.length === 0 ? "Escolher produtos" : "Fazer pedido"}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black">R$ {total.toFixed(2).replace('.', ',')}</span>
              <ChevronRight className="h-5 w-5" />
            </div>
          </button>
        </div>
      </footer>
    </div>
  );
}
