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
    <nav className="absolute bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-background/95 backdrop-blur-xl">
      <div className="flex min-h-[82px] items-center justify-around px-2 pb-[max(env(safe-area-inset-bottom),0.95rem)] pt-2.5 md:pb-3">
        {navItems.slice(0, 2).map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={activeTab === item.id}
            onClick={() => navigate({ to: item.to as any })}
          />
        ))}

        <div className="-mt-6 flex justify-center pb-1">
          <button
            type="button"
            onClick={() => navigate({ to: "/buscar" })}
            className="apois-customer-soft-glow grid h-16 w-16 place-items-center rounded-full border border-primary/35 bg-primary text-white ring-4 ring-background transition-transform active:scale-90"
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
      className="flex min-h-[56px] min-w-[68px] flex-col items-center justify-center gap-1 px-1 transition-all active:scale-95"
    >
      <item.icon
        className={`h-7 w-7 transition-colors ${active ? "text-primary" : "text-zinc-500"}`}
      />
      <span
        className={`text-[11px] leading-none transition-colors ${active ? "font-bold text-primary" : "font-medium text-zinc-500"}`}
      >
        {item.name}
      </span>
      <div
        className={`mt-0.5 h-0.5 rounded-full transition-all ${active ? "w-5 scale-100 bg-primary" : "w-0 scale-0 bg-transparent"}`}
      />
    </button>
  );
}
