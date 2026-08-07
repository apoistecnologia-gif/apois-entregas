import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { 
  ArrowLeft, 
  Heart, 
  Star, 
  Clock, 
  Bike, 
  ChevronRight, 
  Plus, 
  Search,
  Info,
  Flame,
  ChevronDown
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Demonstração local de dados (isolados do banco)
const MOCK_MERCHANT = {
  id: "brasa-burguer",
  name: "Brasa Burguer",
  rating: 4.8,
  reviewCount: 1248,
  deliveryTime: "30-40 min",
  deliveryFee: 5.99,
  isOpen: true,
  closeTime: "23:30",
  description: "Hambúrgueres artesanais grelhados no braseiro, com ingredientes frescos e muito sabor. Do clássico ao smash, aqui é tudo feito com paixão pela brasa!",
  coverImage: "/favicon.png",
  logoImage: "/favicon.png",
};

const MOCK_CATEGORIES = [
  { id: "destaques", name: "Destaques" },
  { id: "burgers", name: "Burgers" },
  { id: "combos", name: "Combos" },
  { id: "bebidas", name: "Bebidas" },
  { id: "sobremesas", name: "Sobremesas" },
];

const MOCK_PRODUCTS = [
  {
    id: "p1",
    name: "Brasa Smash",
    description: "Dois smash burgers, queijo cheddar, cebola caramelizada e molho especial.",
    price: 32.90,
    image: "/favicon.png",
    category: "burgers",
    isPopular: true,
  },
  {
    id: "p2",
    name: "Brasa Bacon",
    description: "Pão brioche, hambúrguer 160g, bacon crocante, queijo prato, alface, tomate e maionese da casa.",
    price: 29.90,
    image: "/favicon.png",
    category: "burgers",
  },
  {
    id: "p3",
    name: "Combo Brasa",
    description: "Brasa Burguer + batata frita + refrigerante lata.",
    price: 42.90,
    image: "/favicon.png",
    category: "combos",
  },
  {
    id: "p4",
    name: "Coca-Cola Lata 350ml",
    description: "Coca-Cola geladinha para acompanhar seu pedido.",
    price: 6.90,
    image: "/favicon.png",
    category: "bebidas",
  },
];

export const Route = createFileRoute("/estabelecimento/$merchantId")({
  component: EstabelecimentoPage,
});

function EstabelecimentoPage() {
  const { merchantId } = useParams({ from: "/estabelecimento/$merchantId" });
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("destaques");
  const [isFavorite, setIsFavorite] = useState(false);
  const [cart, setCart] = useState<any[]>([]);

  // Futuramente buscar dados reais usando o merchantId
  // const { data: merchant } = useQuery(...)

  const handleAddToCart = (product: any) => {
    setCart((prev) => [...prev, product]);
    // Toast de confirmação futuramente
  };

  return (
    <div className="flex min-h-full w-full flex-col overflow-x-hidden bg-black text-white selection:bg-primary selection:text-black">
      {/* Header com Capa */}
      <div className="relative h-60 w-full shrink-0">
        <img 
          src={MOCK_MERCHANT.coverImage} 
          alt={MOCK_MERCHANT.name}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black" />
        
        {/* Botões de Ação no Topo */}
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-4 pt-6">
          <button 
            onClick={() => window.history.back()}
            className="grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur-md ring-1 ring-white/10"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <button 
            onClick={() => setIsFavorite(!isFavorite)}
            className={`grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur-md ring-1 ring-white/10 transition-colors ${isFavorite ? "text-primary" : "text-white"}`}
          >
            <Heart className={`h-5 w-5 ${isFavorite ? "fill-primary" : ""}`} />
          </button>
        </div>

        {/* Logo do Estabelecimento */}
        <div className="absolute -bottom-10 left-4 z-10">
          <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-primary bg-zinc-950 shadow-2xl">
            <img 
              src={MOCK_MERCHANT.logoImage} 
              alt="Logo"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/favicon.png";
              }}
              className="h-full w-full object-cover bg-zinc-900"
            />
            {/* Overlay com chama ou ícone premium se necessário */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
               <Flame className="h-8 w-8 text-primary opacity-80" />
            </div>
          </div>
        </div>
      </div>

      {/* Info do Estabelecimento */}
      <div className="mt-12 px-4 space-y-4 pb-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">{MOCK_MERCHANT.name}</h1>
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 fill-primary text-primary" />
            <span className="text-[14px] font-bold text-primary">{MOCK_MERCHANT.rating}</span>
            <span className="text-[14px] text-zinc-500">({MOCK_MERCHANT.reviewCount} avaliações)</span>
          </div>
        </div>

        {/* Info Grid Premium */}
        <div className="grid grid-cols-3 gap-0 rounded-2xl border border-zinc-800 bg-zinc-950/50 py-3 shadow-inner shadow-black/60">
          <div className="flex flex-col items-center justify-center gap-1 border-r border-zinc-800 px-2">
            <Clock className="h-5 w-5 text-primary" />
            <span className="text-[12px] font-bold text-white">{MOCK_MERCHANT.deliveryTime}</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Tempo</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-1 border-r border-zinc-800 px-2">
            <Bike className="h-5 w-5 text-primary" />
            <span className="text-[12px] font-bold text-white">R$ {MOCK_MERCHANT.deliveryFee.toFixed(2).replace('.', ',')}</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Taxa</span>
          </div>
          <button className="flex flex-col items-center justify-center gap-1 px-2 group">
            <div className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${MOCK_MERCHANT.isOpen ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-[12px] font-bold text-green-500">Aberto até {MOCK_MERCHANT.closeTime}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500 group-active:text-primary">
              Ver horário <ChevronRight className="h-3 w-3" />
            </div>
          </button>
        </div>

        {/* Descrição */}
        <div className="relative">
          <p className="text-[14px] leading-relaxed text-zinc-400 line-clamp-3">
            {MOCK_MERCHANT.description}
          </p>
          <button className="flex items-center gap-1 text-[13px] font-bold text-primary mt-1">
            Ver mais <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        {/* Categorias do Menu */}
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 py-2">
          {MOCK_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold transition-all ${
                activeCategory === cat.id 
                ? "bg-primary text-black shadow-[0_4px_12px_rgba(255,215,0,0.3)] scale-[1.05]" 
                : "bg-zinc-900 text-zinc-400 border border-zinc-800"
              }`}
            >
              {cat.id === 'destaques' && <Star className={`h-4 w-4 ${activeCategory === cat.id ? 'fill-black' : 'fill-transparent'}`} />}
              {cat.name}
            </button>
          ))}
        </div>

        {/* Banner de Promoção */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-amber-600 p-[1px] shadow-lg shadow-primary/10">
          <div className="flex items-center justify-between bg-black/90 px-4 py-5 rounded-[15px] relative overflow-hidden">
            {/* Glow decorativo */}
            <div className="absolute -left-10 top-0 h-20 w-20 rounded-full bg-primary/20 blur-3xl" />
            
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-black shadow-lg">
                <span className="text-xl font-black">%</span>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Promo Exclusiva</p>
                <p className="text-lg font-black leading-none text-white">10% OFF</p>
                <p className="text-[11px] text-zinc-400">em pedidos acima de R$ 60,00</p>
              </div>
            </div>
            
            <div className="flex flex-col items-end gap-2">
               <button className="rounded-lg bg-zinc-900 border border-primary/30 px-3 py-1.5 text-[11px] font-black text-primary uppercase tracking-tight">
                 Aplicar cupom
               </button>
               <span className="text-[10px] font-bold text-zinc-500 bg-zinc-900/50 px-2 py-0.5 rounded border border-zinc-800">BRASA10</span>
            </div>
          </div>
        </div>

        {/* Lista de Produtos */}
        <section className="space-y-6 pt-2">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-extrabold tracking-tight">Destaques da casa</h2>
          </div>

          <div className="space-y-4">
            {MOCK_PRODUCTS.map((product) => (
              <div 
                key={product.id}
                className="grid grid-cols-[80px_1fr_auto] gap-4 rounded-2xl border border-zinc-900 bg-zinc-950/40 p-3 transition-colors active:bg-zinc-900/50"
              >
                <img 
                  src={product.image} 
                  alt={product.name}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/favicon.png";
                  }}
                  className="aspect-square w-full rounded-xl object-cover ring-1 ring-white/5 bg-zinc-900"
                />
                <div className="flex flex-col justify-center min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-[15px] font-bold text-white">{product.name}</h3>
                    {product.isPopular && (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-black text-primary uppercase">
                        <Flame className="h-2.5 w-2.5" /> Mais pedido
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-zinc-500">
                    {product.description}
                  </p>
                  <p className="mt-2 text-[15px] font-black text-primary">
                    R$ {product.price.toFixed(2).replace('.', ',')}
                  </p>
                </div>
                <div className="flex items-center pl-1">
                  <button 
                    onClick={() => handleAddToCart(product)}
                    className="grid h-10 w-10 place-items-center rounded-full border border-primary/20 bg-primary/5 text-primary shadow-sm ring-1 ring-primary/20 transition-transform active:scale-90"
                  >
                    <Plus className="h-6 w-6" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Botão Flutuante da Sacola */}
      {cart.length > 0 && (
        <div className="sticky bottom-4 left-0 right-0 z-50 px-4">
          <button 
            onClick={() => navigate({ to: "/sacola" })}
            className="flex w-full items-center justify-between rounded-2xl bg-primary px-6 py-4 text-black shadow-[0_12px_24px_rgba(255,215,0,0.4)] ring-4 ring-black transition-transform active:scale-95"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-black text-[14px] font-black text-primary">
                {cart.length}
              </span>
              <span className="text-[16px] font-black uppercase tracking-tight">Ver sacola</span>
            </div>
            <span className="text-[16px] font-black">
              R$ {cart.reduce((acc, p) => acc + p.price, 0).toFixed(2).replace('.', ',')}
            </span>
          </button>
        </div>
      )}

      {/* Margem final para o scroll */}
      <div className="h-10 shrink-0" />
    </div>
  );
}