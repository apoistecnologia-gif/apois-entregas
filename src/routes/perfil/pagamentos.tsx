import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CircleDollarSign, CreditCard, ShieldCheck, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/perfil/pagamentos")({
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { session };
  },
  component: PagamentosPage,
});

function PagamentosPage() {
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
        <h1 className="flex-1 text-center text-xl font-bold text-primary">Pagamentos</h1>
        <div className="w-9" />
      </header>

      <main className="scrollbar-none flex-1 space-y-7 overflow-y-auto p-6">
        <section className="rounded-3xl border border-primary/25 bg-primary/5 p-5">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <CircleDollarSign className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black">PIX</h2>
                <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-green-400">
                  Disponível
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                O PIX é gerado para cada pedido e processado pela integração OpenPix/Woovi.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="ml-1 text-xs font-bold uppercase tracking-widest text-zinc-500">
            Outras formas
          </h2>
          <div className="grid gap-3">
            <div className="flex items-center gap-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-4 text-zinc-600">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-zinc-900">
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-bold">Cartão de crédito/débito</p>
                <p className="text-xs">Indisponível até a integração de um adquirente.</p>
              </div>
              <span className="text-[10px] font-bold uppercase">Em breve</span>
            </div>
            <div className="flex items-center gap-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-4 text-zinc-600">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-zinc-900">
                <Wallet className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-bold">Dinheiro na entrega</p>
                <p className="text-xs">Indisponível enquanto a conciliação de dinheiro não estiver implementada.</p>
              </div>
              <span className="text-[10px] font-bold uppercase">Indisponível</span>
            </div>
          </div>
        </section>

        <section className="flex items-start gap-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <div className="rounded-lg bg-primary/10 p-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-bold text-primary">Cobrança no servidor</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              O aplicativo não armazena credenciais financeiras. A cobrança PIX é criada no backend e a confirmação chega por webhook do provedor.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
