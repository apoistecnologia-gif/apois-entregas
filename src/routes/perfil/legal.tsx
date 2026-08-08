import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileText, Scale, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/perfil/legal")({
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { session };
  },
  component: LegalPage,
});

function LegalPage() {
  const navigate = useNavigate();

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="z-50 flex shrink-0 items-center justify-between border-b border-zinc-900 bg-black/80 p-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => void navigate({ to: "/perfil" })}
          className="rounded-full bg-zinc-900 p-2 shadow-lg"
          aria-label="Voltar ao perfil"
        >
          <ArrowLeft className="h-5 w-5 text-zinc-300" />
        </button>
        <h1 className="flex-1 text-center text-xl font-bold text-primary">Legal</h1>
        <div className="w-9" />
      </header>

      <main className="scrollbar-none flex-1 space-y-6 overflow-y-auto p-6">
        <section className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-400">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-black text-amber-300">Documentação em revisão jurídica</h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                Os documentos definitivos serão publicados aqui antes da liberação comercial do aplicativo. A interface não apresenta termos fictícios ou incompletos como se já estivessem vigentes.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex w-full items-center justify-between rounded-3xl border border-zinc-900/50 bg-zinc-900/40 p-5">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-200">Termos de Uso</p>
                <p className="text-xs text-zinc-500">Aguardando versão jurídica definitiva</p>
              </div>
            </div>
            <span className="rounded-full bg-zinc-900 px-2 py-1 text-[9px] font-bold uppercase text-zinc-600">
              Pendente
            </span>
          </div>

          <div className="flex w-full items-center justify-between rounded-3xl border border-zinc-900/50 bg-zinc-900/40 p-5">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
                <Shield className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-200">Política de Privacidade</p>
                <p className="text-xs text-zinc-500">Aguardando versão jurídica definitiva</p>
              </div>
            </div>
            <span className="rounded-full bg-zinc-900 px-2 py-1 text-[9px] font-bold uppercase text-zinc-600">
              Pendente
            </span>
          </div>
        </section>

        <section className="space-y-4 rounded-3xl border border-zinc-900/50 bg-zinc-900/20 p-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-primary">Sobre a plataforma</h2>
          <div className="space-y-4 text-[11px] leading-relaxed text-zinc-500">
            <p>
              O APOIS Entregas é a plataforma tecnológica que organiza o fluxo entre clientes, estabelecimentos e entregadores dentro deste ecossistema.
            </p>
            <p>
              Os dados cadastrais da pessoa jurídica responsável, canal oficial para solicitações de privacidade, bases legais, prazos de retenção e regras comerciais serão incluídos na versão jurídica final.
            </p>
            <p className="pt-2 italic">© 2026 APOIS. Todos os direitos reservados.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
