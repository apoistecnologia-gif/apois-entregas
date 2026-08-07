import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MOCK_MERCHANTS } from "@/lib/mock-data";
import { useCart } from "@/contexts/CartContext";
import {
  MapPin,
  Search,
  ChevronDown,
  Bell,
  Home,
  Compass,
  Heart,
  User,
  Bike,
  Star,
  Clock,
  Circle,
  X,
  LogOut,
  ShoppingBag,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import logoAsset from "@/assets/logo.png.asset.json";
import catRestaurantes from "@/assets/cat-restaurantes.png";
import catMercados from "@/assets/cat-mercados.png";
import catFarmacias from "@/assets/cat-farmacias.png";
import catLojas from "@/assets/cat-lojas.png";
import { z } from "zod";

const searchSchema = z.object({
  categoria: z.string().optional(),
  q: z.string().optional(),
});

export const Route = createFileRoute("/buscar")({
  validateSearch: (search) => searchSchema.parse(search),
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
  component: Buscar,
  head: () => ({
    meta: [
      { title: "Buscar | APOIS ENTREGA" },
      { name: "description", content: "Encontre os melhores estabelecimentos no APOIS ENTREGA." },
    ],
  }),
});

function Buscar() {
  const navigate = useNavigate();
  const searchParams = useSearch({ from: "/buscar" });
  const { totalItems } = useCart();
  const [defaultAddress, setDefaultAddress] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(searchParams.q || "");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: addrData } = await supabase
        .from("customer_addresses" as any)
        .select("*")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      setDefaultAddress(addrData);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
    if (searchInputRef.current && !searchParams.categoria && !searchParams.q) {
      searchInputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    setSearchTerm(searchParams.q || "");
  }, [searchParams.q]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({
      to: "/buscar",
      search: (prev: any) => ({ ...prev, q: searchTerm || undefined }),
      replace: true,
    });
  };

  const clearSearch = () => {
    setSearchTerm("");
    navigate({
      to: "/buscar",
      search: (prev: any) => ({ ...prev, q: undefined }),
      replace: true,
    });
  };

  const handleCategoryClick = (catId: string) => {
    const newCat = searchParams.categoria === catId ? undefined : catId;
    navigate({
      to: "/buscar",
      search: (prev: any) => ({ ...prev, categoria: newCat }),
      replace: true,
    });
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair da conta");
    } else {
      navigate({ to: "/login" });
    }
  };

  const categories = [
    { id: "restaurantes", name: "Restaurantes", image: catRestaurantes, className: "from-orange-500/25 via-orange-900/10 to-black" },
    { id: "mercados", name: "Mercados", image: catMercados, className: "from-green-500/25 via-green-900/10 to-black" },
    { id: "farmacias", name: "Farmácias", image: catFarmacias, className: "from-sky-500/25 via-cyan-900/10 to-black" },
    { id: "lojas", name: "Lojas", image: catLojas, className: "from-violet-500/25 via-purple-900/10 to-black" },
  ];

  const filteredMerchants = MOCK_MERCHANTS.filter(m => {
    const query = searchParams.q?.toLowerCase() || "";
    const cat = searchParams.categoria?.toLowerCase() || "";
    
    const matchesQuery = !query || 
      m.name.toLowerCase().includes(query) || 
      m.tags.some(t => t.toLowerCase().includes(query));
      
    const matchesCat = !cat || m.category.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(cat);
    
    return matchesQuery && matchesCat;
  });

  const navItems = [
    { name: "Início", icon: Home, active: false, to: "/inicio" },
    { name: "Pedidos", icon: Compass, active: false, to: "/pedidos" },
    { name: "Favoritos", icon: Heart, active: false, to: "/favoritos" },
    { name: "Perfil", icon: User, active: false, to: "/perfil" },
  ];

  return (
    <div className="flex min-h-full w-full flex-col overflow-x-hidden bg-black text-white selection:bg-primary selection:text-black">
      {/* Header compactado com Logo e Notificações */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 pb-2 pt-6">
        <img src={logoAsset.url} alt="APOIS ENTREGA" className="h-8 w-auto object-contain object-left" />
          <button
            onClick={() => navigate({ to: "/sacola" })}
            className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-950 text-white"
            aria-label="Sacola"
          >
            <ShoppingBag className="h-4.5 w-4.5" />
            {totalItems > 0 && <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-black flex items-center justify-center ring-2 ring-zinc-950">{totalItems}</span>}
          </button>
      </header>

      <main className="flex-1 space-y-4 px-4 pb-28 pt-2">
        {/* Endereço - Menor que na home */}
        <button
          onClick={() => navigate({ to: "/enderecos" })}
          className="flex w-full items-center gap-2 rounded-xl border border-zinc-800/50 bg-zinc-900/30 px-3 py-2 text-left transition-transform active:scale-[0.98]"
        >
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              ENTREGAR EM
            </span>
            <span className="truncate text-[13px] font-semibold text-zinc-200">
              {isLoading ? (
                "..."
              ) : defaultAddress ? (
                `${defaultAddress.label}: ${defaultAddress.street}, ${defaultAddress.number}`
              ) : (
                "Informe seu endereço"
              )}
            </span>
          </div>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-primary/70" />
        </button>

        {/* Campo de Busca */}
        <form onSubmit={handleSearch} className="relative group">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary group-focus-within:text-white transition-colors" />
          <Input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="O que você quer pedir?"
            className="h-13 rounded-2xl border-zinc-800 bg-zinc-950/90 pl-12 pr-10 text-[15px] text-white shadow-inner shadow-black/60 placeholder:text-zinc-500 focus-visible:border-primary/50 focus-visible:ring-primary/40 transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-zinc-800 p-0.5 text-zinc-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>

        {/* Categorias (Grid 4 colunas - Premium Compacto) */}
        <div className="grid grid-cols-4 gap-2.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className="group flex min-w-0 flex-col items-center gap-2"
            >
              <div
                className={`relative grid aspect-square w-full place-items-center overflow-hidden rounded-2xl bg-gradient-to-br ${cat.className} shadow-[0_8px_20px_-10px_rgba(0,0,0,0.9)] transition-all group-active:scale-95 ${
                  searchParams.categoria === cat.id
                    ? "ring-2 ring-primary shadow-[0_0_20px_-5px_rgba(255,215,0,0.4)] scale-[1.02]"
                    : "ring-1 ring-white/10 opacity-70"
                }`}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
                <img
                  src={cat.image}
                  alt=""
                  loading="lazy"
                  className={`relative h-[72%] w-[72%] object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)] transition-transform duration-300 ${
                    searchParams.categoria === cat.id ? "scale-110 rotate-2" : "group-hover:scale-105"
                  }`}
                />
              </div>
              <span className={`w-full truncate text-center text-[10px] font-bold tracking-tight transition-colors ${
                searchParams.categoria === cat.id ? "text-primary" : "text-zinc-500"
              }`}>
                {cat.name.toUpperCase()}
              </span>
            </button>
          ))}
        </div>

        {/* Contador de resultados */}
        {(searchParams.q || searchParams.categoria) && (
          <p className="text-[13px] font-medium text-zinc-500">
            Nenhum resultado para{" "}
            <span className="text-zinc-300">
              "{searchParams.q || searchParams.categoria}"
            </span>
          </p>
        )}

        {/* Área de Resultados */}
        <section className="min-h-[40vh] pt-2">
          {filteredMerchants.length > 0 ? (
            <div className="flex flex-col gap-3">
              {filteredMerchants.map((merchant) => (
                <button 
                  key={merchant.id}
                  onClick={() => navigate({ to: "/estabelecimento/$merchantId", params: { merchantId: merchant.id } })}
                  className="group grid grid-cols-[84px_1fr] items-center gap-4 rounded-3xl border border-zinc-900 bg-zinc-950/50 p-3 text-left transition-all hover:bg-zinc-900/50 active:scale-[0.98] active:bg-zinc-900"
                >
                  <div className="relative aspect-square w-full overflow-hidden rounded-2xl ring-1 ring-white/10">
                    <img 
                      src={merchant.logoImage} 
                      alt={merchant.name}
                      className="h-full w-full object-cover transition-transform group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-bold backdrop-blur-sm">
                      <Star className="h-2.5 w-2.5 fill-primary text-primary" />
                      <span>{merchant.rating}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col justify-center gap-1.5 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-base font-extrabold text-white">{merchant.name}</h3>
                      <Heart className="h-4 w-4 text-zinc-600 group-hover:text-primary transition-colors" />
                    </div>
                    
                    <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-primary" /> {merchant.deliveryTime}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-zinc-700" />
                      <span className="flex items-center gap-1">
                        <Bike className="h-3.5 w-3.5 text-primary" /> R$ {merchant.deliveryFee.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/40 px-6 py-16 text-center">
              <div className="relative">
                <div className="absolute inset-0 animate-pulse rounded-full bg-primary/5 blur-2xl" />
                <div className="relative grid h-20 w-20 place-items-center rounded-full bg-zinc-900 ring-1 ring-zinc-800/50">
                  <Search className="h-9 w-9 text-zinc-700" />
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-zinc-200">Nenhum estabelecimento encontrado</h3>
                <p className="mx-auto max-w-[240px] text-[13px] leading-relaxed text-zinc-500">
                  Ainda não temos parceiros ativos que correspondam à sua busca nesta região.
                </p>
              </div>
              <button 
                onClick={() => {
                  setSearchTerm("");
                  navigate({ to: "/buscar", search: {}, replace: true });
                }}
                className="mt-2 rounded-full border border-primary/20 bg-primary/5 px-6 py-2 text-[13px] font-bold text-primary transition-colors hover:bg-primary/10"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Bottom nav - Usando sticky para respeitar o container do app */}
      <nav className="sticky bottom-0 z-50 border-t border-zinc-900 bg-black/95 backdrop-blur-md">
        <div className="relative grid grid-cols-5 items-end px-2 pb-2 pt-3">
          {navItems.slice(0, 2).map((item) => (
            <NavButton key={item.name} item={item} />
          ))}
          <div className="flex justify-center">
            <button
              onClick={() => navigate({ to: "/inicio" })}
              className="-mt-9 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-b from-primary to-amber-500 text-black shadow-[0_10px_25px_-6px_rgba(255,215,0,0.55)] ring-4 ring-black transition-transform active:scale-95"
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
          className="flex w-full items-center justify-center gap-2 border-t border-zinc-900 py-2.5 text-[12px] text-zinc-600 transition-colors hover:text-red-400"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair da conta
        </button>
      </nav>
    </div>
  );
}

function NavButton({ item }: { item: { name: string; icon: any; active: boolean; to: string } }) {
  const navigate = useNavigate();
  return (
    <button 
      onClick={() => navigate({ to: item.to })}
      className="flex flex-col items-center gap-1"
    >
      <item.icon className={`h-6 w-6 transition-colors ${item.active ? "text-primary" : "text-zinc-500"}`} />
      <span className={`text-[11px] transition-colors ${item.active ? "font-semibold text-primary" : "text-zinc-500"}`}>
        {item.name}
      </span>
      <span className={`h-0.5 w-6 rounded-full transition-all ${item.active ? "bg-primary scale-100" : "bg-transparent scale-0"}`} />
    </button>
  );
}
