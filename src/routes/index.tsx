import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/logo.png.asset.json";
import { ArrowRight, User } from "lucide-react";
import heroImage from "@/assets/delivery-hero.png.asset.json";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    title: "APOIS ENTREGA - Seu delivery do seu jeito",
    meta: [
      { name: "description", content: "Peça comida, mercado, farmácia e lojas com rapidez e segurança." },
    ],
  }),
});

function Index() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col bg-black text-white min-h-full overflow-hidden w-full relative font-sans">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[20%] w-[60%] h-[40%] bg-[#FFD700]/5 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] -right-[10%] w-[40%] h-[30%] bg-[#FFD700]/10 blur-[100px] rounded-full" />
      </div>

      {/* Official Logo Header */}
      <header className="flex flex-col items-center pt-6 pb-1 px-6 shrink-0 z-20">
        <img 
          src={logoAsset.url} 
          alt="APOIS ENTREGA" 
          className="w-24 h-auto object-contain mb-3"
        />
        
        <div className="text-center space-y-0.5">
          <h1 className="text-[18px] font-bold tracking-tight">
            Seu delivery <span className="text-[#FFD700]">do seu jeito</span>
          </h1>
          <p className="text-zinc-400 text-[11px] font-light leading-relaxed max-w-[240px] mx-auto opacity-80">
            Pediu, chegou. Apois, vamo comer?
          </p>
        </div>
      </header>

      {/* Visual Composition / Hero area with Animated Map/Pin */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-4 overflow-hidden z-10 py-2">
        <div className="relative w-full h-full max-h-[340px] flex items-center justify-center origin-center">

          {/* Main Delivery Visual */}
          <div className="relative w-full h-full flex items-center justify-center">
             <img 
              src={heroImage.url}
              alt=""
              className="w-full h-full object-contain opacity-60 scale-110"
              style={{ 
                maskImage: 'radial-gradient(circle at center, black 60%, transparent 100%)',
                WebkitMaskImage: 'radial-gradient(circle at center, black 60%, transparent 100%)'
              }}
            />

            {/* Pulsing Location Ring */}
            <div className="absolute top-[22%] right-[28%] w-12 h-12 pointer-events-none">
              <div className="absolute inset-0 bg-[#FFD700]/20 rounded-full animate-ping" />
              <div className="absolute inset-0 bg-[#FFD700]/10 rounded-full animate-pulse scale-150" />
            </div>

            {/* Premium Animated Location Pin */}
            <div className="absolute top-[22%] right-[28%] w-8 h-8 text-[#FFD700] drop-shadow-[0_0_15px_rgba(255,215,0,0.8)] animate-[bounce_2s_infinite]">
              <div className="relative">
                 <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
                {/* Secondary glow */}
                <div className="absolute inset-0 bg-[#FFD700]/30 blur-md rounded-full -z-10 animate-pulse" />
              </div>
            </div>

            {/* Trace Lines (Optional decorative) */}
            <div className="absolute bottom-[20%] left-[10%] w-[80%] h-[1px] bg-gradient-to-r from-transparent via-[#FFD700]/20 to-transparent blur-sm" />
          </div>
        </div>
      </div>

      {/* Main Actions */}
      <div className="px-7 space-y-3 pb-7 w-full shrink-0 relative z-20">
        <Button 
          onClick={() => navigate({ to: "/register" })}
          className="w-full bg-[#FFD700] hover:bg-[#FFC000] text-black font-extrabold h-[50px] text-[14px] rounded-[16px] flex items-center justify-between px-6 transition-all active:scale-[0.98] shadow-[0_8px_25px_rgba(255,215,0,0.25)] relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out skew-x-[-20deg]" />
          <span className="relative z-10">Criar minha conta</span>
          <ArrowRight className="w-5 h-5 relative z-10" />
        </Button>
        
        <Button 
          onClick={() => navigate({ to: "/login" })}
          variant="outline" 
          className="w-full border-zinc-800 bg-zinc-900/50 text-white hover:bg-white/5 font-bold h-[50px] text-[14px] rounded-[16px] transition-all active:scale-[0.98] backdrop-blur-sm"
        >
          Entrar
        </Button>

        <button 
          className="w-full flex items-center justify-center gap-2 py-1 text-[#FFD700] hover:opacity-80 transition-opacity text-[12px] font-semibold"
        >
          <User className="w-4 h-4" />
          <span>Continuar como visitante</span>
        </button>

        <p className="text-[9px] text-zinc-600 text-center px-4 leading-relaxed mt-0.5 opacity-70">
          Ao continuar, você concorda com nossos <br />
          <span className="text-zinc-500 font-medium">Termos de Uso</span> e <span className="text-zinc-500 font-medium">Privacidade</span>.
        </p>
      </div>
    </div>
  );
}
