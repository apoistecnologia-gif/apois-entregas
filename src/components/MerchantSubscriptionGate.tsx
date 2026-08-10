import { CreditCard, Loader2, LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type MerchantSubscriptionGateProps = {
  merchant: any;
  subscription: any;
  onRefresh: () => void | Promise<void>;
  onLogout: () => void | Promise<void>;
};

const dateLabel = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

function statusLabel(value: string | null | undefined) {
  switch (value) {
    case "authorized":
      return "Assinatura autorizada";
    case "pending":
      return "Pagamento pendente";
    case "paused":
      return "Assinatura pausada";
    case "cancelled":
    case "canceled":
      return "Assinatura cancelada";
    default:
      return value ? `Status: ${value}` : "Assinatura ainda não ativada";
  }
}

async function subscriptionErrorMessage(error: unknown): Promise<string> {
  const fallback = "Não foi possível abrir o pagamento da mensalidade.";
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

  const checkout = async () => {
    setBusy("checkout");
    setLastError(null);
    try {
      const returnUrl = `${window.location.origin}/merchant`;
      const { data, error } = await supabase.functions.invoke("merchant-subscription", {
        body: { action: "checkout", returnUrl },
      });
      if (error) throw error;
      if (data?.accessAllowed) {
        toast.success("Mensalidade confirmada. Acesso liberado.");
        await onRefresh();
        return;
      }
      const checkoutUrl = String(data?.checkoutUrl ?? "");
      if (!checkoutUrl) throw new Error("O Mercado Pago não retornou o link da assinatura.");
      window.location.assign(checkoutUrl);
    } catch (error: unknown) {
      const message = await subscriptionErrorMessage(error);
      setLastError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy("sync");
    setLastError(null);
    try {
      const { data, error } = await supabase.functions.invoke("merchant-subscription", {
        body: { action: "sync" },
      });
      if (error) throw error;
      if (data?.accessAllowed) {
        toast.success("Pagamento confirmado. Acesso liberado.");
        await onRefresh();
      } else {
        toast.info("O pagamento ainda não consta como aprovado no Mercado Pago.");
      }
    } catch (error: unknown) {
      const message = await subscriptionErrorMessage(error);
      setLastError(message);
      toast.error(message);
    } finally {
      setBusy(null);
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
            Quando uma cobrança mensal é aprovada, o acesso é liberado automaticamente. Se a
            mensalidade vencer sem pagamento aprovado, o painel operacional e novos pedidos ficam
            bloqueados até a regularização.
          </div>

          {lastError ? (
            <div className="mt-4 rounded-2xl border border-red-900/70 bg-red-950/30 p-4 text-sm text-red-200">
              <strong>Falha ao abrir o Mercado Pago:</strong> {lastError}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Button type="button" onClick={() => void checkout()} disabled={busy !== null}>
              {busy === "checkout" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-4 w-4" />
              )}
              Pagar R$ 69,90 / mês
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void sync()}
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
