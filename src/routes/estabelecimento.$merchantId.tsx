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
  ChevronDown,
  Store
} from "lucide-react";
import { 
  fetchMerchantById, 
  fetchMenuCategoriesByMerchant, 
  fetchProductsByMerchant 
} from "@/lib/catalog";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";


export const Route = createFileRoute("/estabelecimento/$merchantId")({
  component: EstabelecimentoPage,
});

function EstabelecimentoPage() {
  const { merchantId } = useParams({ from: "/estabelecimento/$merchantId" });
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("all");
  const [isFavorite, setIsFavorite] = useState(false);
  const [merchant, setMerchant] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { addItem, totalPrice, totalItems, merchant: cartMerchant, clearCart } = useCart();
  
  useEffect(() => {
    const fetchData = async () => {
      if (!merchantId) return;
      setIsLoading(true);
      setError(null);
      try {
        const [merchantData, catsData, prodsData] = await Promise.all([
          fetchMerchantById(merchantId),
          fetchMenuCategoriesByMerchant(merchantId),
          fetchProductsByMerchant(merchantId)
        ]);
        
        setMerchant(merchantData);
        setCategories(catsData);
        setProducts(prodsData);
      } catch (err: any) {
        console.error("Error fetching merchant details:", err);
        setError("Estabelecimento não encontrado");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [merchantId]);

  const handleAddToCart = (product: any) => {
    if (cartMerchant && cartMerchant.id !== merchantId) {
      if (!window.confirm("Você já tem itens de outro estabelecimento na sacola. Deseja limpar a sacola e iniciar um novo pedido aqui?")) {
        return;
      }
      clearCart();
    }

    addItem({
      id: product.id,
      name: product.name,
      description: product.description || "",
      price: product.price,
      image: product.image_url || "",
      merchantId: merchantId
    }, {
      id: merchantId,
      name: merchant.name,
      logo: merchant.logo_url || "",
      deliveryFee: merchant.delivery_fee,
      deliveryTime: merchant.delivery_min_minutes && merchant.delivery_max_minutes 
        ? `${merchant.delivery_min_minutes}-${merchant.delivery_max_minutes} min`
        : "30-45 min",
      closeTime: merchant.closes_at || "",
      category: merchant.category_name || "Estabelecimento"
    });
    
    toast.success(`${product.name} adicionado à sacola!`);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !merchant) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-black px-6 text-center">
        <h2 className="text-xl font-bold text-white">{error || "Estabelecimento não encontrado"}</h2>
        <button 
          onClick={() => window.history.back()}
          className="mt-4 flex items-center gap-2 text-primary font-bold"
        >
          <ArrowLeft className="h-5 w-5" /> Voltar
        </button>
      </div>
    );
  }


  return (
    <div className="flex min-h-full w-full flex-col overflow-x-hidden bg-black text-white selection:bg-primary selection:text-black">
      {/* Header com Capa */}
      <div className="relative h-60 w-full shrink-0">
        {merchant.cover_url ? (
          <img 
            src={merchant.cover_url} 
            alt={merchant.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-zinc-900" />
        )}
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
            {merchant.logo_url ? (
              <img 
                src={merchant.logo_url} 
                alt="Logo"
                className="h-full w-full object-cover bg-zinc-900"
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-zinc-900">
                <Store className="h-10 w-10 text-zinc-700" />
              </div>
            )}
            {/* Overlay decorativo se necessário */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
               <Flame className="h-8 w-8 text-primary opacity-40" />
            </div>
          </div>
        </div>
      </div>


      {/* Info do Estabelecimento */}
      <div className="mt-12 px-4 space-y-4 pb-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">{merchant.name}</h1>
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 fill-primary text-primary" />
            <span className="text-[14px] font-bold text-primary">{merchant.rating}</span>
            <span className="text-[14px] text-zinc-500">({merchant.review_count} avaliações)</span>
          </div>
        </div>

        {/* Info Grid Premium */}
        <div className="grid grid-cols-3 gap-0 rounded-2xl border border-zinc-800 bg-zinc-950/50 py-3 shadow-inner shadow-black/60">
          <div className="flex flex-col items-center justify-center gap-1 border-r border-zinc-800 px-2">
            <Clock className="h-5 w-5 text-primary" />
            <span className="text-[12px] font-bold text-white">
              {merchant.delivery_min_minutes && merchant.delivery_max_minutes 
                ? `${merchant.delivery_min_minutes}-${merchant.delivery_max_minutes} min`
                : "30-45 min"}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Tempo</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-1 border-r border-zinc-800 px-2">
            <Bike className="h-5 w-5 text-primary" />
            <span className="text-[12px] font-bold text-white">R$ {merchant.delivery_fee.toFixed(2).replace('.', ',')}</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Taxa</span>
          </div>
          <button className="flex flex-col items-center justify-center gap-1 px-2 group">
            <div className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${merchant.is_open ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-[12px] font-bold text-green-500">{merchant.is_open ? "Aberto" : "Fechado"}{merchant.closes_at ? ` até ${merchant.closes_at}` : ""}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500 group-active:text-primary">
              Ver horário <ChevronRight className="h-3 w-3" />
            </div>
          </button>
        </div>

        {/* Descrição */}
        {merchant.description && (
          <div className="relative">
            <p className="text-[14px] leading-relaxed text-zinc-400 line-clamp-3">
              {merchant.description}
            </p>
          </div>
        )}

        {/* Categorias do Menu */}
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 py-2">
          <button
            onClick={() => setActiveCategory("all")}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold transition-all ${
              activeCategory === "all" 
              ? "bg-primary text-black shadow-[0_4px_12px_rgba(255,215,0,0.3)] scale-[1.05]" 
              : "bg-zinc-900 text-zinc-400 border border-zinc-800"
            }`}
          >
            Todos
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold transition-all ${
                activeCategory === cat.id 
                ? "bg-primary text-black shadow-[0_4px_12px_rgba(255,215,0,0.3)] scale-[1.05]" 
                : "bg-zinc-900 text-zinc-400 border border-zinc-800"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>


        {/* Lista de Produtos */}
        <section className="space-y-6 pt-2">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-extrabold tracking-tight">Menu</h2>
          </div>

          <div className="space-y-4">
            {products
              .filter(p => activeCategory === "all" || p.menu_category_id === activeCategory)
              .map((product) => (
              <div 
                key={product.id}
                className="grid grid-cols-[80px_1fr_auto] gap-4 rounded-2xl border border-zinc-900 bg-zinc-950/40 p-3 transition-colors active:bg-zinc-900/50"
              >
                <div className="aspect-square w-full rounded-xl overflow-hidden ring-1 ring-white/5 bg-zinc-900">
                  {product.image_url ? (
                    <img 
                      src={product.image_url} 
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center">
                      <Store className="h-6 w-6 text-zinc-800" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col justify-center min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-[15px] font-bold text-white">{product.name}</h3>
                    {product.is_featured && (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-black text-primary uppercase">
                        <Flame className="h-2.5 w-2.5" /> Destaque
                      </span>
                    )}
                  </div>
                  {product.description && (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-zinc-500">
                      {product.description}
                    </p>
                  )}
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
            
            {products.filter(p => activeCategory === "all" || p.menu_category_id === activeCategory).length === 0 && (
              <div className="py-8 text-center text-zinc-500 text-sm italic">
                Nenhum produto encontrado nesta categoria.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Botão Flutuante da Sacola */}
      {totalItems > 0 && (
        <div className="sticky bottom-4 left-0 right-0 z-50 px-4">
          <button 
            onClick={() => navigate({ to: "/sacola" })}
            className="flex w-full items-center justify-between rounded-2xl bg-primary px-6 py-4 text-black shadow-[0_12px_24px_rgba(255,215,0,0.4)] ring-4 ring-black transition-transform active:scale-95"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-black text-[14px] font-black text-primary">
                {totalItems}
              </span>
              <span className="text-[16px] font-black uppercase tracking-tight">Ver sacola</span>
            </div>
            <span className="text-[16px] font-black">
              R$ {totalPrice.toFixed(2).replace('.', ',')}
            </span>
          </button>
        </div>
      )}

      {/* Margem final para o scroll */}
      <div className="h-10 shrink-0" />
    </div>
  );
}