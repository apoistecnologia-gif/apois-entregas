import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, Bike, MapPin, PackageCheck, Store } from "lucide-react";
import { getProductLandingRoute } from "@/lib/product-routing";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const landingRoute = getProductLandingRoute();
    if (landingRoute !== "/") throw redirect({ to: landingRoute });
  },
  component: Index,
  head: () => ({
    title: "APOIS ENTREGA - Seu delivery do seu jeito",
    meta: [
      {
        name: "description",
        content: "Peça comida, mercado, farmácia e lojas com rapidez e segurança.",
      },
    ],
  }),
});

function Index() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-black text-white font-sans">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-28 h-72 w-72 rounded-full bg-[#FFD700]/8 blur-[110px]" />
        <div className="absolute -right-20 top-[28%] h-64 w-64 rounded-full bg-[#FFD700]/10 blur-[110px]" />
        <div className="absolute bottom-0 left-1/2 h-48 w-[90%] -translate-x-1/2 rounded-full bg-[#FFD700]/5 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <header className="flex shrink-0 flex-col items-center text-center">
          <div className="mb-5 flex items-center gap-3" aria-label="APOIS ENTREGA">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-[14px] border border-[#FFD700]/30 bg-[#0b0b0b] shadow-[0_0_30px_rgba(255,215,0,0.12)]">
              <img
                src="/favicon.png"
                alt=""
                className="h-9 w-9 object-contain"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
              <span className="absolute text-lg font-black text-[#FFD700]" aria-hidden="true">
                A
              </span>
            </div>
            <div className="text-left leading-none">
              <div className="text-[19px] font-black tracking-[0.08em]">APOIS</div>
              <div className="mt-1 text-[12px] font-semibold tracking-[0.24em] text-zinc-400">ENTREGA</div>
            </div>
          </div>

          <h1 className="text-[27px] font-black leading-tight tracking-[-0.04em] sm:text-[30px]">
            Seu delivery <span className="text-[#FFD700]">do seu jeito</span>
          </h1>
          <p className="mt-2 text-[14px] font-medium text-zinc-500">Pediu, chegou. Apois, vamo comer?</p>
        </header>

        <main className="flex flex-1 flex-col justify-center py-5">
          <div className="relative mx-auto w-full max-w-[390px] overflow-hidden rounded-[30px] border border-white/[0.06] bg-gradient-to-b from-zinc-950 to-black px-5 py-6 shadow-[0_26px_70px_rgba(0,0,0,0.5)]">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.14]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,215,0,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(255,215,0,.28) 1px, transparent 1px)",
                backgroundSize: "34px 34px",
                maskImage: "radial-gradient(circle at center, black 20%, transparent 78%)",
                WebkitMaskImage: "radial-gradient(circle at center, black 20%, transparent 78%)",
              }}
            />

            <div className="relative h-[210px] w-full">
              <div className="absolute left-4 top-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 shadow-xl">
                <Store className="h-6 w-6 text-white" strokeWidth={1.8} />
              </div>

              <div className="absolute right-3 top-[45%] flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFD700] text-black shadow-[0_0_35px_rgba(255,215,0,0.28)]">
                <PackageCheck className="h-7 w-7" strokeWidth={2.2} />
              </div>

              <svg
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 340 210"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M54 43 C 104 38, 86 118, 148 118 S 222 70, 278 110"
                  stroke="rgba(255,215,0,.25)"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
                <path
                  d="M54 43 C 104 38, 86 118, 148 118 S 222 70, 278 110"
                  stroke="#FFD700"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="8 11"
                />
              </svg>

              <div className="absolute left-[40%] top-[47%] flex h-11 w-11 items-center justify-center rounded-full border border-[#FFD700]/25 bg-black shadow-[0_0_22px_rgba(255,215,0,0.15)]">
                <Bike className="h-5 w-5 text-[#FFD700]" strokeWidth={2} />
              </div>

              <div className="absolute bottom-1 left-3 flex items-center gap-2 rounded-full border border-white/[0.06] bg-black/80 px-3 py-2 backdrop-blur">
                <MapPin className="h-4 w-4 text-[#FFD700]" fill="#FFD700" strokeWidth={1.5} />
                <span className="text-[11px] font-semibold text-zinc-300">Entrega acompanhada em tempo real</span>
              </div>
            </div>
          </div>
        </main>

        <div className="w-full shrink-0 space-y-3">
          <Button
            type="button"
            onClick={() => navigate({ to: "/register" })}
            className="group relative flex h-[58px] w-full items-center justify-between overflow-hidden rounded-[20px] bg-[#FFD700] px-6 text-[16px] font-black text-black shadow-[0_10px_35px_rgba(255,215,0,0.22)] transition-all hover:bg-[#FFC800] active:scale-[0.985]"
          >
            <div className="absolute inset-0 -translate-x-full skew-x-[-20deg] bg-white/15 transition-transform duration-700 ease-out group-hover:translate-x-full" />
            <span className="relative z-10">Criar minha conta</span>
            <ArrowRight className="relative z-10 h-5 w-5" />
          </Button>

          <Button
            type="button"
            onClick={() => navigate({ to: "/login" })}
            variant="outline"
            className="h-[58px] w-full rounded-[20px] border-zinc-800 bg-zinc-950/80 text-[16px] font-bold text-white backdrop-blur transition-all hover:bg-zinc-900 active:scale-[0.985]"
          >
            Entrar
          </Button>

          <p className="px-4 pt-1 text-center text-[10px] leading-relaxed text-zinc-600">
            Ao continuar, você concorda com nossos{" "}
            <button
              type="button"
              onClick={() => navigate({ to: "/termos" })}
              className="font-medium text-zinc-500 underline underline-offset-2"
            >
              Termos de Uso
            </button>{" "}
            e{" "}
            <button
              type="button"
              onClick={() => navigate({ to: "/privacidade" })}
              className="font-medium text-zinc-500 underline underline-offset-2"
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
