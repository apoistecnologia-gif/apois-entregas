import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Crown, Check, ChevronRight, Zap, ShoppingBag, Gift } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/apois-plus")({
  ssr: false,
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
  component: ApoisPlusPage,
});

function ApoisPlusPage() {
  const navigate = useNavigate();

  const benefits = [
    {
      title: "Frete Grátis",
      desc: "Em milhares de estabelecimentos selecionados.",
      icon: ShoppingBag,
    },
    {
      title: "Ofertas Exclusivas",
      desc: "Preços especiais que só membros Plus podem ver.",
      icon: Tag,
    },
    {
      title: "Suporte Prioritário",
      desc: "Atendimento rápido quando você mais precisar.",
      icon: Zap,
    },
    {
      title: "Brindes Mensais",
      desc: "Cupons e surpresas especiais todo mês.",
      icon: Gift,
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
        <h1 className="text-xl font-bold text-primary text-center flex-1">APOIS+</h1>
        <div className="w-9" />
      </header>

      <main className="flex-1 overflow-y-auto p-6 scrollbar-none space-y-8">
        {/* Hero Section */}
        <section className="flex flex-col items-center text-center space-y-4 py-6">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
            <div className="relative w-24 h-24 rounded-full bg-zinc-900 border-2 border-primary flex items-center justify-center shadow-[0_0_30px_rgba(255,215,0,0.3)]">
              <Crown className="w-12 h-12 text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black tracking-tighter italic">
              APOIS<span className="text-primary">+</span>
            </h2>
            <p className="text-zinc-400 text-sm max-w-[250px]">
              A experiência definitiva em delivery está chegando.
            </p>
          </div>
        </section>

        {/* Benefits */}
        <section className="space-y-4">
          <h3 className="text-xs font-bold text-primary uppercase tracking-widest ml-1">
            Benefícios Premium
          </h3>
          <div className="grid gap-3">
            {benefits.map((benefit, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4 rounded-3xl bg-zinc-900/40 border border-zinc-900/50"
              >
                <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-primary">
                  <benefit.icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-200">{benefit.title}</p>
                  <p className="text-xs text-zinc-500">{benefit.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Status */}
        <section className="bg-primary/5 border border-primary/20 rounded-3xl p-8 flex flex-col items-center text-center space-y-4 shadow-[0_10px_40px_-15px_rgba(255,215,0,0.15)]">
          <div className="px-3 py-1 bg-primary text-black text-[10px] font-black uppercase tracking-widest rounded-full">
            Em Breve
          </div>
          <p className="text-zinc-300 text-sm font-medium leading-relaxed">
            Estamos finalizando o plano comercial para garantir a você as melhores vantagens do
            mercado.
          </p>
          <button
            disabled
            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-600 font-bold py-4 rounded-2xl cursor-not-allowed"
          >
            Quero entrar na fila
          </button>
        </section>
      </main>
    </div>
  );
}

// Fixed missing import in benefits array
import { Tag } from "lucide-react";
