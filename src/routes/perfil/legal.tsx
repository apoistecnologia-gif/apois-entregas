import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileText, Shield, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/perfil/legal")({
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
  component: LegalPage,
});

function LegalPage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen w-full flex-col bg-black text-white overflow-hidden relative">
      <header className="shrink-0 z-50 flex items-center justify-between p-4 bg-black/80 backdrop-blur-lg border-b border-zinc-900">
        <button
          onClick={() => navigate({ to: "/perfil" })}
          className="p-2 rounded-full bg-zinc-900 shadow-lg"
        >
          <ArrowLeft className="w-5 h-5 text-zinc-300" />
        </button>
        <h1 className="text-xl font-bold text-primary text-center flex-1">Legal</h1>
        <div className="w-9" />
      </header>

      <main className="flex-1 overflow-y-auto p-6 scrollbar-none space-y-6">
        <div className="space-y-4">
          <button className="flex w-full items-center justify-between p-5 rounded-3xl bg-zinc-900/40 border border-zinc-900/50 active:scale-[0.98] transition-all">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-zinc-200">Termos de Uso</p>
                <p className="text-xs text-zinc-500">Regras e condições do serviço</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-700" />
          </button>

          <button className="flex w-full items-center justify-between p-5 rounded-3xl bg-zinc-900/40 border border-zinc-900/50 active:scale-[0.98] transition-all">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800">
                <Shield className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-zinc-200">Política de Privacidade</p>
                <p className="text-xs text-zinc-500">Como tratamos seus dados</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-700" />
          </button>
        </div>

        <section className="bg-zinc-900/20 rounded-3xl p-6 border border-zinc-900/50 space-y-4">
          <h2 className="text-xs font-bold text-primary uppercase tracking-widest">
            Informações Adicionais
          </h2>
          <div className="space-y-4 text-[11px] text-zinc-500 leading-relaxed">
            <p>
              O APOIS ENTREGA é uma plataforma de tecnologia que conecta usuários a estabelecimentos
              parceiros e entregadores independentes.
            </p>
            <p>Versão do Aplicativo: 1.0.0 (Build 2026.08.07)</p>
            <p className="pt-2 italic">© 2026 APOIS ENTREGA. Todos os direitos reservados.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
