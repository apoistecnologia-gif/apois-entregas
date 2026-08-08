import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  CustomerOrdersError,
  fetchCustomerOrderDetail,
  type CustomerOrderDetail,
} from "@/lib/remote-orders";

const orderSearchSchema = z.object({
  orderId: z.string(),
});

export const Route = createFileRoute("/pedido/confirmado")({
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
});

function addressText(address: Record<string, unknown>): string {
  const street = typeof address["street"] === "string" ? address["street"] : "";
  const number = typeof address["number"] === "string" ? address["number"] : "";
  const neighborhood =
    typeof address["neighborhood"] === "string" ? address["neighborhood"] : "";
  const firstLine = [street, number].filter(Boolean).join(", ");
  return [firstLine, neighborhood].filter(Boolean).join(" · ") || "Endereço cadastrado";
}

function OrderConfirmedPage() {
  const navigate = useNavigate();
  const { orderId } = Route.useSearch();
  const [order, setOrder] = useState<CustomerOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadOrder = async () => {
      try {
        const remoteOrder = await fetchCustomerOrderDetail(orderId);
        if (active) setOrder(remoteOrder);
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
  }, [orderId]);

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
        <h2 className="mb-2 text-xl font-bold">Pedido não encontrado</h2>
        <p className="mb-6 text-sm text-zinc-500">{error ?? "Não encontramos esse pedido na sua conta."}</p>
        <button
          onClick={() => void navigate({ to: "/pedidos" })}
          className="rounded-xl bg-primary px-6 py-3 font-bold uppercase text-black"
        >
          Meus pedidos
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-black p-6 text-center text-white">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 text-primary shadow-[0_0_30px_rgba(255,215,0,0.3)]">
        <CheckCircle2 className="h-12 w-12" />
      </div>

      <h1 className="mb-2 text-2xl font-black uppercase tracking-tight">Pedido recebido</h1>
      <p className="mb-8 max-w-sm text-zinc-500">
        Seu pedido foi registrado com segurança. Você pode acompanhar todas as próximas etapas em tempo real.
      </p>

      <div className="mb-10 w-full max-w-md space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-6 text-left">
        <div className="flex justify-between border-b border-zinc-900 pb-3">
          <span className="text-xs font-bold uppercase text-zinc-500">Pedido</span>
          <span className="font-mono font-bold text-primary">#{order.order_number}</span>
        </div>
        <div className="flex justify-between gap-4 border-b border-zinc-900 py-3">
          <span className="text-xs font-bold uppercase text-zinc-500">Estabelecimento</span>
          <span className="text-right font-bold">{order.merchants?.name ?? "Estabelecimento"}</span>
        </div>
        <div className="flex justify-between border-b border-zinc-900 py-3">
          <span className="text-xs font-bold uppercase text-zinc-500">Total</span>
          <span className="font-bold">R$ {order.total.toFixed(2).replace(".", ",")}</span>
        </div>
        <div className="pt-3">
          <span className="text-xs font-bold uppercase text-zinc-500">Entrega</span>
          <p className="mt-1 line-clamp-2 text-sm font-medium text-zinc-400">
            {addressText(order.delivery_address)}
          </p>
        </div>
      </div>

      <div className="flex w-full max-w-md flex-col gap-3">
        <button
          onClick={() => void navigate({ to: `/pedido/${orderId}` })}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-black uppercase text-black transition-transform active:scale-95"
        >
          Acompanhar pedido
          <ArrowRight className="h-5 w-5" />
        </button>
        <button
          onClick={() => void navigate({ to: "/inicio" })}
          className="w-full py-3 text-sm font-bold uppercase text-zinc-500"
        >
          Voltar ao início
        </button>
      </div>
    </div>
  );
}
