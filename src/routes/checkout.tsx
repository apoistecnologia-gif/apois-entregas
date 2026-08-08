import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MapPin, CreditCard, Copy, Check, Loader2, QrCode } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LocalAddressSnapshot } from "@/lib/local-orders";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

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
  const [address, setAddress] = useState<LocalAddressSnapshot | null>(null);
  const [observation, setObservation] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [pixData, setPixData] = useState<{
    qrCodeImageUrl: string;
    qrCodeText: string;
    orderId: string;
    total: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [requestKey] = useState(() => {
    const saved = sessionStorage.getItem('apois_checkout_request_key');
    if (saved) return saved;
    const newKey = crypto.randomUUID();
    sessionStorage.setItem('apois_checkout_request_key', newKey);
    return newKey;
  });

  const paymentMethod = typeof window !== 'undefined' ? sessionStorage.getItem('apois_payment_method') || 'pix' : 'pix';

  useEffect(() => {
    if (items.length === 0 && !pixData) {
      navigate({ to: "/sacola" });
    }
    fetchDefaultAddress();
  }, [items, pixData]);

  const fetchDefaultAddress = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('customer_addresses' as any)
      .select('*')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single();
    if (data) setAddress(data as any);
  };

  const subtotal = totalPrice;
  const deliveryFee = merchant?.deliveryFee || 0;
  const total = subtotal + deliveryFee;

  const handleCopyPix = () => {
    if (pixData) {
      navigator.clipboard.writeText(pixData.qrCodeText);
      setCopied(true);
      toast.success("Código PIX copiado!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConfirm = async () => {
    if (isProcessing) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (!address) {
      toast.error("Por favor, selecione um endereço de entrega.");
      return;
    }

    if (paymentMethod !== 'pix') {
      toast.error("No momento, apenas PIX está disponível.");
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Chamar Edge Function create-order
      const { data: orderResponse, error: orderError } = await supabase.functions.invoke('create-order', {
        body: {
          merchantId: merchant?.id,
          requestKey,
          paymentMethod: 'pix',
          deliveryAddress: address,
          observation,
          items: items.map(item => ({
            productId: item.id,
            quantity: item.quantity,
            options: item.selectedOptions.map(o => ({ optionId: o.optionId }))
          }))
        }
      });

      if (orderError) throw orderError;
      const orderId = orderResponse.orderId;

      // 2. Chamar create-pix-charge
      const { data: pixResponse, error: pixError } = await supabase.functions.invoke('create-pix-charge', {
        body: { orderId }
      });

      if (pixError) throw pixError;

      // Validar dados essenciais do PIX
      const payment = pixResponse?.payment;
      if (!payment?.qrCodeText || !payment?.qrCodeImageUrl) {
        throw new Error("Dados do PIX incompletos. Por favor, tente novamente.");
      }

      // 3. Exibir tela PIX
      setPixData({
        qrCodeImageUrl: payment.qrCodeImageUrl,
        qrCodeText: payment.qrCodeText,
        orderId,
        total: Number(payment.amount) || total
      });

      // 4. Limpar sacola e requestKey após sucesso real
      clearCart();
      sessionStorage.removeItem('apois_checkout_request_key');
      toast.success("Pedido criado com sucesso!");

    } catch (error: any) {
      console.error("Erro no checkout:", error);
      toast.error(error.message || "Ocorreu um erro ao processar seu pedido. Tente novamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (pixData) {
    return <PixPaymentScreen pixData={pixData} onCopy={handleCopyPix} copied={copied} total={pixData.total} />;
  }

  if (!merchant || items.length === 0) return null;

  return (
    <div className="flex h-screen w-full flex-col bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center gap-4 bg-black/80 p-4 backdrop-blur-lg">
        <button onClick={() => navigate({ to: "/sacola" })} className="p-2 rounded-full bg-zinc-900"><ArrowLeft /></button>
        <h1 className="text-xl font-bold">Checkout</h1>
      </header>
      
      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        <section className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900">
          <p className="text-xs text-zinc-500 uppercase font-bold mb-2">Endereço de Entrega</p>
          <div className="flex items-center gap-3">
            <MapPin className="text-primary" />
            <div className="flex-1">
              <p className="font-bold">{address ? `${address.street}, ${address.number}` : "Carregando..."}</p>
              <p className="text-xs text-zinc-500">{address?.neighborhood}</p>
            </div>
          </div>
        </section>

        <section className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900">
          <p className="text-xs text-zinc-500 uppercase font-bold mb-2">Itens</p>
          {items.map(i => (
            <div key={i.lineId} className="space-y-1 py-2 border-b border-zinc-900 last:border-0">
              <div className="flex justify-between text-sm">
                <span className="font-bold">{i.quantity}x {i.name}</span>
                <span>R$ {(i.price * i.quantity).toFixed(2).replace('.', ',')}</span>
              </div>
              {i.selectedOptions.length > 0 && (
                <p className="text-[10px] text-zinc-500 line-clamp-1">
                  {i.selectedOptions.map(opt => opt.optionName).join(' • ')}
                </p>
              )}
            </div>
          ))}
        </section>

        <section className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900">
          <p className="text-xs text-zinc-500 uppercase font-bold mb-2">Forma de Pagamento</p>
          <div className="space-y-3">
             <div className={`flex items-center gap-3 p-3 rounded-xl border ${paymentMethod === 'pix' ? 'border-primary bg-primary/5' : 'border-zinc-900 opacity-50'}`}>
                <div className="h-8 w-8 bg-primary/20 rounded-full flex items-center justify-center">
                   <QrCode className="text-primary h-4 w-4" />
                </div>
                <div className="flex-1">
                   <p className="font-bold text-sm">PIX</p>
                   <p className="text-[10px] text-primary font-bold">DISPONÍVEL</p>
                </div>
             </div>
             
             <div className="flex items-center gap-3 p-3 rounded-xl border border-zinc-900 opacity-30 grayscale">
                <div className="h-8 w-8 bg-zinc-800 rounded-full flex items-center justify-center">
                   <CreditCard className="text-zinc-500 h-4 w-4" />
                </div>
                <div className="flex-1">
                   <p className="font-bold text-sm">Cartão de Crédito</p>
                   <p className="text-[10px] text-zinc-500 font-bold uppercase">Em breve</p>
                </div>
             </div>
          </div>
        </section>

        <section className="bg-zinc-950 p-4 rounded-2xl border border-zinc-900">
          <textarea 
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="Alguma observação para o estabelecimento?"
            className="w-full bg-zinc-900 rounded-xl p-3 text-sm focus:outline-none min-h-[80px]"
          />
        </section>

        <section className="space-y-2 text-sm text-zinc-400">
          <div className="flex justify-between"><span>Subtotal</span><span>R$ {subtotal.toFixed(2).replace('.', ',')}</span></div>
          <div className="flex justify-between"><span>Taxa de entrega</span><span>R$ {deliveryFee.toFixed(2).replace('.', ',')}</span></div>
          <div className="flex justify-between text-primary font-black text-lg pt-2 border-t border-zinc-900 mt-2"><span>Total</span><span>R$ {total.toFixed(2).replace('.', ',')}</span></div>
        </section>
      </main>

      <footer className="p-4 border-t border-zinc-900 bg-black">
        <Button 
          onClick={handleConfirm} 
          disabled={isProcessing}
          className="w-full bg-primary text-black font-black py-7 rounded-2xl uppercase text-lg shadow-[0_8px_30px_-10px_hsl(var(--primary)/0.5)]"
        >
          {isProcessing ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Processando...</span>
            </div>
          ) : (
            "Finalizar Pedido"
          )}
        </Button>
      </footer>
    </div>
  );
}

function PixPaymentScreen({ pixData, onCopy, copied, total }: { 
  pixData: { qrCodeImageUrl: string, qrCodeText: string, orderId: string }, 
  onCopy: () => void, 
  copied: boolean,
  total: number
}) {
  const navigate = useNavigate();
  const [paymentStatus, setPaymentStatus] = useState<string>('pending');

  useEffect(() => {
    const channel = supabase
      .channel(`checkout_payment_${pixData.orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${pixData.orderId}`
        },
        (payload) => {
          if (payload.new['payment_status'] === 'paid') {
            setPaymentStatus('paid');
            toast.success("Pagamento confirmado!");
            setTimeout(() => {
              navigate({ to: "/pedido/confirmado", search: { orderId: pixData.orderId } });
            }, 1500);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pixData.orderId]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-black text-white p-6">
      <header className="flex flex-col items-center justify-center space-y-2 mb-8 mt-4">
        <div className="h-12 w-12 bg-primary/20 rounded-full flex items-center justify-center">
          <QrCode className="text-primary h-6 w-6" />
        </div>
        <h1 className="text-2xl font-black uppercase">Pagamento PIX</h1>
        <p className="text-zinc-500 text-sm">Escaneie o código ou copie o código abaixo</p>
      </header>

      <main className="flex-1 flex flex-col items-center space-y-8">
        <div className="bg-white p-4 rounded-3xl shadow-[0_0_40px_rgba(255,215,0,0.2)]">
          <img src={pixData.qrCodeImageUrl} alt="QR Code PIX" className="w-64 h-64" />
        </div>

        <div className="w-full space-y-4">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <p className="text-xs text-zinc-500 font-bold uppercase mb-2">Valor total</p>
            <p className="text-3xl font-black text-primary">R$ {total.toFixed(2).replace('.', ',')}</p>
          </div>

          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <p className="text-xs text-zinc-500 font-bold uppercase mb-2">Código Copia e Cola</p>
            <div className="bg-zinc-900 rounded-xl p-3 flex items-center gap-3">
              <p className="text-[10px] text-zinc-400 font-mono truncate flex-1">{pixData.qrCodeText}</p>
              <button 
                onClick={onCopy}
                className="p-2 bg-primary text-black rounded-lg active:scale-95 transition-transform"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-8 space-y-3">
        {paymentStatus === 'paid' ? (
          <div className="flex flex-col items-center justify-center p-4 bg-primary/10 rounded-2xl border border-primary/20">
            <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
            <p className="text-primary font-bold uppercase text-sm">Pagamento Confirmado! Redirecionando...</p>
          </div>
        ) : (
          <>
            <Button 
              onClick={onCopy}
              className="w-full h-14 bg-primary text-black font-black uppercase rounded-2xl"
            >
              Copiar código PIX
            </Button>
            <div className="flex flex-col items-center justify-center p-4 text-zinc-500 italic text-xs text-center">
              <Loader2 className="h-4 w-4 animate-spin mb-2 opacity-50" />
              <p>Aguardando confirmação do pagamento pelo banco...</p>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}
