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
    <div className="flex min-h-screen flex-col bg-black text-white overflow-x-hidden max-w-[500px] mx-auto relative font-sans">
      {/* Official Logo Header */}
      <header className="flex flex-col items-center pt-8 pb-4 px-6">
        <img 
          src={logoAsset.url} 
          alt="APOIS ENTREGA" 
          className="w-40 sm:w-48 h-auto object-contain mb-4"
        />
        
        <div className="text-center space-y-1 mt-1">
          <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight">
            Seu delivery <span className="text-[#FFD700]">do seu jeito</span>
          </h1>
          <p className="text-zinc-400 text-[13px] sm:text-[15px] font-light leading-relaxed max-w-[240px] mx-auto">
            Peça comida, mercado, farmácia e lojas com rapidez e segurança.
          </p>
        </div>
      </header>

      {/* Visual Composition / Hero area */}
      <div className="relative w-full aspect-[16/9] flex items-center justify-center px-4 overflow-hidden">
        {/* Background building silhouette effect (CSS gradient based) */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10" />
        
        {/* Main Hero Illustration Placeholder - Representing the rider/city visual */}
        <div className="relative w-full h-full flex items-center justify-center">
          <img 
            src={heroImage.url}
            alt=""
            className="w-full h-full object-cover opacity-60"
            style={{ 
              maskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)'
            }}
          />
          
          {/* Decorative Location Pin (matching yellow) */}
          <div className="absolute top-1/4 right-[20%] w-8 h-8 text-[#FFD700] drop-shadow-[0_0_15px_rgba(255,215,0,0.5)] animate-bounce">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Service Grid Cards */}
      <div className="px-5 grid grid-cols-4 gap-2 mb-6 mt-[-15px] relative z-20">
        {[
          { icon: UtensilsCrossed, label: "Comida", sub: "do seu jeito" },
          { icon: ShoppingBasket, label: "Mercado", sub: "sem sair de casa" },
          { icon: Pill, label: "Farmácia", sub: "quando precisar" },
          { icon: ShoppingBag, label: "Lojas", sub: "com praticidade" },
        ].map((item, idx) => (
          <div key={idx} className="flex flex-col items-center p-2 rounded-xl border border-white/5 bg-zinc-900/50 backdrop-blur-sm text-center">
            <div className="w-8 h-8 flex items-center justify-center mb-1.5">
              <item.icon className="w-5 h-5 text-[#FFD700]" strokeWidth={1.5} />
            </div>
            <span className="text-[10px] font-bold text-white block truncate w-full">{item.label}</span>
            <span className="text-[8px] text-zinc-500 block leading-tight mt-0.5">{item.sub}</span>
          </div>
        ))}
      </div>

      {/* Main Actions */}
      <div className="px-6 space-y-3 pb-8 w-full mt-auto">
        <Button 
          onClick={() => navigate({ to: "/register" })}
          className="w-full bg-[#FFD700] hover:bg-[#FFC000] text-black font-bold h-[54px] text-base rounded-[14px] flex items-center justify-between px-6 transition-transform active:scale-[0.98]"
        >
          <span>Criar minha conta</span>
          <ArrowRight className="w-5 h-5" />
        </Button>
        
        <Button 
          onClick={() => navigate({ to: "/login" })}
          variant="outline" 
          className="w-full border-zinc-800 bg-transparent text-white hover:bg-white/5 font-bold h-[54px] text-base rounded-[14px] transition-transform active:scale-[0.98]"
        >
          Entrar
        </Button>

        <button 
          className="w-full flex items-center justify-center gap-2 py-3 text-[#FFD700] hover:opacity-80 transition-opacity text-sm font-medium"
        >
          <User className="w-4 h-4" />
          <span>Continuar como visitante</span>
        </button>

        <p className="text-[10px] text-zinc-600 text-center px-4 leading-relaxed mt-2">
          Ao continuar, você concorda com nossos <br />
          <span className="text-[#FFD700] font-medium">Termos de Uso</span> e <span className="text-[#FFD700] font-medium">Política de Privacidade</span>.
        </p>
      </div>
    </div>
  );
}
