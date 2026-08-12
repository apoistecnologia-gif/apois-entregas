import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ShoppingBag,
  Heart,
  Loader2,
  RefreshCw,
  Store,
  Star,
  Clock,
  MapPin,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useCart } from "@/contexts/CartContext";
import { AppBottomNav } from "@/components/AppBottomNav";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type FavoriteMerchant = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  cover_url: string | null;
  description: string | null;
  delivery_fee: number | null;
  delivery_min_minutes: number | null;
  delivery_max_minutes: number | null;
  rating: number | null;
  review_count: number | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  is_open: boolean | null;
};

type FavoriteRow = {
  merchant_id: string;
  created_at: string;
  merchants: FavoriteMerchant | FavoriteMerchant[] | null;
};

export const Route = createFileRoute("/favoritos")({
  ssr: false,
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
  component: FavoritosPage,
  head: () => ({ meta: [{ title: "Favoritos | APOIS ENTREGA" }] }),
});

function normalizeMerchant(row: FavoriteRow): FavoriteMerchant | null {
  return (Array.isArray(row.merchants) ? row.merchants[0] : row.merchants) ?? null;
}

function currency(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function FavoritosPage() {
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const [favorites, setFavorites] = useState<FavoriteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: functionError } = await supabase.functions.invoke("customer-favorites", {
      body: { action: "list" },
    });

    if (functionError) {
      console.error("Erro ao carregar favoritos:", functionError);
      setFavorites([]);
      setError("Não foi possível carregar seus favoritos agora.");
    } else {
      setFavorites(Array.isArray(data?.favorites) ? (data.favorites as FavoriteRow[]) : []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  const removeFavorite = async (merchantId: string) => {
    if (removingId) return;
    setRemovingId(merchantId);
    const { data, error: functionError } = await supabase.functions.invoke("customer-favorites", {
      body: { action: "toggle", merchantId },
    });

    if (functionError || data?.favorite !== false) {
      console.error("Erro ao remover favorito:", functionError);
      toast.error("Não foi possível remover dos favoritos.");
    } else {
      setFavorites((current) => current.filter((favorite) => favorite.merchant_id !== merchantId));
      toast.success("Removido dos favoritos.");
    }
    setRemovingId(null);
  };

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-zinc-900 bg-black/85 px-4 pb-4 pt-[max(env(safe-area-inset-top),1rem)] backdrop-blur-lg">
        <button
          type="button"
          onClick={() => navigate({ to: "/inicio" })}
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar"
        >
          <ArrowLeft />
        </button>
        <h1 className="text-xl font-bold">Favoritos</h1>
        <button
          type="button"
          onClick={() => navigate({ to: "/sacola" })}
          className="relative rounded-full bg-zinc-900 p-2"
          aria-label="Abrir sacola"
        >
          <ShoppingBag />
          {totalItems > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-black">
              {totalItems}
            </span>
          )}
        </button>
      </header>

      <main className="scrollbar-none flex-1 overflow-y-auto p-4 pb-32">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-zinc-500">Carregando seus favoritos...</p>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-zinc-900">
              <Heart className="h-8 w-8 text-zinc-600" />
            </div>
            <h2 className="text-lg font-bold">Não foi possível carregar</h2>
            <p className="mt-2 max-w-xs text-sm text-zinc-500">{error}</p>
            <button
              type="button"
              onClick={() => void loadFavorites()}
              className="mt-6 flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-black uppercase text-black"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </button>
          </div>
        ) : favorites.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-zinc-900 ring-1 ring-zinc-800">
              <Heart className="h-8 w-8 text-zinc-600" />
            </div>
            <h2 className="text-lg font-bold">Nenhum favorito</h2>
            <p className="mt-2 max-w-xs text-sm text-zinc-500">
              Favorite estabelecimentos para encontrá-los rapidamente aqui.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/buscar", search: {} })}
              className="mt-6 rounded-xl bg-primary px-5 py-3 font-black uppercase text-black"
            >
              Explorar estabelecimentos
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {favorites.map((favorite) => {
              const merchant = normalizeMerchant(favorite);
              if (!merchant) return null;
              const deliveryTime =
                merchant.delivery_min_minutes && merchant.delivery_max_minutes
                  ? `${merchant.delivery_min_minutes}–${merchant.delivery_max_minutes} min`
                  : "Prazo a confirmar";

              return (
                <article
                  key={favorite.merchant_id}
                  className="overflow-hidden rounded-3xl border border-zinc-900 bg-zinc-950"
                >
                  <button
                    type="button"
                    onClick={() =>
                      navigate({
                        to: "/estabelecimento/$merchantId",
                        params: { merchantId: merchant.id },
                      })
                    }
                    className="grid w-full grid-cols-[84px_minmax(0,1fr)] gap-4 p-3 text-left transition-colors hover:bg-zinc-900/50"
                  >
                    <div className="relative h-[84px] w-[84px] overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/10">
                      {merchant.logo_url ? (
                        <img
                          src={merchant.logo_url}
                          alt={merchant.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center">
                          <Store className="h-8 w-8 text-zinc-700" />
                        </div>
                      )}
                      <span
                        className={`absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5 text-[9px] font-black ${
                          merchant.is_open
                            ? "bg-green-500/15 text-green-400"
                            : "bg-black/70 text-zinc-400"
                        }`}
                      >
                        {merchant.is_open ? "ABERTO" : "FECHADO"}
                      </span>
                    </div>

                    <div className="min-w-0 py-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="truncate text-base font-extrabold">{merchant.name}</h2>
                        <Heart className="h-4 w-4 shrink-0 fill-primary text-primary" />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                          {Number(merchant.rating ?? 0).toFixed(1)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          {deliveryTime}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-[11px] text-zinc-500">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">
                          {[merchant.neighborhood, merchant.city, merchant.state]
                            .filter(Boolean)
                            .join(" • ") || "Localização disponível no estabelecimento"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs font-bold text-primary">
                        Entrega {currency(merchant.delivery_fee)}
                      </p>
                    </div>
                  </button>

                  <div className="border-t border-zinc-900 px-3 py-2">
                    <button
                      type="button"
                      disabled={removingId === merchant.id}
                      onClick={() => void removeFavorite(merchant.id)}
                      className="ml-auto flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                    >
                      {removingId === merchant.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Heart className="h-4 w-4 fill-current" />
                      )}
                      Remover dos favoritos
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
      <AppBottomNav activeTab="favoritos" />
    </div>
  );
}
