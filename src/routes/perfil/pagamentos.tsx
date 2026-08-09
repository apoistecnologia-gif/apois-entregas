import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CreditCard, Landmark, Wallet, Plus, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/perfil/pagamentos")({
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
    return { session };
  },
  component: PagamentosPage,
});

function PagamentosPage() {
  const navigate = useNavigate();

  const paymentMethods = [
    {
      id: "pix",
      label: "Pix",
      icon: Landmark,
      description: "Pagamento instantâneo",
      color: "text-emerald-400",
    },
    {
      id: "card",
      label: "Cartão de Crédito/Débito",
      icon: CreditCard,
      description: "Visa, Mastercard, Elo",
      color: "text-blue-400",
    },
    {
      id: "money",
      label: "Dinheiro",
      icon: Wallet,
      description: "Pagamento na entrega",
      color: "text-primary",
    },
  ];

  return (
    <div className="flex h-screen w-full flex-col bg-black text-white overflow-hidden relative">
      <header className="shrink-0 z-50 flex items-center justify-between p-4 bg-black/80 backdrop-blur-lg border-b border-zinc-900">
        <button
          onClick={() => navigate({ to: "/perfil" })}
          className="p-2 rounded-full bg-zinc-900 shadow-lg"
        >
          <ArrowLeft className="w-5 h-5 text-zinc-300" />
        </button>
        <h1 className="text-xl font-bold text-primary text-center flex-1">Pagamentos</h1>
        <div className="w-9" />
      </header>

      <main className="flex-1 overflow-y-auto p-6 scrollbar-none space-y-8">
        <section className="space-y-4">
          <h2 className="text-xs font-bold text-primary uppercase tracking-widest ml-1">
            Métodos disponíveis
          </h2>
          <div className="space-y-3">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900/40 border border-zinc-900/50 backdrop-blur-sm"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`p-3 rounded-xl bg-zinc-900 border border-zinc-800 ${method.color}`}
                  >
                    <method.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-zinc-200">{method.label}</p>
                    <p className="text-xs text-zinc-500">{method.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-bold text-primary uppercase tracking-widest ml-1 text-center">
            Cartões Salvos
          </h2>
          <div className="p-8 rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/20 flex flex-col items-center justify-center text-center space-y-4">
            <div className="p-4 rounded-full bg-zinc-900/50 text-zinc-700">
              <CreditCard className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-zinc-400">Nenhum cartão salvo</p>
              <p className="text-xs text-zinc-600 px-4">
                Por segurança, cartões salvos serão configurados quando integrarmos nosso provedor
                de pagamentos oficial.
              </p>
            </div>
            <button className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-zinc-900 text-zinc-400 font-bold text-xs opacity-50 cursor-not-allowed border border-zinc-800">
              <Plus className="w-4 h-4" />
              Adicionar cartão (Em breve)
            </button>
          </div>
        </section>

        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Landmark className="w-4 h-4 text-primary" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold text-primary">Pagamento Seguro</p>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              O APOIS utiliza criptografia de ponta a ponta. Seus dados financeiros são processados
              por parceiros certificados PCI-DSS.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
