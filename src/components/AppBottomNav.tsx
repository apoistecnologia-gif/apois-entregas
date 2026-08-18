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
    <nav className="absolute bottom-0 left-0 right-0 z-50 border-t border-zinc-900/50 bg-black/95 backdrop-blur-xl">
      <div className="flex items-end justify-around px-2 pb-[max(env(safe-area-inset-bottom),0.45rem)] pt-1.5 md:pb-2">
        {navItems.slice(0, 2).map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={activeTab === item.id}
            onClick={() => navigate({ to: item.to as any })}
          />
        ))}

        <div className="-mt-4 flex justify-center pb-0.5">
          <button
            type="button"
            onClick={() => navigate({ to: "/buscar" })}
            className="grid h-13 w-13 place-items-center rounded-full bg-gradient-to-br from-primary via-primary to-accent text-white shadow-[0_7px_18px_-5px_rgba(57,181,74,0.45)] ring-3 ring-accent/25 transition-transform active:scale-90"
            aria-label="Buscar"
          >
            <Bike className="h-6 w-6" />
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
      className="flex min-w-[62px] flex-col items-center justify-center gap-0 transition-all active:scale-95"
    >
      <item.icon
        className={`h-5 w-5 transition-colors ${active ? "text-primary" : "text-zinc-500"}`}
      />
      <span
        className={`mt-0.5 text-[9px] leading-none transition-colors ${active ? "font-bold text-primary" : "text-zinc-500"}`}
      >
        {item.name}
      </span>
      <div
        className={`mt-1 h-0.5 w-3 rounded-full transition-all ${active ? "scale-100 bg-accent" : "scale-0 bg-transparent"}`}
      />
    </button>
  );
}
