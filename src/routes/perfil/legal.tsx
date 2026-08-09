import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, FileText, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/perfil/legal")({
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
  component: LegalPage,
  head: () => ({ meta: [{ title: "Legal | APOIS ENTREGA" }] }),
});

function LegalPage() {
  const navigate = useNavigate();

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="z-50 flex shrink-0 items-center justify-between border-b border-zinc-900 bg-black/80 p-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => navigate({ to: "/perfil" })}
          className="rounded-full bg-zinc-900 p-2 shadow-lg"
          aria-label="Voltar para o perfil"
        >
          <ArrowLeft className="h-5 w-5 text-zinc-300" />
        </button>
        <h1 className="flex-1 text-center text-xl font-bold text-primary">Legal</h1>
        <div className="w-9" />
      </header>

      <main className="scrollbar-none flex-1 space-y-6 overflow-y-auto p-6">
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => navigate({ to: "/termos" })}
            className="flex w-full items-center justify-between rounded-3xl border border-zinc-900/50 bg-zinc-900/40 p-5 text-left transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-200">Termos de Uso</p>
                <p className="text-xs text-zinc-500">Regras e condições do serviço</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-zinc-700" />
          </button>

          <button
            type="button"
            onClick={() => navigate({ to: "/privacidade" })}
            className="flex w-full items-center justify-between rounded-3xl border border-zinc-900/50 bg-zinc-900/40 p-5 text-left transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
                <Shield className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-200">Política de Privacidade</p>
                <p className="text-xs text-zinc-500">Como tratamos e protegemos seus dados</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-zinc-700" />
          </button>
        </div>

        <section className="space-y-4 rounded-3xl border border-zinc-900/50 bg-zinc-900/20 p-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-primary">
            Informações adicionais
          </h2>
          <div className="space-y-4 text-[11px] leading-relaxed text-zinc-500">
            <p>
              O APOIS ENTREGA é uma plataforma de tecnologia que conecta usuários a estabelecimentos
              parceiros e entregadores independentes.
            </p>
            <p>Versão dos documentos legais: 09/08/2026.</p>
            <p className="pt-2 italic">© 2026 APOIS ENTREGA. Todos os direitos reservados.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
