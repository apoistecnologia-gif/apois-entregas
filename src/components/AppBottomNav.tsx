import { useNavigate } from "@tanstack/react-router";
import { Home, Compass, Heart, User, Bike, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AppBottomNavProps {
  activeTab: "inicio" | "pedidos" | "favoritos" | "perfil";
}

export function AppBottomNav({ activeTab }: AppBottomNavProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair da conta");
    } else {
      navigate({ to: "/login" });
    }
  };

  const navItems = [
    { name: "Início", id: "inicio", icon: Home, to: "/inicio" },
    { name: "Pedidos", id: "pedidos", icon: Compass, to: "/pedidos" },
    { name: "Favoritos", id: "favoritos", icon: Heart, to: "/favoritos" },
    { name: "Perfil", id: "perfil", icon: User, to: "/perfil" },
  ];

  return (
    <nav className="sticky bottom-0 z-50 border-t border-zinc-900 bg-black/95 backdrop-blur-md">
      <div className="relative grid grid-cols-5 items-end px-2 pb-2 pt-3">
        {navItems.slice(0, 2).map((item) => (
          <NavButton 
            key={item.id} 
            item={item} 
            active={activeTab === item.id} 
            onClick={() => navigate({ to: item.to as any })}
          />
        ))}
        
        <div className="flex justify-center">
          <button
            onClick={() => navigate({ to: "/buscar" })}
            className="-mt-9 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-b from-primary to-amber-500 text-black shadow-[0_10px_25px_-6px_rgba(255,215,0,0.55)] ring-4 ring-black transition-transform active:scale-95"
            aria-label="Buscar"
          >
            <Bike className="h-8 w-8" />
          </button>
        </div>

        {navItems.slice(2).map((item) => (
          <NavButton 
            key={item.id} 
            item={item} 
            active={activeTab === item.id} 
            onClick={() => navigate({ to: item.to as any })}
          />
        ))}
      </div>
      
      <button
        onClick={handleLogout}
        className="flex w-full items-center justify-center gap-2 border-t border-zinc-900 py-2.5 text-[12px] text-zinc-600 transition-colors hover:text-red-400"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sair da conta
      </button>
    </nav>
  );
}

function NavButton({ 
  item, 
  active, 
  onClick 
}: { 
  item: { name: string; icon: any }; 
  active: boolean; 
  onClick: () => void 
}) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center gap-1"
    >
      <item.icon className={`h-6 w-6 transition-colors ${active ? "text-primary" : "text-zinc-500"}`} />
      <span className={`text-[11px] transition-colors ${active ? "font-semibold text-primary" : "text-zinc-500"}`}>
        {item.name}
      </span>
      <span className={`h-0.5 w-6 rounded-full transition-all ${active ? "bg-primary scale-100" : "bg-transparent scale-0"}`} />
    </button>
  );
}
