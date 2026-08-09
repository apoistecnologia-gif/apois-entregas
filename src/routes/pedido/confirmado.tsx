import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const orderSearchSchema = z.object({
  orderId: z.string(),
});

export const Route = createFileRoute("/pedido/confirmado")({
  ssr: false,
  validateSearch: orderSearchSchema,
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
    return { session };
  },
  component: OrderConfirmedPage,
  head: () => ({
    meta: [{ title: "Pedido Confirmado | APOIS ENTREGA" }],
  }),
});

function OrderConfirmedPage() {
  const navigate = useNavigate();
  const { orderId } = Route.useSearch();
  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrder = async () => {
      const { data, error } = await supabase
        .from("orders" as any)
        .select("*, merchants(*)")
        .eq("id", orderId)
        .single();

      if (error) {
        console.error("Erro ao carregar pedido real:", error);
      } else {
        setOrder(data);
      }
      setLoading(false);
    };
    fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

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

  const deliveryAddress =
    typeof order.delivery_address === "string"
      ? JSON.parse(order.delivery_address)
      : order.delivery_address;

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-black p-6 text-center text-white">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 text-primary shadow-[0_0_30px_rgba(255,215,0,0.3)]">
        <CheckCircle2 className="h-12 w-12" />
      </div>

      <h1 className="mb-2 text-2xl font-black uppercase tracking-tight text-white">
        Pedido confirmado ✓
      </h1>
      <p className="mb-8 text-zinc-500">
        Seu pedido foi recebido pelo estabelecimento e já está sendo processado.
      </p>

      <div className="mb-10 w-full space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-6 text-left">
        <div className="flex justify-between border-b border-zinc-900 pb-3">
          <span className="text-xs font-bold uppercase text-zinc-500">Número</span>
          <span className="font-mono font-bold text-primary">#{order.order_number}</span>
        </div>
        <div className="flex justify-between border-b border-zinc-900 py-3">
          <span className="text-xs font-bold uppercase text-zinc-500">Estabelecimento</span>
          <span className="font-bold text-white">{order.merchants?.name || "Estabelecimento"}</span>
        </div>
        <div className="flex justify-between border-b border-zinc-900 py-3">
          <span className="text-xs font-bold uppercase text-zinc-500">Total</span>
          <span className="font-bold text-white">
            R$ {order.total.toFixed(2).replace(".", ",")}
          </span>
        </div>
        <div className="pt-3">
          <span className="text-xs font-bold uppercase text-zinc-500">Entrega</span>
          <p className="mt-1 text-sm font-medium text-zinc-400 line-clamp-1">
            {deliveryAddress?.street}, {deliveryAddress?.number}
          </p>
        </div>
      </div>

      <div className="flex w-full flex-col gap-3">
        <button
          onClick={() => navigate({ to: `/pedido/${orderId}` })}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-black uppercase text-black transition-transform active:scale-95"
        >
          Acompanhar pedido
          <ArrowRight className="h-5 w-5" />
        </button>
        <button
          onClick={() => navigate({ to: "/inicio" })}
          className="w-full py-3 text-sm font-bold uppercase text-zinc-500"
        >
          Voltar ao início
        </button>
      </div>
    </div>
  );
}
