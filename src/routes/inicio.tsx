import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMerchantCategories, fetchMerchants } from "@/lib/catalog";
import { useCart } from "@/contexts/CartContext";
import { ShoppingBag } from "lucide-react";
import {
  MapPin,
  Search,
  ChevronRight,
  ChevronDown,
  Bell,
  Crown,
  Bike,
  Store,
  Star,
  Clock,
  Heart,
} from "lucide-react";
import { AppBottomNav } from "@/components/AppBottomNav";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import logoAsset from "@/assets/logo.png.asset.json";
import catRestaurantes from "@/assets/cat-restaurantes.png";
import catMercados from "@/assets/cat-mercados.png";
import catFarmacias from "@/assets/cat-farmacias.png";
import catLojas from "@/assets/cat-lojas.png";


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
  const { totalItems } = useCart();
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


  const firstName = profile?.full_name?.split(" ")[0]?.toUpperCase();

  const categories = [
    { id: 1, name: "Restaurantes", image: catRestaurantes, className: "from-orange-500/25 via-orange-900/10 to-black" },
    { id: 2, name: "Mercados", image: catMercados, className: "from-green-500/25 via-green-900/10 to-black" },
    { id: 3, name: "Farmácias", image: catFarmacias, className: "from-sky-500/25 via-cyan-900/10 to-black" },
    { id: 4, name: "Lojas", image: catLojas, className: "from-violet-500/25 via-purple-900/10 to-black" },
  ];



  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-black text-white relative">
      {/* Header */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-zinc-900/80 px-4 pb-3 pt-6">
        <img src={logoAsset.url} alt="APOIS ENTREGA" className="h-10 w-auto object-contain object-left" />
        <button
          onClick={() => navigate({ to: "/sacola" })}
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-950 text-white"
          aria-label="Sacola"
        >
          <ShoppingBag className="h-5 w-5" />
          {totalItems > 0 && <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-black flex items-center justify-center ring-2 ring-zinc-950">{totalItems}</span>}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto space-y-4 px-4 pb-20 pt-4 scrollbar-none">
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
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary group-focus-within:text-white transition-colors" />
          <Input
            type="text"
            readOnly
            onClick={() => navigate({ to: "/buscar" })}
            placeholder="O que você quer pedir?"
            className="h-13 cursor-pointer rounded-2xl border-zinc-800 bg-zinc-950/90 pl-12 text-[15px] text-white shadow-inner shadow-black/60 placeholder:text-zinc-500 focus-visible:border-primary/50 focus-visible:ring-primary/40"
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
            <button 
              key={cat.id} 
              onClick={() => navigate({ 
                to: "/buscar", 
                search: { categoria: cat.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") } 
              })}
              className="group flex min-w-0 flex-col items-center gap-2"
            >
              <span
                className={`relative grid aspect-[3/3.4] w-full place-items-center overflow-hidden rounded-[1.25rem] bg-gradient-to-br ${cat.className} shadow-[0_10px_22px_-10px_rgba(0,0,0,0.95)] ring-1 ring-white/10 transition-transform group-active:scale-95`}
              >
                <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent" />
                <img
                  src={cat.image}
                  alt=""
                  loading="lazy"
                  width={512}
                  height={512}
                  className="relative h-[78%] w-[78%] object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.65)]"
                />
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

          <div className="flex flex-col gap-3">
            {/* Lista de Estabelecimentos */}
            {MOCK_MERCHANTS.map((merchant) => (
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
                  
                  <p className="truncate text-[11px] text-zinc-500 italic">
                    {merchant.description}
                  </p>
                </div>
              </button>
            ))}

            {/* Placeholder de estado vazio (opcional, mantendo um item para demonstração) */}
            <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/30 px-6 py-8 text-center opacity-60">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-zinc-900 ring-1 ring-zinc-800">
                <Store className="h-6 w-6 text-zinc-700" />
              </span>
              <p className="max-w-[200px] text-[10px] leading-relaxed text-zinc-600">
                Mais estabelecimentos parceiros estarão disponíveis em breve.
              </p>
            </div>
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

      <AppBottomNav activeTab="inicio" />
    </div>
  );
}
