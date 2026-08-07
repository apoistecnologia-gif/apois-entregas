import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  MapPin,
  Search,
  UtensilsCrossed,
  ShoppingBasket,
  Pill,
  ShoppingBag,
  LogOut,
  ChevronRight,
  ChevronDown,
  Bell,
  Crown,
  Home,
  Compass,
  Heart,
  User,
  Bike,
  Store,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import logoAsset from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/inicio")({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
    return { session };
  },
  component: Inicio,
  head: () => ({
    meta: [
      { title: "Início | APOIS ENTREGA" },
      { name: "description", content: "Peça comida, mercado, farmácia e lojas com entrega rápida no APOIS ENTREGA." },
      { property: "og:title", content: "Início | APOIS ENTREGA" },
      { property: "og:description", content: "Peça comida, mercado, farmácia e lojas com entrega rápida no APOIS ENTREGA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Inicio() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [defaultAddress, setDefaultAddress] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profileData } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (profileData) setProfile(profileData);

      const { data: addrData } = await supabase
        .from("customer_addresses" as any)
        .select("*")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .single();

      setDefaultAddress(addrData);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
    const handleFocus = () => fetchData();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair da conta");
    } else {
      navigate({ to: "/login" });
    }
  };

  const firstName = profile?.full_name?.split(" ")[0]?.toUpperCase();

  const categories = [
    { id: 1, name: "Restaurantes", icon: UtensilsCrossed, className: "from-orange-500 to-orange-700" },
    { id: 2, name: "Mercados", icon: ShoppingBasket, className: "from-green-500 to-green-700" },
    { id: 3, name: "Farmácias", icon: Pill, className: "from-sky-500 to-cyan-700" },
    { id: 4, name: "Lojas", icon: ShoppingBag, className: "from-violet-500 to-purple-700" },
  ];

  const navItems = [
    { name: "Início", icon: Home, active: true },
    { name: "Pedidos", icon: Compass, active: false },
    { name: "Favoritos", icon: Heart, active: false },
    { name: "Perfil", icon: User, active: false },
  ];

  return (
    <div className="flex min-h-full w-full flex-col overflow-x-hidden bg-black text-white">
      {/* Header */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-zinc-900/80 px-4 pb-3 pt-6">
        <img src={logoAsset.url} alt="APOIS ENTREGA" className="h-10 w-auto object-contain object-left" />
        <button
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-950 text-white"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-zinc-950" />
        </button>
      </header>

      <main className="flex-1 space-y-4 px-4 pb-28 pt-4">
        {/* Entregar em */}
        <button
          onClick={() => navigate({ to: "/enderecos" })}
          className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-zinc-950 to-black px-3 py-3 text-left shadow-[0_6px_24px_-12px_rgba(255,215,0,0.45)] transition-transform active:scale-[0.99]"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/15 ring-1 ring-primary/25">
            <MapPin className="h-5 w-5 text-primary" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              Entregar em
            </span>
            <span className="block truncate text-base font-semibold text-white">
              {isLoading ? (
                <span className="mt-1 block h-4 w-40 animate-pulse rounded bg-zinc-800" />
              ) : defaultAddress ? (
                `${defaultAddress.label}: ${defaultAddress.street}, ${defaultAddress.number}`
              ) : (
                "Informe seu endereço"
              )}
            </span>
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 text-primary" />
        </button>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
          <Input
            type="text"
            placeholder="O que você quer pedir?"
            className="h-13 rounded-2xl border-zinc-800 bg-zinc-950/90 pl-12 text-[15px] text-white shadow-inner shadow-black/60 placeholder:text-zinc-500 focus-visible:border-primary/50 focus-visible:ring-primary/40"
          />
        </div>

        {/* Saudação */}
        <div className="flex min-w-0 items-center gap-3 pt-0.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/40 bg-zinc-950 shadow-[0_0_0_3px_rgba(255,215,0,0.06)]">
            <img src={logoAsset.url} alt="" className="h-7 w-7 object-contain" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-extrabold leading-tight tracking-tight">
              Olá, <span className="text-primary">{isLoading ? "..." : firstName || "BEM-VINDO"}!</span>
            </h1>
            <p className="truncate text-[13px] text-zinc-400">O que vamos comer hoje?</p>
          </div>
        </div>

        {/* Categorias */}
        <div className="grid grid-cols-4 gap-2.5">
          {categories.map((cat) => (
            <button key={cat.id} className="group flex flex-col items-center gap-2">
              <span
                className={`grid aspect-square w-full place-items-center rounded-[1.25rem] bg-gradient-to-br ${cat.className} shadow-[0_8px_18px_-8px_rgba(0,0,0,0.9)] ring-1 ring-white/10 transition-transform group-active:scale-95`}
              >
                <cat.icon className="h-7 w-7 text-white drop-shadow" />
              </span>
              <span className="w-full truncate text-center text-[11px] font-medium text-zinc-300">
                {cat.name}
              </span>
            </button>
          ))}
        </div>

        {/* Perto de você */}
        <section className="space-y-3 pt-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-2 text-lg font-bold tracking-tight">
              <MapPin className="h-5 w-5 shrink-0 text-primary" />
              <span className="truncate">Perto de você</span>
            </h2>
            <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-primary">
              Ver mais <ChevronRight className="h-4 w-4" />
            </span>
          </div>

          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/70 px-6 py-9 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-zinc-900 ring-1 ring-zinc-800">
              <Store className="h-7 w-7 text-zinc-600" />
            </span>
            <h3 className="mt-1 text-[15px] font-semibold text-zinc-300">Tudo pronto para começar</h3>
            <p className="max-w-[240px] text-xs leading-relaxed text-zinc-500">
              Ainda não existem estabelecimentos cadastrados nesta região. Fique de olho!
            </p>
          </div>
        </section>

        {/* Banner APOIS+ */}
        <button className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-zinc-950 to-black px-3 py-4 text-left shadow-[0_10px_30px_-18px_rgba(255,215,0,0.7)] transition-transform active:scale-[0.99]">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary/10 ring-1 ring-primary/30">
            <Crown className="h-7 w-7 text-primary" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[17px] font-bold text-white">
              Seja <span className="text-primary">APOIS+</span>
            </span>
            <span className="block truncate text-[13px] text-zinc-400">
              Frete grátis e benefícios exclusivos
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-primary" />
        </button>
      </main>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 z-50 border-t border-zinc-900 bg-black/95 backdrop-blur">
        <div className="relative grid grid-cols-5 items-end px-2 pb-2 pt-3">
          {navItems.slice(0, 2).map((item) => (
            <NavButton key={item.name} item={item} />
          ))}
          <div className="flex justify-center">
            <button
              className="-mt-8 grid h-16 w-16 place-items-center rounded-full bg-primary text-black shadow-lg shadow-primary/30"
              aria-label="Pedir agora"
            >
              <Bike className="h-8 w-8" />
            </button>
          </div>
          {navItems.slice(2).map((item) => (
            <NavButton key={item.name} item={item} />
          ))}
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 border-t border-zinc-900 py-2.5 text-sm text-zinc-500 transition-colors hover:text-red-400"
        >
          <LogOut className="h-4 w-4" />
          Sair da conta
        </button>
      </nav>
    </div>
  );
}

function NavButton({ item }: { item: { name: string; icon: any; active: boolean } }) {
  return (
    <button className="flex flex-col items-center gap-1">
      <item.icon className={`h-6 w-6 ${item.active ? "text-primary" : "text-zinc-500"}`} />
      <span className={`text-[11px] ${item.active ? "font-semibold text-primary" : "text-zinc-500"}`}>
        {item.name}
      </span>
      <span className={`h-0.5 w-6 rounded-full ${item.active ? "bg-primary" : "bg-transparent"}`} />
    </button>
  );
}
