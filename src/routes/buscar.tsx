import { createFileRoute, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMerchantCategories, fetchMerchants } from "@/lib/catalog";
import {
  fetchMerchantsHoursBatch,
  fetchMerchantsSpecialHoursBatch,
  calculateMerchantStatus,
} from "@/lib/merchant-hours";
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
  Store,
  PackageSearch,
  SlidersHorizontal,
} from "lucide-react";
import { AppBottomNav } from "@/components/AppBottomNav";
import { Input } from "@/components/ui/input";
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

type SearchProduct = {
  id: string;
  merchant_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
};

type SortMode = "recommended" | "rating" | "time" | "fee" | "distance";

export const Route = createFileRoute("/buscar")({
  ssr: false,
  validateSearch: (search) => searchSchema.parse(search),
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
    return { session };
  },
  component: Buscar,
  head: () => ({
    meta: [
      { title: "Buscar | APOIS ENTREGA" },
      {
        name: "description",
        content: "Encontre estabelecimentos e produtos no APOIS ENTREGA.",
      },
    ],
  }),
});

function distanceKm(
  fromLat: unknown,
  fromLng: unknown,
  toLat: unknown,
  toLng: unknown,
): number | null {
  const lat1 = Number(fromLat);
  const lng1 = Number(fromLng);
  const lat2 = Number(toLat);
  const lng2 = Number(toLng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;

  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function Buscar() {
  const navigate = useNavigate();
  const searchParams = useSearch({ from: "/buscar" });
  const { totalItems } = useCart();
  const [defaultAddress, setDefaultAddress] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [products, setProducts] = useState<SearchProduct[]>([]);
  const [merchantsHours, setMerchantsHours] = useState<any[]>([]);
  const [merchantsSpecialHours, setMerchantsSpecialHours] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [searchTerm, setSearchTerm] = useState(searchParams.q || "");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão do cliente indisponível.");

      const { data: addrData, error: addrError } = await supabase
        .from("customer_addresses" as any)
        .select("*")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();
      if (addrError) throw addrError;
      setDefaultAddress(addrData);

      const cats = await fetchMerchantCategories();
      setCategories(cats);

      if (!addrData) {
        setMerchants([]);
        setProducts([]);
        setMerchantsHours([]);
        setMerchantsSpecialHours([]);
        return;
      }

      const mers = await fetchMerchants((addrData as any).city, (addrData as any).state);
      setMerchants(mers);
      if (mers.length === 0) {
        setProducts([]);
        setMerchantsHours([]);
        setMerchantsSpecialHours([]);
        return;
      }

      const merchantIds = mers.map((merchant) => merchant.id);
      const productChunks: string[][] = [];
      for (let index = 0; index < merchantIds.length; index += 100) {
        productChunks.push(merchantIds.slice(index, index + 100));
      }

      const [hours, specialHours, productResponses] = await Promise.all([
        fetchMerchantsHoursBatch(merchantIds),
        fetchMerchantsSpecialHoursBatch(merchantIds),
        Promise.all(
          productChunks.map((chunk) =>
            supabase
              .from("products")
              .select("id,merchant_id,name,description,price,image_url")
              .in("merchant_id", chunk)
              .eq("is_available", true)
              .order("sort_order", { ascending: true }),
          ),
        ),
      ]);

      const productRows: SearchProduct[] = [];
      for (const productResponse of productResponses) {
        if (productResponse.error) throw productResponse.error;
        for (const product of productResponse.data ?? []) {
          productRows.push({
            ...product,
            price: Number(product.price),
          } as SearchProduct);
        }
      }

      setProducts(productRows);
      setMerchantsHours(hours);
      setMerchantsSpecialHours(specialHours);
    } catch (err) {
      console.error("Error fetching customer search catalog:", err);
      setError("Ocorreu um erro ao carregar o catálogo.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (searchInputRef.current && !searchParams.categoria && !searchParams.q) {
      searchInputRef.current.focus();
    }
  }, [searchParams.categoria, searchParams.q]);

  useEffect(() => {
    setSearchTerm(searchParams.q || "");
  }, [searchParams.q]);

  const merchantStatus = useCallback(
    (merchantId: string) =>
      calculateMerchantStatus(
        merchantsHours.filter((hour) => hour.merchant_id === merchantId),
        undefined,
        merchantsSpecialHours.filter((hour) => hour.merchant_id === merchantId),
      ),
    [merchantsHours, merchantsSpecialHours],
  );

  const merchantById = useMemo(
    () => new Map(merchants.map((merchant) => [merchant.id, merchant])),
    [merchants],
  );

  const matchingProducts = useMemo(() => {
    const query = searchParams.q?.trim().toLowerCase() ?? "";
    const categoryId = searchParams.categoria;
    if (!query) return [];

    return products
      .filter((product) => {
        const merchant = merchantById.get(product.merchant_id);
        if (!merchant) return false;
        const matchesText =
          product.name.toLowerCase().includes(query) ||
          (product.description?.toLowerCase().includes(query) ?? false);
        const matchesCategory = !categoryId || merchant.category_id === categoryId;
        const matchesOpen = !onlyOpen || merchantStatus(merchant.id).status === "open";
        return matchesText && matchesCategory && matchesOpen;
      })
      .sort((left, right) => {
        const leftMerchant = merchantById.get(left.merchant_id);
        const rightMerchant = merchantById.get(right.merchant_id);
        if (!leftMerchant || !rightMerchant) return left.name.localeCompare(right.name, "pt-BR");
        if (sortMode === "rating")
          return Number(rightMerchant.rating) - Number(leftMerchant.rating);
        if (sortMode === "time")
          return (
            Number(leftMerchant.delivery_min_minutes ?? Number.MAX_SAFE_INTEGER) -
            Number(rightMerchant.delivery_min_minutes ?? Number.MAX_SAFE_INTEGER)
          );
        if (sortMode === "fee")
          return Number(leftMerchant.delivery_fee ?? 0) - Number(rightMerchant.delivery_fee ?? 0);
        if (sortMode === "distance") {
          const leftDistance =
            distanceKm(
              defaultAddress?.latitude,
              defaultAddress?.longitude,
              leftMerchant.latitude,
              leftMerchant.longitude,
            ) ?? Number.MAX_SAFE_INTEGER;
          const rightDistance =
            distanceKm(
              defaultAddress?.latitude,
              defaultAddress?.longitude,
              rightMerchant.latitude,
              rightMerchant.longitude,
            ) ?? Number.MAX_SAFE_INTEGER;
          return leftDistance - rightDistance;
        }
        return left.name.localeCompare(right.name, "pt-BR");
      })
      .slice(0, 40);
  }, [
    defaultAddress?.latitude,
    defaultAddress?.longitude,
    merchantById,
    merchantStatus,
    onlyOpen,
    products,
    searchParams.categoria,
    searchParams.q,
    sortMode,
  ]);

  const filteredMerchants = useMemo(() => {
    const query = searchParams.q?.trim().toLowerCase() ?? "";
    const categoryId = searchParams.categoria;
    const merchantsWithMatchingProducts = new Set(
      matchingProducts.map((product) => product.merchant_id),
    );

    const result = merchants.filter((merchant) => {
      const merchantCategoryName =
        categories.find((category) => category.id === merchant.category_id)?.name?.toLowerCase() ??
        "";
      const matchesQuery =
        !query ||
        merchant.name.toLowerCase().includes(query) ||
        (merchant.tags?.some((tag: string) => tag.toLowerCase().includes(query)) ?? false) ||
        merchantCategoryName.includes(query) ||
        merchantsWithMatchingProducts.has(merchant.id);
      const matchesCategory = !categoryId || merchant.category_id === categoryId;
      const matchesOpen = !onlyOpen || merchantStatus(merchant.id).status === "open";
      return matchesQuery && matchesCategory && matchesOpen;
    });

    return [...result].sort((left, right) => {
      if (sortMode === "rating") return Number(right.rating) - Number(left.rating);
      if (sortMode === "time")
        return (
          Number(left.delivery_min_minutes ?? Number.MAX_SAFE_INTEGER) -
          Number(right.delivery_min_minutes ?? Number.MAX_SAFE_INTEGER)
        );
      if (sortMode === "fee")
        return Number(left.delivery_fee ?? 0) - Number(right.delivery_fee ?? 0);
      if (sortMode === "distance") {
        const leftDistance =
          distanceKm(
            defaultAddress?.latitude,
            defaultAddress?.longitude,
            left.latitude,
            left.longitude,
          ) ?? Number.MAX_SAFE_INTEGER;
        const rightDistance =
          distanceKm(
            defaultAddress?.latitude,
            defaultAddress?.longitude,
            right.latitude,
            right.longitude,
          ) ?? Number.MAX_SAFE_INTEGER;
        return leftDistance - rightDistance;
      }

      const leftOpen = merchantStatus(left.id).status === "open" ? 1 : 0;
      const rightOpen = merchantStatus(right.id).status === "open" ? 1 : 0;
      if (leftOpen !== rightOpen) return rightOpen - leftOpen;
      return Number(right.rating ?? 0) - Number(left.rating ?? 0);
    });
  }, [
    categories,
    defaultAddress?.latitude,
    defaultAddress?.longitude,
    matchingProducts,
    merchantStatus,
    merchants,
    onlyOpen,
    searchParams.categoria,
    searchParams.q,
    sortMode,
  ]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = searchTerm.trim();
    navigate({
      to: "/buscar",
      search: (previous: any) => ({ ...previous, q: normalized || undefined }),
      replace: true,
    });
  };

  const clearSearch = () => {
    setSearchTerm("");
    navigate({
      to: "/buscar",
      search: (previous: any) => ({ ...previous, q: undefined }),
      replace: true,
    });
  };

  const handleCategoryClick = (categoryId: string) => {
    const nextCategory = searchParams.categoria === categoryId ? undefined : categoryId;
    navigate({
      to: "/buscar",
      search: (previous: any) => ({ ...previous, categoria: nextCategory }),
      replace: true,
    });
  };

  const resultCount = filteredMerchants.length + matchingProducts.length;

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white selection:bg-primary selection:text-black">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 pb-2 pt-[max(env(safe-area-inset-top),1.5rem)]">
        <img
          src={logoAsset.url}
          alt="APOIS ENTREGA"
          className="h-8 w-auto object-contain object-left"
        />
        <button
          type="button"
          onClick={() => navigate({ to: "/sacola" })}
          className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-950 text-white"
          aria-label="Sacola"
        >
          <ShoppingBag className="h-[18px] w-[18px]" />
          {totalItems > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-black ring-2 ring-zinc-950">
              {totalItems}
            </span>
          ) : null}
        </button>
      </header>

      <main className="scrollbar-none flex-1 space-y-4 overflow-y-auto px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/enderecos" })}
          className="flex w-full items-center gap-2 rounded-xl border border-zinc-800/50 bg-zinc-900/30 px-3 py-2 text-left transition-transform active:scale-[0.98]"
        >
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              ENTREGAR EM
            </span>
            <span className="truncate text-[13px] font-semibold text-zinc-200">
              {isLoading
                ? "..."
                : defaultAddress
                  ? `${defaultAddress.label}: ${defaultAddress.street}, ${defaultAddress.number}`
                  : "Informe seu endereço"}
            </span>
          </div>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-primary/70" />
        </button>

        <form onSubmit={handleSearch} className="group relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary transition-colors group-focus-within:text-white" />
          <Input
            ref={searchInputRef}
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Busque loja, produto ou categoria"
            className="h-[52px] rounded-2xl border-zinc-800 bg-zinc-950/90 pl-12 pr-10 text-[15px] text-white shadow-inner shadow-black/60 placeholder:text-zinc-500 focus-visible:border-primary/50 focus-visible:ring-primary/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {searchTerm ? (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-zinc-800 p-0.5 text-zinc-400 hover:text-white"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </form>

        <div className="grid grid-cols-4 gap-2.5">
          {isLoading
            ? Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex animate-pulse flex-col items-center gap-2">
                  <div className="aspect-square w-full rounded-2xl bg-zinc-900" />
                  <div className="h-2 w-10 rounded bg-zinc-900" />
                </div>
              ))
            : categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => handleCategoryClick(category.id)}
                  className="group flex min-w-0 flex-col items-center gap-2"
                >
                  <div
                    className={`relative grid aspect-square w-full place-items-center overflow-hidden rounded-2xl bg-zinc-900 transition-all group-active:scale-95 ${
                      searchParams.categoria === category.id
                        ? "scale-[1.02] ring-2 ring-primary shadow-[0_0_20px_-5px_rgba(255,215,0,0.4)]"
                        : "opacity-70 ring-1 ring-white/10"
                    }`}
                  >
                    {category.image_url ? (
                      <img
                        src={category.image_url}
                        alt={category.name}
                        loading="lazy"
                        className="relative h-[72%] w-[72%] object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)]"
                      />
                    ) : category.slug === "restaurantes" ? (
                      <img
                        src={catRestaurantes}
                        alt={category.name}
                        className="relative h-[72%] w-[72%] object-contain"
                      />
                    ) : category.slug === "mercados" ? (
                      <img
                        src={catMercados}
                        alt={category.name}
                        className="relative h-[72%] w-[72%] object-contain"
                      />
                    ) : category.slug === "farmacias" ? (
                      <img
                        src={catFarmacias}
                        alt={category.name}
                        className="relative h-[72%] w-[72%] object-contain"
                      />
                    ) : category.slug === "lojas" ? (
                      <img
                        src={catLojas}
                        alt={category.name}
                        className="relative h-[72%] w-[72%] object-contain"
                      />
                    ) : (
                      <Store className="h-6 w-6 text-zinc-700" />
                    )}
                  </div>
                  <span
                    className={`w-full truncate text-center text-[10px] font-bold tracking-tight ${
                      searchParams.categoria === category.id ? "text-primary" : "text-zinc-500"
                    }`}
                  >
                    {category.name.toUpperCase()}
                  </span>
                </button>
              ))}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setOnlyOpen((value) => !value)}
            aria-pressed={onlyOpen}
            className={`shrink-0 rounded-full border px-3 py-2 text-[11px] font-black uppercase transition-colors ${
              onlyOpen
                ? "border-primary bg-primary text-black"
                : "border-zinc-800 bg-zinc-950 text-zinc-400"
            }`}
          >
            Abertos agora
          </button>
          <label className="relative flex shrink-0 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] font-bold text-zinc-400">
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
            <span className="sr-only">Ordenar resultados</span>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="appearance-none bg-transparent pr-4 text-[11px] font-bold text-zinc-300 outline-none"
              aria-label="Ordenar resultados"
            >
              <option value="recommended">Recomendados</option>
              <option value="rating">Melhor avaliação</option>
              <option value="time">Menor prazo</option>
              <option value="fee">Menor taxa</option>
              <option value="distance">Mais próximos</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-zinc-500" />
          </label>
        </div>

        {(searchParams.q || searchParams.categoria || onlyOpen) && !isLoading ? (
          <p className="text-[13px] font-medium text-zinc-500" aria-live="polite">
            {resultCount > 0 ? (
              <>
                Encontramos <span className="font-bold text-primary">{resultCount}</span>{" "}
                {resultCount === 1 ? "resultado" : "resultados"}
              </>
            ) : (
              "Nenhum resultado encontrado com estes filtros."
            )}
          </p>
        ) : null}

        <section className="min-h-[40vh] space-y-5 pt-1">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 w-full animate-pulse rounded-3xl bg-zinc-900" />
            ))
          ) : error ? (
            <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-red-900/50 bg-red-950/10 px-6 py-16 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-zinc-900 ring-1 ring-zinc-800/50">
                <X className="h-9 w-9 text-red-500" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-zinc-200">Erro ao carregar</h3>
                <p className="mx-auto max-w-[240px] text-[13px] leading-relaxed text-zinc-500">
                  {error}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchData()}
                className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-black"
              >
                Tentar novamente
              </button>
            </div>
          ) : !defaultAddress ? (
            <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-primary/20 bg-primary/5 px-6 py-16 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-zinc-900 ring-1 ring-primary/30">
                <MapPin className="h-9 w-9 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-zinc-200">Selecione um endereço</h3>
                <p className="mx-auto max-w-[240px] text-[13px] leading-relaxed text-zinc-500">
                  Informe sua localização para encontrar estabelecimentos e produtos que atendem sua
                  região.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate({ to: "/enderecos" })}
                className="mt-2 rounded-full bg-primary px-8 py-2.5 text-[14px] font-bold text-black transition-transform active:scale-95"
              >
                Configurar endereço
              </button>
            </div>
          ) : resultCount > 0 || (!searchParams.q && filteredMerchants.length > 0) ? (
            <>
              {matchingProducts.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <PackageSearch className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">
                      Produtos
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
                    {matchingProducts.map((product) => {
                      const merchant = merchantById.get(product.merchant_id);
                      if (!merchant) return null;
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() =>
                            navigate({
                              to: "/estabelecimento/$merchantId",
                              params: { merchantId: merchant.id },
                            })
                          }
                          className="flex min-w-0 gap-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-3 text-left active:scale-[0.98]"
                        >
                          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/5">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <PackageSearch className="h-6 w-6 text-zinc-700" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm font-extrabold text-white">
                              {product.name}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-zinc-500">
                              {merchant.name}
                            </p>
                            <p className="mt-2 text-sm font-black text-primary">
                              R$ {Number(product.price).toFixed(2).replace(".", ",")}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {filteredMerchants.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">
                      Estabelecimentos
                    </h2>
                  </div>
                  <div className="flex flex-col gap-3">
                    {filteredMerchants.map((merchant) => {
                      const status = merchantStatus(merchant.id);
                      const distance = distanceKm(
                        defaultAddress?.latitude,
                        defaultAddress?.longitude,
                        merchant.latitude,
                        merchant.longitude,
                      );
                      return (
                        <button
                          key={merchant.id}
                          type="button"
                          onClick={() =>
                            navigate({
                              to: "/estabelecimento/$merchantId",
                              params: { merchantId: merchant.id },
                            })
                          }
                          className="group grid grid-cols-[84px_1fr] items-center gap-4 rounded-3xl border border-zinc-900 bg-zinc-950/50 p-3 text-left transition-all hover:bg-zinc-900/50 active:scale-[0.98]"
                        >
                          <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/10">
                            {merchant.logo_url ? (
                              <img
                                src={merchant.logo_url}
                                alt={merchant.name}
                                loading="lazy"
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
                              <span>{Number(merchant.rating ?? 0).toFixed(1)}</span>
                            </div>
                          </div>

                          <div className="flex min-w-0 flex-col justify-center gap-1.5">
                            <h3 className="truncate text-base font-extrabold text-white">
                              {merchant.name}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-zinc-400">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5 text-primary" />
                                {merchant.delivery_min_minutes && merchant.delivery_max_minutes
                                  ? `${merchant.delivery_min_minutes}-${merchant.delivery_max_minutes} min`
                                  : "Prazo não informado"}
                              </span>
                              <span className="flex items-center gap-1">
                                <Bike className="h-3.5 w-3.5 text-primary" />
                                {Number(merchant.delivery_fee) > 0
                                  ? `R$ ${Number(merchant.delivery_fee).toFixed(2).replace(".", ",")}`
                                  : "Grátis"}
                              </span>
                              {distance !== null ? (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5 text-primary" />
                                  {distance < 10 ? distance.toFixed(1) : Math.round(distance)} km
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-bold">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  status.status === "open"
                                    ? "bg-green-500"
                                    : status.status === "closed"
                                      ? "bg-red-500"
                                      : "bg-zinc-500"
                                }`}
                              />
                              <span
                                className={
                                  status.status === "open"
                                    ? "text-green-500"
                                    : status.status === "closed"
                                      ? "text-red-500"
                                      : "text-zinc-500"
                                }
                              >
                                {status.message}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/40 px-6 py-16 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-zinc-900 ring-1 ring-zinc-800/50">
                <Search className="h-9 w-9 text-zinc-700" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-zinc-200">Nada encontrado</h3>
                <p className="mx-auto max-w-[250px] text-[13px] leading-relaxed text-zinc-500">
                  Não encontramos estabelecimentos nem produtos com estes filtros na sua região.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setOnlyOpen(false);
                  setSortMode("recommended");
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
