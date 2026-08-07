import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/logo.png.asset.json";
import { ArrowRight, UtensilsCrossed, ShoppingBasket, Pill, ShoppingBag, User } from "lucide-react";
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
    <div className="flex flex-col bg-black text-white h-dvh overflow-hidden max-w-[500px] mx-auto relative font-sans">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[20%] w-[60%] h-[40%] bg-[#FFD700]/5 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] -right-[10%] w-[40%] h-[30%] bg-[#FFD700]/10 blur-[100px] rounded-full" />
      </div>

      {/* Official Logo Header */}
      <header className="flex flex-col items-center pt-8 pb-2 px-6 shrink-0 z-20">
        <img 
          src={logoAsset.url} 
          alt="APOIS ENTREGA" 
          className="w-28 h-auto object-contain mb-4"
        />
        
        <div className="text-center space-y-1">
          <h1 className="text-[20px] font-bold tracking-tight">
            Seu delivery <span className="text-[#FFD700]">do seu jeito</span>
          </h1>
          <p className="text-zinc-400 text-[12px] font-light leading-relaxed max-w-[240px] mx-auto opacity-80">
            Pediu, chegou. Apois, vamo comer?
          </p>
        </div>
      </header>

      {/* Visual Composition / Hero area with Animated Map/Pin */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-4 overflow-hidden z-10">
        <div className="relative w-full h-full max-h-[360px] flex items-center justify-center">
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
            <div className="absolute top-[22%] right-[28%] w-16 h-16 pointer-events-none">
              <div className="absolute inset-0 bg-[#FFD700]/20 rounded-full animate-ping" />
              <div className="absolute inset-0 bg-[#FFD700]/10 rounded-full animate-pulse scale-150" />
            </div>

            {/* Premium Animated Location Pin */}
            <div className="absolute top-[22%] right-[28%] w-10 h-10 text-[#FFD700] drop-shadow-[0_0_15px_rgba(255,215,0,0.8)] animate-[bounce_2s_infinite]">
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

      {/* Service Grid Cards */}
      <div className="px-6 grid grid-cols-4 gap-3 mb-6 shrink-0 relative z-20">
        {[
          { icon: UtensilsCrossed, label: "Comida" },
          { icon: ShoppingBasket, label: "Mercado" },
          { icon: Pill, label: "Farmácia" },
          { icon: ShoppingBag, label: "Lojas" },
        ].map((item, idx) => (
          <div key={idx} className="group flex flex-col items-center py-3.5 px-1 rounded-2xl border border-white/5 bg-zinc-900/40 backdrop-blur-xl text-center transition-all active:scale-90 hover:border-[#FFD700]/30 shadow-lg">
            <div className="w-9 h-9 flex items-center justify-center mb-1.5 rounded-full bg-white/5 group-hover:bg-[#FFD700]/10 transition-colors">
              <item.icon className="w-5 h-5 text-[#FFD700]" strokeWidth={2} />
            </div>
            <span className="text-[10px] font-bold text-zinc-100 block">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Main Actions */}
      <div className="px-7 space-y-3 pb-8 w-full shrink-0 relative z-20">
        <Button 
          onClick={() => navigate({ to: "/register" })}
          className="w-full bg-[#FFD700] hover:bg-[#FFC000] text-black font-extrabold h-[56px] text-[15px] rounded-[18px] flex items-center justify-between px-6 transition-all active:scale-[0.98] shadow-[0_8px_25px_rgba(255,215,0,0.25)] relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out skew-x-[-20deg]" />
          <span className="relative z-10">Criar minha conta</span>
          <ArrowRight className="w-5 h-5 relative z-10" />
        </Button>
        
        <Button 
          onClick={() => navigate({ to: "/login" })}
          variant="outline" 
          className="w-full border-zinc-800 bg-zinc-900/50 text-white hover:bg-white/5 font-bold h-[56px] text-[15px] rounded-[18px] transition-all active:scale-[0.98] backdrop-blur-sm"
        >
          Entrar
        </Button>

        <button 
          className="w-full flex items-center justify-center gap-2 py-2 text-[#FFD700] hover:opacity-80 transition-opacity text-[13px] font-semibold"
        >
          <User className="w-4 h-4" />
          <span>Continuar como visitante</span>
        </button>

        <p className="text-[10px] text-zinc-600 text-center px-4 leading-relaxed mt-1 opacity-70">
          Ao continuar, você concorda com nossos <br />
          <span className="text-zinc-500 font-medium">Termos de Uso</span> e <span className="text-zinc-500 font-medium">Privacidade</span>.
        </p>
      </div>
    </div>
  );
}
