import { CheckCircle2, ExternalLink, Landmark, Loader2, Unlink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type MpAccountStatus = {
  providerUserId: string | null;
  email: string | null;
  status: string;
  expiresAt: string | null;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastRefreshedAt: string | null;
};

type MpStatusResponse = {
  ok: boolean;
  connected: boolean;
  account: MpAccountStatus | null;
};

const dateLabel = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

/**
 * Popup .closed polling instead of postMessage: the callback is served from the
 * Supabase functions origin (not this app's origin) and already auto-closes itself
 * on completion. Watching `.closed` needs no cross-origin trust and no message
 * handler to get wrong — it works the same whether the merchant finished the OAuth
 * flow or just closed the tab.
 */
function waitForPopupToClose(popup: Window, timeoutMs = 5 * 60 * 1000): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      if (popup.closed || Date.now() - startedAt > timeoutMs) {
        window.clearInterval(interval);
        resolve();
      }
    }, 600);
  });
}

function openAuthorizationPopup(url: string): Window | null {
  const width = 520;
  const height = 720;
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
  return window.open(
    url,
    "apois-mercadopago-oauth",
    `width=${width},height=${height},left=${left},top=${top}`,
  );
}

export function MerchantMercadoPagoConnectCard() {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<MpAccountStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<MpStatusResponse>(
        "merchant-mercadopago-oauth",
        { body: { action: "status" } },
      );
      if (error || !data) throw error ?? new Error("empty_response");
      setConnected(Boolean(data.connected));
      setAccount(data.account ?? null);
      setStatusError(null);
    } catch {
      setStatusError("Não foi possível consultar o status da conexão com o Mercado Pago.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const connect = async () => {
    if (connecting) return;
    setConnecting(true);
    setStatusError(null);
    try {
      const { data, error } = await supabase.functions.invoke<{ authorizationUrl?: string }>(
        "merchant-mercadopago-oauth",
        { body: { action: "start" } },
      );
      if (error || !data?.authorizationUrl) {
        throw new Error("Não foi possível iniciar a conexão com o Mercado Pago.");
      }

      const popup = openAuthorizationPopup(data.authorizationUrl);
      if (!popup) {
        throw new Error(
          "Seu navegador bloqueou a janela de autorização. Permita pop-ups para este site e tente novamente.",
        );
      }

      await waitForPopupToClose(popup);
      await loadStatus();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível concluir a conexão.";
      setStatusError(message);
      toast.error(message);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke("merchant-mercadopago-oauth", {
        body: { action: "disconnect" },
      });
      if (error) throw error;
      toast.success("Conta Mercado Pago desconectada.");
      await loadStatus();
    } catch {
      toast.error("Não foi possível desconectar agora.");
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Landmark className="h-4.5 w-4.5" />
        </div>
        <h2 className="font-black">Recebimento via Mercado Pago</h2>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando status da conexão...
        </div>
      ) : statusError ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-200">
            {statusError}
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-zinc-800 bg-black"
            onClick={() => void loadStatus()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-3 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold">Mercado Pago conectado</p>
              {account?.email ? (
                <p className="text-xs text-emerald-400/80">{account.email}</p>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            Conectado em {dateLabel(account?.connectedAt)}. Os pagamentos dos pedidos são
            depositados diretamente nesta conta.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={disconnecting}
            onClick={() => void disconnect()}
            className="border-zinc-800 bg-black text-red-300 hover:text-red-200"
          >
            {disconnecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Unlink className="mr-2 h-4 w-4" />
            )}
            Desconectar
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">
            Conecte a conta Mercado Pago do estabelecimento para receber os pagamentos PIX dos
            pedidos diretamente, sem intermediação de saldo.
          </p>
          <Button type="button" disabled={connecting} onClick={() => void connect()}>
            {connecting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="mr-2 h-4 w-4" />
            )}
            {connecting ? "Aguardando autorização..." : "Conectar Mercado Pago"}
          </Button>
        </div>
      )}
    </section>
  );
}
