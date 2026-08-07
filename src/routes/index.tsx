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
      {/* Official Logo Header */}
      <header className="flex flex-col items-center pt-10 pb-4 px-6 shrink-0">
        <img 
          src={logoAsset.url} 
          alt="APOIS ENTREGA" 
          className="w-32 h-auto object-contain mb-5"
        />
        
        <div className="text-center space-y-2">
          <h1 className="text-[22px] font-bold tracking-tight">
            Seu delivery <span className="text-[#FFD700]">do seu jeito</span>
          </h1>
          <p className="text-zinc-400 text-[13px] font-light leading-relaxed max-w-[240px] mx-auto">
            Peça comida, mercado, farmácia e lojas com rapidez e segurança.
          </p>
        </div>
      </header>

      {/* Visual Composition / Hero area */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-4 overflow-hidden z-10">
        <div className="relative w-full h-full max-h-[320px] flex items-center justify-center scale-110">
          <img 
            src={heroImage.url}
            alt=""
            className="w-full h-full object-contain opacity-70"
            style={{ 
              maskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)'
            }}
          />
          
          {/* Decorative Location Pin */}
          <div className="absolute top-[15%] right-[20%] w-8 h-8 text-[#FFD700] drop-shadow-[0_0_20px_rgba(255,215,0,0.6)] animate-bounce">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Service Grid Cards */}
      <div className="px-6 grid grid-cols-4 gap-3 mb-8 shrink-0 relative z-20">
        {[
          { icon: UtensilsCrossed, label: "Comida", sub: "do seu jeito" },
          { icon: ShoppingBasket, label: "Mercado", sub: "em casa" },
          { icon: Pill, label: "Farmácia", sub: "agora" },
          { icon: ShoppingBag, label: "Lojas", sub: "prático" },
        ].map((item, idx) => (
          <div key={idx} className="flex flex-col items-center py-3 px-1 rounded-2xl border border-white/10 bg-zinc-900/40 backdrop-blur-md text-center transition-transform active:scale-95">
            <div className="w-8 h-8 flex items-center justify-center mb-2">
              <item.icon className="w-5 h-5 text-[#FFD700]" strokeWidth={1.5} />
            </div>
            <span className="text-[10px] font-bold text-white block truncate w-full">{item.label}</span>
            <span className="text-[8px] text-zinc-500 block leading-tight mt-0.5 opacity-80">{item.sub}</span>
          </div>
        ))}
      </div>

      {/* Main Actions */}
      <div className="px-7 space-y-3 pb-10 w-full shrink-0 relative z-20">
        <Button 
          onClick={() => navigate({ to: "/register" })}
          className="w-full bg-[#FFD700] hover:bg-[#FFC000] text-black font-bold h-[54px] text-[15px] rounded-[16px] flex items-center justify-between px-6 transition-transform active:scale-[0.98] shadow-[0_4px_20px_rgba(255,215,0,0.2)]"
        >
          <span>Criar minha conta</span>
          <ArrowRight className="w-5 h-5" />
        </Button>
        
        <Button 
          onClick={() => navigate({ to: "/login" })}
          variant="outline" 
          className="w-full border-zinc-800 bg-transparent text-white hover:bg-white/5 font-bold h-[54px] text-[15px] rounded-[16px] transition-transform active:scale-[0.98]"
        >
          Entrar
        </Button>

        <button 
          className="w-full flex items-center justify-center gap-2 py-3 text-[#FFD700] hover:opacity-80 transition-opacity text-[13px] font-medium"
        >
          <User className="w-4 h-4" />
          <span>Continuar como visitante</span>
        </button>

        <p className="text-[10px] text-zinc-600 text-center px-4 leading-relaxed mt-2 opacity-80">
          Ao continuar, você concorda com nossos <br />
          <span className="text-[#FFD700] font-medium">Termos de Uso</span> e <span className="text-[#FFD700] font-medium">Política de Privacidade</span>.
        </p>
      </div>
    </div>
  );
}
