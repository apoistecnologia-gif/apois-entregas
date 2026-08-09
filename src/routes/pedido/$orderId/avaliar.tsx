import { createFileRoute, redirect, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Star, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalOrderById, getLocalOrders, LocalOrder, saveLocalOrders } from "@/lib/local-orders";

export const Route = createFileRoute("/pedido/$orderId/avaliar")({
  component: RateOrderPage,
});

function RateOrderPage() {
  const navigate = useNavigate();
  const { orderId } = useParams({ from: "/pedido/$orderId/avaliar" });
  const [order, setOrder] = useState<LocalOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [merchantRating, setMerchantRating] = useState(0);
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    const fetchOrder = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const foundOrder = getLocalOrderById(user.id, orderId);

      if (foundOrder) {
        if (foundOrder.status !== "entregue") {
          navigate({ to: `/pedido/${orderId}` });
          return;
        }
        setOrder(foundOrder);
      }
      setLoading(false);
    };

    fetchOrder();
  }, [orderId]);

  const handleSave = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const orders = getLocalOrders(user.id);
    const updatedOrders = orders.map((o) =>
      o.id === orderId
        ? { ...o, rating: { merchant: merchantRating, delivery: deliveryRating, comment } }
        : o,
    );
    saveLocalOrders(user.id, updatedOrders);
    navigate({ to: `/pedido/${orderId}` });
  };

  if (loading) return null;
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

  const StarRating = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} onClick={() => onChange(star)} className="focus:outline-none">
          <Star
            className={`h-8 w-8 ${star <= value ? "fill-primary text-primary" : "text-zinc-800"}`}
          />
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex h-screen w-full flex-col bg-black text-white overflow-hidden">
      <header className="sticky top-0 z-50 flex items-center gap-4 bg-black/80 p-4 backdrop-blur-lg border-b border-zinc-900">
        <button onClick={() => window.history.back()} className="p-2 rounded-full bg-zinc-900">
          <ArrowLeft />
        </button>
        <h1 className="text-lg font-bold">Avaliar pedido</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-8">
        <div className="text-center">
          <img
            src={order.merchant.logo}
            className="w-20 h-20 rounded-2xl mx-auto mb-3 object-cover ring-1 ring-white/10"
            alt=""
          />
          <h2 className="text-xl font-bold">{order.merchant.name}</h2>
          <p className="text-zinc-500 text-sm">Como foi sua experiência com este pedido?</p>
        </div>

        <section className="space-y-4">
          <div className="p-6 rounded-2xl bg-zinc-950 border border-zinc-900 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
              Estabelecimento
            </h3>
            <StarRating value={merchantRating} onChange={setMerchantRating} />
          </div>

          <div className="p-6 rounded-2xl bg-zinc-950 border border-zinc-900 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Entrega</h3>
            <StarRating value={deliveryRating} onChange={setDeliveryRating} />
          </div>

          <div className="p-6 rounded-2xl bg-zinc-950 border border-zinc-900 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4 text-zinc-500" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Comentário opcional
              </h3>
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Conte-nos um pouco mais sobre o que achou..."
              className="w-full h-32 bg-zinc-900 rounded-xl p-4 text-sm focus:outline-none ring-1 ring-white/5"
            />
          </div>
        </section>
      </main>

      <footer className="p-4 bg-black border-t border-zinc-900">
        <button
          onClick={handleSave}
          disabled={!merchantRating || !deliveryRating}
          className="w-full bg-primary disabled:opacity-50 disabled:grayscale text-black font-black py-4 rounded-xl uppercase shadow-lg shadow-primary/20 active:scale-95 transition-transform"
        >
          Enviar avaliação
        </button>
      </footer>
    </div>
  );
}
