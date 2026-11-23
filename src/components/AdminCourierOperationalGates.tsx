import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  merchantSubscriptionDateWarnings,
  paymentProviderBlockingOrders,
  type MerchantReadiness,
  type MerchantSubscriptionReadiness,
} from "@/lib/courier-operation-readiness";

type Setting = { key: string; value: unknown };

type Status = {
  safe2payBlocked: boolean;
  expiredMerchantNames: string[];
  payoutMode: string | null;
  paymentProvider: string | null;
};

function settingValue(settings: Setting[], key: string): unknown {
  return settings.find((setting) => setting.key === key)?.value ?? null;
}

export function AdminCourierOperationalGates() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      // All three tables are visible through the existing admin-only RLS
      // policies. Never use a privileged service key in the browser.
      const [settings, merchants, subscriptions] = await Promise.all([
        supabase
          .from("platform_settings")
          .select("key,value")
          .in("key", [
            "merchant_order_payment_provider",
            "safe2pay_provider_enabled",
            "courier_payout_mode",
          ]),
        supabase.from("merchants").select("id,name,is_active,approval_status,delivery_enabled"),
        supabase
          .from("merchant_subscriptions")
          .select("merchant_id,current_period_end,last_payment_status,created_at")
          .order("created_at", { ascending: false }),
      ]);
      if (settings.error || merchants.error || subscriptions.error) {
        throw settings.error ?? merchants.error ?? subscriptions.error;
      }
      const rows = (settings.data ?? []) as Setting[];
      const rawProvider = settingValue(rows, "merchant_order_payment_provider");
      const rawPayout = settingValue(rows, "courier_payout_mode");
      const rawFlag = settingValue(rows, "safe2pay_provider_enabled");
      const provider = typeof rawProvider === "string" ? rawProvider : null;
      const payoutMode = typeof rawPayout === "string" ? rawPayout : null;
      const enabled = rawFlag === true || rawFlag === "true";
      setStatus({
        paymentProvider: provider,
        payoutMode,
        safe2payBlocked: paymentProviderBlockingOrders(provider, enabled),
        expiredMerchantNames: merchantSubscriptionDateWarnings(
          (merchants.data ?? []) as MerchantReadiness[],
          (subscriptions.data ?? []) as MerchantSubscriptionReadiness[],
        ),
      });
      setError(false);
    } catch (cause) {
      console.warn("Admin courier operational readiness could not be loaded", cause);
      setStatus(null);
      setError(true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section
      data-apois-courier-operations-readiness
      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black">Prontidão para chamadas de entregadores</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Diagnóstico administrativo, somente leitura. Nenhuma cobrança ou assinatura é ativada
            aqui.
          </p>
        </div>
        <button
          type="button"
          aria-label="Atualizar diagnóstico operacional"
          disabled={busy}
          onClick={() => void refresh()}
          className="rounded-xl border border-zinc-700 p-2 text-zinc-200 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-amber-200">
          Não foi possível verificar as condições comerciais. Não considere os pedidos liberados sem
          confirmar os dados.
        </p>
      )}
      {!status && !error && (
        <p className="mt-3 text-xs text-zinc-400">Verificando condições de produção…</p>
      )}
      {status && (
        <div className="mt-4 space-y-3">
          {status.safe2payBlocked && (
            <div
              role="alert"
              className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-100"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="text-sm font-black">Novos pagamentos Pix não estão habilitados</p>
                <p className="mt-1 text-xs">
                  Safe2Pay foi selecionado como provedor de pedidos, mas está desativado. É
                  necessário homologar credenciais, recebedores e webhooks antes da ativação
                  financeira.
                </p>
              </div>
            </div>
          )}
          {status.expiredMerchantNames.length > 0 && (
            <div
              role="alert"
              className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-100"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="text-sm font-black">
                  Estabelecimentos com assinatura não comprovada no período atual
                </p>
                <p className="mt-1 text-xs">
                  {status.expiredMerchantNames.join(", ")}. Regularize por pagamento confirmado pelo
                  provedor; não altere a validade manualmente.
                </p>
              </div>
            </div>
          )}
          <p className="text-xs text-zinc-400">
            Provedor de pedidos: {status.paymentProvider ?? "não identificado"} · Repasse ao
            entregador:{" "}
            {status.payoutMode === "merchant_manual"
              ? "manual pelo estabelecimento"
              : (status.payoutMode ?? "não identificado")}
          </p>
          {!status.safe2payBlocked && status.expiredMerchantNames.length === 0 && (
            <p className="text-xs text-zinc-400">
              Sem bloqueios detectados nesses dois critérios. Isso não substitui teste real de
              pagamento, raio, GPS, notificação e aceite de entrega.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
