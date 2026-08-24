import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { GoogleLoginButton } from "@/components/GoogleLoginButton";
import { ArrowRight, Clock3, MapPin, ShieldCheck } from "lucide-react";
import { useEffect } from "react";
import {
  getApoisProductMode,
  getProductLabel,
  getProductLandingRoute,
} from "@/lib/product-routing";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => {
    const landingRoute = getProductLandingRoute();
    if (landingRoute !== "/") {
      const productLabel = getProductLabel();
      return {
        title: productLabel,
        meta: [
          {
            name: "description",
            content: `${productLabel} — acesso seguro ao ecossistema APOIS ENTREGAS.`,
          },
        ],
      };
    }

    return {
      title: "APOIS ENTREGAS",
      meta: [
        {
          name: "description",
          content: "Peça comida, mercado, farmácia e lojas com rapidez e segurança.",
        },
      ],
    };
  },
});

function Index() {
  const navigate = useNavigate();
  const landingRoute = getProductLandingRoute();

  useEffect(() => {
    if (landingRoute === "/") return;

    let cancelled = false;
    void (async () => {
      if (getApoisProductMode() === "merchant") {
        await supabase.auth.signOut({ scope: "local" });
      }
      if (!cancelled) {
        await navigate({ to: landingRoute, replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [landingRoute, navigate]);

  if (landingRoute !== "/") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-black px-6 text-center">
        <div className="text-lg font-black tracking-[0.08em] text-white">APOIS</div>
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
          {getProductLabel()}
        </div>
        <div className="text-sm text-zinc-500">Abrindo o acesso correto…</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(200,138,8,0.16),transparent_60%)]" />
      <div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-[#F6BE1C]/[0.08] blur-[110px]" />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[460px] flex-col px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <header className="flex justify-center pt-1">
          <img
            src="/apois-logo.svg"
            alt="APOIS Entregas"
            className="h-auto w-[255px] max-w-[78vw] object-contain"
          />
        </header>

        <main className="flex-none py-5">
          <div className="mx-auto w-full max-w-[390px] text-center">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.28em] text-[#F6BE1C]">
              Delivery simples. Do seu jeito.
            </p>

            <h1 className="text-[38px] font-black leading-[1.03] tracking-[-0.045em] text-white">
              Pediu? <span className="text-[#F6BE1C]">Apois,</span>
              <br />
              <span className="text-[#C88A08]">chegou.</span>
            </h1>

            <p className="mx-auto mt-4 max-w-[320px] text-[15px] leading-6 text-zinc-400">
              Seus restaurantes, mercados e lojas favoritos em um só lugar, com entrega acompanhada em tempo real.
            </p>

            <div className="mt-6 grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-2 py-3">
                <Clock3 className="mx-auto h-5 w-5 text-[#F6BE1C]" strokeWidth={1.9} />
                <span className="mt-2 block text-[10px] font-semibold text-zinc-300">Rápido</span>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-2 py-3">
                <MapPin className="mx-auto h-5 w-5 text-[#C88A08]" strokeWidth={1.9} />
                <span className="mt-2 block text-[10px] font-semibold text-zinc-300">Em tempo real</span>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-2 py-3">
                <ShieldCheck className="mx-auto h-5 w-5 text-[#F6BE1C]" strokeWidth={1.9} />
                <span className="mt-2 block text-[10px] font-semibold text-zinc-300">Seguro</span>
              </div>
            </div>
          </div>
        </main>

        <div className="w-full shrink-0 space-y-2.5">
          <Button
            type="button"
            onClick={() => navigate({ to: "/register" })}
            className="flex h-[54px] w-full items-center justify-between rounded-[18px] border-0 bg-[#F6BE1C] px-6 text-[16px] font-black text-black shadow-[0_12px_35px_rgba(246,190,28,0.18)] transition-all hover:bg-[#f7ca48] active:scale-[0.985]"
          >
            <span>Criar minha conta</span>
            <ArrowRight className="h-5 w-5" />
          </Button>

          <Button
            type="button"
            onClick={() => navigate({ to: "/login" })}
            variant="outline"
            className="h-[54px] w-full rounded-[18px] border-white/10 bg-white/[0.03] text-[16px] font-bold text-white hover:border-[#C88A08]/50 hover:bg-white/[0.06] active:scale-[0.985]"
          >
            Já tenho conta
          </Button>

          <GoogleLoginButton />

          <p className="px-5 pt-0.5 text-center text-[10px] leading-relaxed text-zinc-600">
            Ao continuar, você concorda com nossos{" "}
            <button
              type="button"
              onClick={() => navigate({ to: "/termos" })}
              className="text-zinc-500 underline underline-offset-2"
            >
              Termos de Uso
            </button>{" "}
            e{" "}
            <button
              type="button"
              onClick={() => navigate({ to: "/privacidade" })}
              className="text-zinc-500 underline underline-offset-2"
            >
              Privacidade
            </button>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
