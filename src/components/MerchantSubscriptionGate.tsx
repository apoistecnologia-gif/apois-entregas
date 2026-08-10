import { Copy, Loader2, LogOut, QrCode, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type MerchantSubscriptionGateProps = {
  merchant: any;
  subscription: any;
  onRefresh: () => void | Promise<void>;
  onLogout: () => void | Promise<void>;
};

type PixPayment = {
  id: string;
  status: string;
  amount: number;
  qrCodeText: string;
  qrCodeImageUrl: string | null;
  expiresAt: string | null;
  providerChargeId: string;
};

const dateLabel = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

function statusLabel(value: string | null | undefined) {
  switch (value) {
    case "paid":
    case "authorized":
      return "Mensalidade paga";
    case "pending":
      return "Pagamento pendente";
    case "paused":
      return "Cobrança pausada";
    case "cancelled":
    case "canceled":
      return "Cobrança cancelada";
    default:
      return value ? `Status: ${value}` : "Mensalidade ainda não ativada";
  }
}

async function subscriptionErrorMessage(error: unknown): Promise<string> {
  const fallback = "Não foi possível gerar o PIX da mensalidade.";
  if (!error || typeof error !== "object") return fallback;

  const context = "context" in error ? (error as { context?: unknown }).context : null;
  if (context instanceof Response) {
    try {
      const payload = (await context.clone().json()) as any;
      const provider = payload?.provider;
      const firstCause = Array.isArray(provider?.causes) ? provider.causes[0] : null;
      const providerDetail =
        provider?.message || provider?.error || firstCause?.description || payload?.error;
      if (providerDetail) return `Mercado Pago: ${String(providerDetail)}`;
    } catch {
      // O corpo de erro pode não ser JSON; caímos para a mensagem padrão abaixo.
    }
  }

  return "message" in error && typeof (error as { message?: unknown }).message === "string"
    ? String((error as { message: string }).message)
    : fallback;
}

export function MerchantSubscriptionGate({
  merchant,
  subscription,
  onRefresh,
  onLogout,
}: MerchantSubscriptionGateProps) {
  const [busy, setBusy] = useState<"checkout" | "sync" | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [pixPayment, setPixPayment] = useState<PixPayment | null>(null);
  const [testMode, setTestMode] = useState(false);

  const reconcile = useCallback(
    async (interactive = false) => {
      if (interactive) {
        setBusy("sync");
        setLastError(null);
      }
      try {
        const { data, error } = await supabase.functions.invoke("merchant-subscription", {
          body: { action: "sync" },
        });
        if (error) throw error;
        if (data?.accessAllowed) {
          setPixPayment(null);
          if (interactive) toast.success("Pagamento confirmado. Acesso liberado.");
          await onRefresh();
          return true;
        }
        if (interactive) {
          toast.info("O pagamento ainda não consta como aprovado no Mercado Pago.");
        }
        return false;
      } catch (error: unknown) {
        if (interactive) {
          const message = await subscriptionErrorMessage(error);
          setLastError(message);
          toast.error(message);
        }
        return false;
      } finally {
        if (interactive) setBusy(null);
      }
    },
    [onRefresh],
  );

  useEffect(() => {
    void reconcile(false);

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void reconcile(false);
    };
    const refreshOnFocus = () => void reconcile(false);

    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [reconcile]);

  useEffect(() => {
    if (!pixPayment) return;
    const timer = window.setInterval(() => void reconcile(false), 5000);
    return () => window.clearInterval(timer);
  }, [pixPayment, reconcile]);

  useEffect(() => {
    if (!merchant?.id) return;
    const channel = supabase
      .channel(`merchant_subscription_${merchant.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "merchant_subscriptions",
          filter: `merchant_id=eq.${merchant.id}`,
        },
        () => void onRefresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [merchant?.id, onRefresh]);

  const checkout = async () => {
    setBusy("checkout");
    setLastError(null);
    try {
      const { data, error } = await supabase.functions.invoke("merchant-subscription", {
        body: { action: "checkout" },
      });
      if (error) throw error;
      if (data?.accessAllowed) {
        toast.success("Mensalidade confirmada. Acesso liberado.");
        await onRefresh();
        return;
      }
      const payment = data?.payment as PixPayment | undefined;
      if (!payment?.qrCodeText) throw new Error("O Mercado Pago não retornou um PIX válido.");
      setPixPayment(payment);
      setTestMode(Boolean(data?.testMode));
      toast.success(data?.reused ? "PIX pendente recuperado." : "PIX da mensalidade gerado.");
    } catch (error: unknown) {
      const message = await subscriptionErrorMessage(error);
      setLastError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const copyPix = async () => {
    if (!pixPayment?.qrCodeText) return;
    try {
      await navigator.clipboard.writeText(pixPayment.qrCodeText);
      toast.success("Código PIX copiado.");
    } catch {
      toast.error("Não foi possível copiar automaticamente. Selecione o código abaixo.");
    }
  };

  return (
    <div className="min-h-dvh bg-black px-4 py-8 text-white">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-primary">
              APOIS ENTREGA
            </p>
            <h1 className="mt-1 text-2xl font-black">{merchant?.name ?? "Estabelecimento"}</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void onLogout()}
            className="border-zinc-800 bg-zinc-950"
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>

        <section className="rounded-3xl border border-primary/30 bg-zinc-950 p-6 shadow-2xl md:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="mt-5 text-2xl font-black">Mensalidade necessária para acessar o painel</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            A APOIS ENTREGA cobra apenas <strong className="text-white">R$ 69,90 por mês</strong>
            do estabelecimento. Não existe comissão sobre os pedidos nem taxa de serviço do cliente.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-900 bg-black p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-600">Situação</p>
              <p className="mt-1 font-black text-amber-400">
                {statusLabel(subscription?.provider_status)}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-900 bg-black p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                Acesso pago até
              </p>
              <p className="mt-1 font-black">{dateLabel(subscription?.current_period_end)}</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-900 bg-black p-4 text-sm text-zinc-400">
            A mensalidade é paga por PIX pelo Mercado Pago. Assim que o pagamento for confirmado, o
            acesso é liberado automaticamente por um mês. Se o período vencer sem uma nova
            mensalidade paga, o painel operacional e novos pedidos ficam bloqueados até a
            regularização.
          </div>

          {testMode ? (
            <div className="mt-4 rounded-2xl border border-amber-800/60 bg-amber-950/20 p-4 text-sm text-amber-200">
              Ambiente de testes do Mercado Pago: este PIX não movimenta dinheiro real.
            </div>
          ) : null}

          {lastError ? (
            <div className="mt-4 rounded-2xl border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-200">
              <strong>Falha ao gerar o PIX:</strong> {lastError}
            </div>
          ) : null}

          {pixPayment ? (
            <div className="mt-6 rounded-3xl border border-primary/30 bg-black p-5">
              <div className="flex items-center gap-2 text-primary">
                <QrCode className="h-5 w-5" />
                <h3 className="font-black">PIX da mensalidade</h3>
              </div>
              <p className="mt-2 text-sm text-zinc-400">
                Valor: <strong className="text-white">R$ {pixPayment.amount.toFixed(2).replace(".", ",")}</strong>
                {pixPayment.expiresAt ? ` · válido até ${dateLabel(pixPayment.expiresAt)}` : ""}
              </p>

              {pixPayment.qrCodeImageUrl ? (
                <div className="mx-auto mt-5 w-fit rounded-2xl bg-white p-3">
                  <img
                    src={pixPayment.qrCodeImageUrl}
                    alt="QR Code PIX da mensalidade"
                    className="h-52 w-52 object-contain"
                  />
                </div>
              ) : null}

              <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                <p className="break-all text-xs leading-5 text-zinc-300">{pixPayment.qrCodeText}</p>
              </div>
              <Button type="button" className="mt-3 w-full" onClick={() => void copyPix()}>
                <Copy className="mr-2 h-4 w-4" /> Copiar código PIX
              </Button>
              <p className="mt-3 text-center text-xs text-zinc-500">
                Estamos verificando o pagamento automaticamente.
              </p>
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Button type="button" onClick={() => void checkout()} disabled={busy !== null}>
              {busy === "checkout" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <QrCode className="mr-2 h-4 w-4" />
              )}
              {pixPayment ? "Gerar novo PIX" : "Pagar R$ 69,90 por PIX"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void reconcile(true)}
              disabled={busy !== null}
              className="border-zinc-800 bg-black"
            >
              {busy === "sync" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Já paguei · atualizar
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
