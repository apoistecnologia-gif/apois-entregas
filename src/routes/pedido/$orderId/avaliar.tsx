import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MessageSquare, Star } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CustomerOrdersError,
  fetchCustomerOrderDetail,
  submitCustomerOrderReview,
  type CustomerOrderDetail,
} from "@/lib/remote-orders";

export const Route = createFileRoute("/pedido/$orderId/avaliar")({
  component: RateOrderPage,
});

function RateOrderPage() {
  const navigate = useNavigate();
  const { orderId } = useParams({ from: "/pedido/$orderId/avaliar" });
  const [order, setOrder] = useState<CustomerOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [merchantRating, setMerchantRating] = useState(0);
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    let active = true;

    const loadOrder = async () => {
      try {
        const remoteOrder = await fetchCustomerOrderDetail(orderId);
        if (!active) return;
        if (remoteOrder.status !== "delivered" || remoteOrder.review) {
          void navigate({ to: `/pedido/${orderId}` });
          return;
        }
        setOrder(remoteOrder);
      } catch (loadError) {
        if (!active) return;
        setError(
          loadError instanceof CustomerOrdersError
            ? loadError.message
            : "Não foi possível carregar o pedido.",
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadOrder();
    return () => {
      active = false;
    };
  }, [navigate, orderId]);

  const hasCourier = Boolean(order?.delivery?.courier_id);

  const handleSave = async () => {
    if (!order || submitting || merchantRating < 1) return;
    if (hasCourier && deliveryRating < 1) {
      setError("Avalie também a entrega antes de enviar.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await submitCustomerOrderReview({
        orderId,
        merchantRating,
        courierRating: hasCourier ? deliveryRating : null,
        comment: comment.trim(),
      });
      void navigate({ to: `/pedido/${orderId}` });
    } catch (saveError) {
      setError(
        saveError instanceof CustomerOrdersError
          ? saveError.message
          : "Não foi possível enviar sua avaliação.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black text-primary">
        <Loader2 className="h-9 w-9 animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-black p-6 text-center text-white">
        <h2 className="mb-2 text-xl font-bold">Pedido indisponível</h2>
        <p className="mb-6 text-sm text-zinc-500">{error ?? "Não encontramos esse pedido."}</p>
        <button
          onClick={() => void navigate({ to: "/pedidos" })}
          className="rounded-xl bg-primary px-6 py-3 font-bold uppercase text-black"
        >
          Meus pedidos
        </button>
      </div>
    );
  }

  const StarRating = ({ value, onChange }: { value: number; onChange: (value: number) => void }) => (
    <div className="flex gap-2" role="group" aria-label="Escolha uma nota de 1 a 5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          type="button"
          key={star}
          onClick={() => onChange(star)}
          aria-label={`${star} estrela${star > 1 ? "s" : ""}`}
          className="focus:outline-none"
        >
          <Star
            className={`h-8 w-8 ${star <= value ? "fill-primary text-primary" : "text-zinc-800"}`}
          />
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center gap-4 border-b border-zinc-900 bg-black/80 p-4 backdrop-blur-lg">
        <button
          onClick={() => void navigate({ to: `/pedido/${orderId}` })}
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar ao pedido"
        >
          <ArrowLeft />
        </button>
        <h1 className="text-lg font-bold">Avaliar pedido #{order.order_number}</h1>
      </header>

      <main className="flex-1 space-y-8 overflow-y-auto p-6">
        <div className="text-center">
          {order.merchants?.logo_url ? (
            <img
              src={order.merchants.logo_url}
              className="mx-auto mb-3 h-20 w-20 rounded-2xl object-cover ring-1 ring-white/10"
              alt={order.merchants.name}
            />
          ) : (
            <div className="mx-auto mb-3 grid h-20 w-20 place-items-center rounded-2xl bg-zinc-900 text-2xl font-black text-primary">
              {(order.merchants?.name ?? "A").slice(0, 1)}
            </div>
          )}
          <h2 className="text-xl font-bold">{order.merchants?.name ?? "Estabelecimento"}</h2>
          <p className="text-sm text-zinc-500">Como foi sua experiência com este pedido?</p>
        </div>

        <section className="space-y-4">
          <div className="space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Estabelecimento</h3>
            <StarRating value={merchantRating} onChange={setMerchantRating} />
          </div>

          {hasCourier && (
            <div className="space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-6">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Entrega</h3>
                {order.delivery?.couriers?.profile?.full_name && (
                  <p className="mt-1 text-sm text-zinc-400">{order.delivery.couriers.profile.full_name}</p>
                )}
              </div>
              <StarRating value={deliveryRating} onChange={setDeliveryRating} />
            </div>
          )}

          <div className="space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-6">
            <div className="mb-2 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-zinc-500" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Comentário opcional</h3>
            </div>
            <textarea
              value={comment}
              maxLength={1000}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Conte-nos um pouco mais sobre o que achou..."
              className="h-32 w-full rounded-xl bg-zinc-900 p-4 text-sm ring-1 ring-white/5 focus:outline-none"
            />
            <p className="text-right text-[10px] text-zinc-600">{comment.length}/1000</p>
          </div>
        </section>

        {error && (
          <div role="alert" className="rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-900 bg-black p-4">
        <button
          onClick={() => void handleSave()}
          disabled={submitting || !merchantRating || (hasCourier && !deliveryRating)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-black uppercase text-black shadow-lg shadow-primary/20 transition-transform active:scale-95 disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
          {submitting ? "Enviando..." : "Enviar avaliação"}
        </button>
      </footer>
    </div>
  );
}
