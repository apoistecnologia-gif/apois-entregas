import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CreditCard, Landmark } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/perfil/pagamentos")({
  ssr: false,
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
  component: PagamentosPage,
  head: () => ({ meta: [{ title: "Pagamentos | APOIS ENTREGA" }] }),
});

function PagamentosPage() {
  const navigate = useNavigate();

  const paymentMethods = [
    {
      id: "pix",
      label: "Pix",
      icon: Landmark,
      description: "Disponível para finalizar pedidos",
      color: "text-emerald-400",
      enabled: true,
    },
    {
      id: "card",
      label: "Cartão de Crédito/Débito",
      icon: CreditCard,
      description: "Ainda não habilitado",
      color: "text-blue-400",
      enabled: false,
    },
  ];

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="z-50 flex shrink-0 items-center justify-between border-b border-zinc-900 bg-black/80 px-4 pb-4 pt-[max(env(safe-area-inset-top),1.35rem)] backdrop-blur-lg">
        <button
          type="button"
          onClick={() => navigate({ to: "/perfil" })}
          className="grid h-11 w-11 place-items-center rounded-full bg-zinc-900 shadow-lg"
          aria-label="Voltar para o perfil"
        >
          <ArrowLeft className="h-6 w-6 text-zinc-300" />
        </button>
        <h1 className="flex-1 text-center text-xl font-bold text-primary">Pagamentos</h1>
        <div className="w-11" />
      </header>

      <main className="scrollbar-none flex-1 space-y-8 overflow-y-auto p-6 pb-10">
        <section className="space-y-4">
          <h2 className="ml-1 text-xs font-bold uppercase tracking-widest text-primary">
            Métodos de pagamento
          </h2>
          <div className="space-y-3">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className={`flex items-center justify-between rounded-2xl border p-4 ${
                  method.enabled
                    ? "border-primary/20 bg-primary/5"
                    : "border-zinc-900/50 bg-zinc-900/30 opacity-60"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`rounded-xl border border-zinc-800 bg-zinc-900 p-3 ${method.color}`}
                  >
                    <method.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-zinc-200">{method.label}</p>
                      {method.enabled ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase text-primary">
                          Disponível
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-zinc-500">{method.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="ml-1 text-center text-xs font-bold uppercase tracking-widest text-primary">
            Cartões salvos
          </h2>
          <div className="flex flex-col items-center justify-center space-y-4 rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-center">
            <div className="rounded-full bg-zinc-900/50 p-4 text-zinc-700">
              <CreditCard className="h-10 w-10" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-zinc-400">Cartões ainda não disponíveis</p>
              <p className="px-4 text-xs text-zinc-600">
                O cadastro de cartões só será liberado quando esse método estiver integrado e
                habilitado no checkout.
              </p>
            </div>
          </div>
        </section>

        <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="rounded-lg bg-primary/10 p-2">
            <Landmark className="h-4 w-4 text-primary" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold text-primary">Pagamento atual</p>
            <p className="text-[10px] leading-relaxed text-zinc-400">
              No momento, o checkout da APOIS ENTREGA aceita apenas PIX. A cobrança é criada pelo
              provedor de pagamentos integrado e o pedido só avança após a confirmação do pagamento.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
