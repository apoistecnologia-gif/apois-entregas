import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MessageSquare, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ReviewOrder = {
  id: string;
  order_number: number;
  status: string;
  merchants: { name: string; logo_url: string | null } | null;
  delivery_jobs: Array<{ courier_id: string | null }> | null;
};

export const Route = createFileRoute("/pedido/$orderId/avaliar")({
  component: RateOrderPage,
  head: () => ({ meta: [{ title: "Avaliar pedido | APOIS ENTREGA" }] }),
});

function RateOrderPage() {
  const navigate = useNavigate();
  const { orderId } = useParams({ from: "/pedido/$orderId/avaliar" });
  const [order, setOrder] = useState<ReviewOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [merchantRating, setMerchantRating] = useState(0);
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    let disposed = false;

    const fetchOrder = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || disposed) {
        if (!disposed) setLoading(false);
        return;
      }

      const [{ data: orderData, error: orderError }, { data: reviewData, error: reviewError }] =
        await Promise.all([
          (supabase as any)
            .from("orders")
            .select("id,order_number,status,merchants(name,logo_url),delivery_jobs(courier_id)")
            .eq("id", orderId)
            .eq("customer_user_id", user.id)
            .maybeSingle(),
          (supabase as any)
            .from("reviews")
            .select("id,merchant_rating,courier_rating,comment")
            .eq("order_id", orderId)
            .eq("customer_user_id", user.id)
            .maybeSingle(),
        ]);

      if (disposed) return;

      if (orderError || !orderData) {
        if (orderError) console.error("Erro ao carregar pedido para avaliação:", orderError);
        setOrder(null);
        setLoading(false);
        return;
      }

      if (orderData.status !== "delivered") {
        toast.info("A avaliação fica disponível depois que o pedido é entregue.");
        navigate({ to: `/pedido/${orderId}` });
        return;
      }

      setOrder(orderData as ReviewOrder);

      if (!reviewError && reviewData) {
        setAlreadyReviewed(true);
        setMerchantRating(Number(reviewData.merchant_rating ?? 0));
        setDeliveryRating(Number(reviewData.courier_rating ?? 0));
        setComment(reviewData.comment ?? "");
      } else if (reviewError) {
        console.error("Erro ao consultar avaliação existente:", reviewError);
      }

      setLoading(false);
    };

    void fetchOrder();
    return () => {
      disposed = true;
    };
  }, [navigate, orderId]);

  const hasCourier = Boolean(order?.delivery_jobs?.some((job) => Boolean(job.courier_id)));

  const handleSave = async () => {
    if (!order || submitting || alreadyReviewed) return;
    if (!merchantRating) {
      toast.error("Dê uma nota para o estabelecimento.");
      return;
    }
    if (hasCourier && !deliveryRating) {
      toast.error("Dê uma nota para a entrega.");
      return;
    }
    if (comment.trim().length > 1000) {
      toast.error("O comentário pode ter no máximo 1.000 caracteres.");
      return;
    }

    setSubmitting(true);
    const { error } = await (supabase as any).rpc("submit_order_review", {
      _order_id: order.id,
      _merchant_rating: merchantRating,
      _courier_rating: hasCourier ? deliveryRating : null,
      _comment: comment.trim() || null,
    });

    if (error) {
      console.error("Erro ao enviar avaliação:", error);
      const normalized = String(error.message ?? "").toLowerCase();
      if (normalized.includes("already reviewed")) {
        setAlreadyReviewed(true);
        toast.info("Este pedido já foi avaliado.");
      } else {
        toast.error("Não foi possível enviar sua avaliação. Tente novamente.");
      }
    } else {
      setAlreadyReviewed(true);
      toast.success("Obrigado pela sua avaliação!");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-black p-6 text-center text-white">
        <h2 className="mb-4 text-xl font-bold">Pedido não encontrado</h2>
        <button
          type="button"
          onClick={() => navigate({ to: "/pedidos" })}
          className="rounded-xl bg-primary px-6 py-3 font-bold uppercase text-black shadow-lg shadow-primary/20 transition-transform active:scale-95"
        >
          Voltar para Meus Pedidos
        </button>
      </div>
    );
  }

  const StarRating = ({
    value,
    onChange,
    disabled = false,
  }: {
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
  }) => (
    <div className="flex gap-2" role="radiogroup" aria-label="Nota de 1 a 5 estrelas">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} ${star === 1 ? "estrela" : "estrelas"}`}
          disabled={disabled}
          onClick={() => onChange(star)}
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default"
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
          type="button"
          onClick={() => navigate({ to: `/pedido/${orderId}` })}
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar para o pedido"
        >
          <ArrowLeft />
        </button>
        <div>
          <h1 className="text-lg font-bold">Avaliar pedido</h1>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Pedido #{order.order_number}
          </p>
        </div>
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
            <div className="mx-auto mb-3 grid h-20 w-20 place-items-center rounded-2xl bg-zinc-900 text-2xl font-black text-primary ring-1 ring-white/10">
              {order.merchants?.name?.charAt(0).toUpperCase() || "A"}
            </div>
          )}
          <h2 className="text-xl font-bold">{order.merchants?.name || "Estabelecimento"}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {alreadyReviewed
              ? "Sua avaliação deste pedido já foi enviada."
              : "Como foi sua experiência com este pedido?"}
          </p>
        </div>

        <section className="space-y-4">
          <div className="space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
              Estabelecimento
            </h3>
            <StarRating
              value={merchantRating}
              onChange={setMerchantRating}
              disabled={alreadyReviewed}
            />
          </div>

          {hasCourier ? (
            <div className="space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-6">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">Entrega</h3>
              <StarRating
                value={deliveryRating}
                onChange={setDeliveryRating}
                disabled={alreadyReviewed}
              />
            </div>
          ) : null}

          <div className="space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-6">
            <div className="mb-2 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-zinc-500" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Comentário opcional
              </h3>
            </div>
            <textarea
              value={comment}
              disabled={alreadyReviewed}
              maxLength={1000}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Conte-nos um pouco mais sobre o que achou..."
              className="h-32 w-full rounded-xl bg-zinc-900 p-4 text-sm ring-1 ring-white/5 focus:outline-none disabled:cursor-default disabled:opacity-70"
            />
            <p className="text-right text-[10px] text-zinc-600">{comment.length}/1000</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-900 bg-black p-4">
        {alreadyReviewed ? (
          <button
            type="button"
            onClick={() => navigate({ to: `/pedido/${orderId}` })}
            className="w-full rounded-xl border border-primary/30 bg-primary/10 py-4 font-black uppercase text-primary"
          >
            Voltar ao pedido
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={submitting || !merchantRating || (hasCourier && !deliveryRating)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-black uppercase text-black shadow-lg shadow-primary/20 transition-transform active:scale-95 disabled:opacity-50 disabled:grayscale"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {submitting ? "Enviando..." : "Enviar avaliação"}
          </button>
        )}
      </footer>
    </div>
  );
}
