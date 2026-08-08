import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Clipboard, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  CustomerOrdersError,
  fetchCustomerOrderDetail,
  type CustomerOrderDetail,
} from "@/lib/remote-orders";
import { createPixCharge, PixPaymentError, type PixCharge } from "@/lib/payments";

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

function money(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function OrderConfirmedPage() {
  const navigate = useNavigate();
  const { orderId } = Route.useSearch();
  const [order, setOrder] = useState<CustomerOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<PixCharge | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixError, setPixError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadOrder = useCallback(async () => {
    try {
      const remoteOrder = await fetchCustomerOrderDetail(orderId);
      setOrder(remoteOrder);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof CustomerOrdersError
          ? loadError.message
          : "Não foi possível carregar o pedido.",
      );
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  useEffect(() => {
    const channel = supabase
      .channel(`confirmed-order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => void loadOrder(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadOrder, orderId]);

  const generatePix = async () => {
    if (pixLoading) return;
    setPixLoading(true);
    setPixError(null);
    try {
      const result = await createPixCharge(orderId);
      setPix(result.payment);
    } catch (paymentError) {
      setPixError(
        paymentError instanceof PixPaymentError
          ? paymentError.message
          : "Não foi possível gerar o PIX agora.",
      );
    } finally {
      setPixLoading(false);
    }
  };

  const copyPix = async () => {
    if (!pix?.qrCodeText) return;
    try {
      await navigator.clipboard.writeText(pix.qrCodeText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setPixError("Não foi possível copiar automaticamente. Selecione o código e copie manualmente.");
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
        <h2 className="mb-2 text-xl font-bold">Pedido não encontrado</h2>
        <p className="mb-6 text-sm text-zinc-500">{error ?? "Não encontramos esse pedido na sua conta."}</p>
        <button
          type="button"
          onClick={() => void navigate({ to: "/pedidos" })}
          className="rounded-xl bg-primary px-6 py-3 font-bold uppercase text-black"
        >
          Meus pedidos
        </button>
      </div>
    );
  }

  const paid = order.payment_status === "paid";
  const cancelled = ["cancelled", "refunded"].includes(order.status);

  return (
    <div className="min-h-screen w-full bg-black px-5 py-8 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 text-primary shadow-[0_0_30px_rgba(255,215,0,0.3)]">
          <CheckCircle2 className="h-12 w-12" />
        </div>

        <h1 className="mb-2 text-2xl font-black uppercase tracking-tight">Pedido recebido</h1>
        <p className="mb-7 text-sm text-zinc-500">
          O pedido já está registrado. O estabelecimento só poderá iniciar o preparo depois da confirmação do pagamento.
        </p>

        <section className="mb-5 w-full space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-5 text-left">
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
            <span className="font-bold">{money(order.total)}</span>
          </div>
          <div className="pt-3">
            <span className="text-xs font-bold uppercase text-zinc-500">Entrega</span>
            <p className="mt-1 line-clamp-2 text-sm font-medium text-zinc-400">
              {addressText(order.delivery_address)}
            </p>
          </div>
        </section>

        {!cancelled && order.payment_method === "pix" && !paid && (
          <section className="mb-5 w-full rounded-2xl border border-primary/25 bg-primary/5 p-5 text-left">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-black">Pagar com PIX</h2>
                <p className="text-xs text-zinc-500">Cobrança processada pela OpenPix/Woovi.</p>
              </div>
            </div>

            {!pix && (
              <button
                type="button"
                onClick={() => void generatePix()}
                disabled={pixLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-black uppercase text-black disabled:opacity-50"
              >
                {pixLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                {pixLoading ? "Gerando PIX..." : "Gerar PIX"}
              </button>
            )}

            {pix && (
              <div className="space-y-4">
                {pix.qrCodeImageUrl && (
                  <div className="mx-auto w-fit rounded-2xl bg-white p-3">
                    <img
                      src={pix.qrCodeImageUrl}
                      alt="QR Code PIX do pedido"
                      className="h-52 w-52 object-contain"
                    />
                  </div>
                )}
                <div>
                  <p className="mb-2 text-xs font-bold uppercase text-zinc-500">PIX copia e cola</p>
                  <textarea
                    readOnly
                    value={pix.qrCodeText ?? ""}
                    rows={4}
                    className="w-full resize-none rounded-xl border border-zinc-800 bg-black p-3 text-xs text-zinc-300 outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void copyPix()}
                  disabled={!pix.qrCodeText}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 py-3 font-bold text-primary disabled:opacity-40"
                >
                  <Clipboard className="h-4 w-4" />
                  {copied ? "Código copiado" : "Copiar código PIX"}
                </button>
                {pix.expiresAt && (
                  <p className="text-center text-[11px] text-zinc-600">
                    Validade da cobrança: {new Date(pix.expiresAt).toLocaleString("pt-BR")}
                  </p>
                )}
              </div>
            )}

            {pixError && (
              <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
                {pixError}
                <button
                  type="button"
                  onClick={() => void generatePix()}
                  className="mt-2 flex items-center gap-1 text-xs font-bold text-primary"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
                </button>
              </div>
            )}
          </section>
        )}

        {paid && (
          <section className="mb-5 w-full rounded-2xl border border-green-900/60 bg-green-950/25 p-5 text-left">
            <div className="flex items-center gap-3 text-green-400">
              <CheckCircle2 className="h-6 w-6" />
              <div>
                <p className="font-black">Pagamento confirmado</p>
                <p className="text-xs text-green-300/70">O estabelecimento já pode seguir com o pedido.</p>
              </div>
            </div>
          </section>
        )}

        {cancelled && (
          <section className="mb-5 w-full rounded-2xl border border-red-950 bg-red-950/20 p-4 text-sm text-red-300">
            Este pedido foi cancelado e não aceita novos pagamentos.
          </section>
        )}

        <div className="flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={() => void navigate({ to: `/pedido/${orderId}` })}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-black uppercase text-black transition-transform active:scale-95"
          >
            Acompanhar pedido
            <ArrowRight className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => void loadOrder()}
            className="flex w-full items-center justify-center gap-2 py-3 text-sm font-bold uppercase text-zinc-500"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar pagamento
          </button>
          <button
            type="button"
            onClick={() => void navigate({ to: "/inicio" })}
            className="w-full py-2 text-sm font-bold uppercase text-zinc-600"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    </div>
  );
}
