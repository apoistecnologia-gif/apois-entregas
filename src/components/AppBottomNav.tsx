import { useNavigate } from "@tanstack/react-router";
import { Home, Compass, Heart, User, Bike } from "lucide-react";

interface AppBottomNavProps {
  activeTab: "inicio" | "pedidos" | "favoritos" | "perfil";
}

export function AppBottomNav({ activeTab }: AppBottomNavProps) {
  const navigate = useNavigate();

  const navItems = [
    { name: "Início", id: "inicio", icon: Home, to: "/inicio" },
    { name: "Pedidos", id: "pedidos", icon: Compass, to: "/pedidos" },
    { name: "Favoritos", id: "favoritos", icon: Heart, to: "/favoritos" },
    { name: "Perfil", id: "perfil", icon: User, to: "/perfil" },
  ];

  return (
    <nav className="absolute bottom-0 left-0 right-0 z-50 border-t border-zinc-900/50 bg-black/90 backdrop-blur-xl">
      <div className="flex items-center justify-around px-2 pt-2 pb-[max(env(safe-area-inset-bottom),2.5rem)] md:pb-2">
        {navItems.slice(0, 2).map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={activeTab === item.id}
            onClick={() => navigate({ to: item.to as any })}
          />
        ))}

        <div className="-mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => navigate({ to: "/buscar" })}
            className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-b from-primary to-amber-500 text-black shadow-[0_8px_20px_-4px_rgba(255,215,0,0.5)] ring-4 ring-black transition-transform active:scale-90"
            aria-label="Buscar"
          >
            <Bike className="h-7 w-7" />
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
    </nav>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: { name: string; icon: any };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-[64px] flex-col items-center justify-center gap-0.5 transition-all active:scale-95"
    >
      <item.icon
        className={`h-5 w-5 transition-colors ${active ? "text-primary" : "text-zinc-500"}`}
      />
      <span
        className={`text-[10px] transition-colors ${active ? "font-bold text-primary" : "text-zinc-500"}`}
      >
        {item.name}
      </span>
      <div
        className={`mt-0.5 h-1 w-1 rounded-full transition-all ${active ? "scale-100 bg-primary" : "scale-0 bg-transparent"}`}
      />
    </button>
  );
}
