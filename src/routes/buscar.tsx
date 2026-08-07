import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMerchantCategories, fetchMerchants } from "@/lib/catalog";
import { useCart } from "@/contexts/CartContext";
import {
  MapPin,
  Search,
  ChevronDown,
  Bike,
  Star,
  Clock,
  X,
  ShoppingBag,
  Heart,
  Store,
} from "lucide-react";
import { AppBottomNav } from "@/components/AppBottomNav";
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
  const [categories, setCategories] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(searchParams.q || "");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
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

      const [cats, mers] = await Promise.all([
        fetchMerchantCategories(),
        fetchMerchants()
      ]);
      setCategories(cats);
      setMerchants(mers);
    } catch (err: any) {
      console.error("Error fetching data:", err);
      setError("Ocorreu um erro ao carregar o catálogo.");
    } finally {
      setIsLoading(false);
    }
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


   const filteredMerchants = merchants.filter(m => {
     const query = searchParams.q?.toLowerCase() || "";
     const catId = searchParams.categoria;
     
     // Encontrar nome da categoria real para este estabelecimento específico
     const merchantCategoryName = categories.find(c => c.id === m.category_id)?.name?.toLowerCase() || "";

     const matchesQuery = !query || 
       m.name.toLowerCase().includes(query) || 
       (m.tags && m.tags.some((t: string) => t.toLowerCase().includes(query))) ||
       merchantCategoryName.includes(query);
       
     const matchesCat = !catId || m.category_id === catId;
     
     return matchesQuery && matchesCat;
   });



  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-black text-white selection:bg-primary selection:text-black relative">
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

      <main className="flex-1 overflow-y-auto space-y-4 px-4 pb-20 pt-2 scrollbar-none">
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
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2 animate-pulse">
                <div className="aspect-square w-full rounded-2xl bg-zinc-900" />
                <div className="h-2 w-10 rounded bg-zinc-900" />
              </div>
            ))
          ) : categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className="group flex min-w-0 flex-col items-center gap-2"
            >
              <div
                className={`relative grid aspect-square w-full place-items-center overflow-hidden rounded-2xl bg-zinc-900 transition-all group-active:scale-95 ${
                  searchParams.categoria === cat.id
                    ? "ring-2 ring-primary shadow-[0_0_20px_-5px_rgba(255,215,0,0.4)] scale-[1.02]"
                    : "ring-1 ring-white/10 opacity-70"
                }`}
              >
                {cat.image_url ? (
                  <img
                    src={cat.image_url}
                    alt={cat.name}
                    loading="lazy"
                    className={`relative h-[72%] w-[72%] object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)] transition-transform duration-300 ${
                      searchParams.categoria === cat.id ? "scale-110 rotate-2" : "group-hover:scale-105"
                    }`}
                  />
                ) : (
                  <Store className="h-6 w-6 text-zinc-700" />
                )}
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
           <div className="flex flex-col gap-1">
             <p className="text-[13px] font-medium text-zinc-500">
               {filteredMerchants.length > 0 ? (
                 <>Exibindo <span className="text-primary font-bold">{filteredMerchants.length}</span> resultados</>
               ) : (
                 <>Nenhum resultado para <span className="text-zinc-300">"{searchParams.q || (searchParams.categoria ? categories.find(c => c.id === searchParams.categoria)?.name : "")}"</span></>
               )}
             </p>
           </div>
         )}

        {/* Área de Resultados */}
       <section className="min-h-[40vh] pt-2">
         {isLoading ? (
           Array.from({ length: 4 }).map((_, i) => (
             <div key={i} className="mb-3 h-24 w-full animate-pulse rounded-3xl bg-zinc-900" />
           ))
         ) : error ? (
           <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-red-900/50 bg-red-950/10 px-6 py-16 text-center">
             <div className="relative grid h-20 w-20 place-items-center rounded-full bg-zinc-900 ring-1 ring-zinc-800/50">
               <X className="h-9 w-9 text-red-500" />
             </div>
             <div className="space-y-1">
               <h3 className="text-lg font-bold text-zinc-200">Erro ao carregar</h3>
               <p className="mx-auto max-w-[240px] text-[13px] leading-relaxed text-zinc-500">
                 {error}
               </p>
             </div>
           </div>
         ) : filteredMerchants.length > 0 ? (
            <div className="flex flex-col gap-3">
              {filteredMerchants.map((merchant) => (
                <button 
                  key={merchant.id}
                  onClick={() => navigate({ to: "/estabelecimento/$merchantId", params: { merchantId: merchant.id } })}
                  className="group grid grid-cols-[84px_1fr] items-center gap-4 rounded-3xl border border-zinc-900 bg-zinc-950/50 p-3 text-left transition-all hover:bg-zinc-900/50 active:scale-[0.98] active:bg-zinc-900"
                >
                  <div className="relative aspect-square w-full overflow-hidden rounded-2xl ring-1 ring-white/10 bg-zinc-900">
                    {merchant.logo_url ? (
                      <img 
                        src={merchant.logo_url} 
                        alt={merchant.name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-110"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center">
                        <Store className="h-6 w-6 text-zinc-700" />
                      </div>
                    )}
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
                        <Clock className="h-3.5 w-3.5 text-primary" /> 
                        {merchant.delivery_min_minutes && merchant.delivery_max_minutes 
                          ? `${merchant.delivery_min_minutes}-${merchant.delivery_max_minutes} min`
                          : "Prazo não informado"}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-zinc-700" />
                      <span className="flex items-center gap-1">
                        <Bike className="h-3.5 w-3.5 text-primary" /> 
                        {merchant.delivery_fee > 0 ? `R$ ${merchant.delivery_fee.toFixed(2).replace('.', ',')}` : "Grátis"}
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
                  Os estabelecimentos da sua região aparecerão aqui em breve.
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

      <AppBottomNav activeTab={"" as any} />
    </div>
  );
}
