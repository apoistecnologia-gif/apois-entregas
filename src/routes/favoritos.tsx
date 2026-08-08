import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bike, Heart, Loader2, ShoppingBag, Star, Store } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AppBottomNav } from "@/components/AppBottomNav";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCustomerFavorites,
  FavoritesError,
  toggleMerchantFavorite,
  type CustomerFavorite,
} from "@/lib/favorites";

export const Route = createFileRoute("/favoritos")({
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
});

function money(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function FavoritosPage() {
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const [favorites, setFavorites] = useState<CustomerFavorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadFavorites = useCallback(async () => {
    try {
      setFavorites(await fetchCustomerFavorites());
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof FavoritesError
          ? loadError.message
          : "Não foi possível carregar seus favoritos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  const removeFavorite = async (merchantId: string) => {
    if (removingId) return;
    setRemovingId(merchantId);
    try {
      const favorite = await toggleMerchantFavorite(merchantId);
      if (!favorite) {
        setFavorites((current) => current.filter((item) => item.merchant_id !== merchantId));
      }
    } catch (removeError) {
      setError(
        removeError instanceof FavoritesError
          ? removeError.message
          : "Não foi possível remover dos favoritos.",
      );
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-zinc-900 bg-black/80 p-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => void navigate({ to: "/inicio" })}
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar ao início"
        >
          <ArrowLeft />
        </button>
        <h1 className="text-xl font-bold">Favoritos</h1>
        <button
          type="button"
          onClick={() => void navigate({ to: "/sacola" })}
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

      <main className="scrollbar-none flex-1 space-y-4 overflow-y-auto p-4 pb-24">
        {loading && (
          <div className="flex h-52 items-center justify-center text-primary">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-950 bg-red-950/20 p-5 text-center">
            <p className="text-sm text-red-200">{error}</p>
            <button
              type="button"
              onClick={() => void loadFavorites()}
              className="mt-4 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-black"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!loading && !error && favorites.length > 0 &&
          favorites.map((favorite) => {
            const merchant = favorite.merchants;
            if (!merchant) return null;

            return (
              <article
                key={favorite.merchant_id}
                className="overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950"
              >
                <button
                  type="button"
                  onClick={() =>
                    void navigate({ to: "/estabelecimento/$merchantId", params: { merchantId: merchant.id } })
                  }
                  className="w-full text-left"
                >
                  <div className="relative h-28 bg-zinc-900">
                    {merchant.cover_url ? (
                      <img
                        src={merchant.cover_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <Store className="h-8 w-8 text-zinc-700" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  </div>
                  <div className="flex gap-3 p-4">
                    {merchant.logo_url ? (
                      <img
                        src={merchant.logo_url}
                        alt={merchant.name}
                        className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-white/10"
                      />
                    ) : (
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-zinc-900">
                        <Store className="h-6 w-6 text-zinc-700" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="truncate font-black">{merchant.name}</h2>
                        <span className={merchant.is_open ? "text-xs font-bold text-green-500" : "text-xs font-bold text-zinc-600"}>
                          {merchant.is_open ? "Aberto" : "Fechado"}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                        <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                        <span className="font-bold text-primary">{merchant.rating.toFixed(1)}</span>
                        <span>({merchant.review_count})</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Bike className="h-3.5 w-3.5" /> {money(merchant.delivery_fee)}
                        </span>
                        {merchant.delivery_min_minutes && merchant.delivery_max_minutes && (
                          <span>{merchant.delivery_min_minutes}-{merchant.delivery_max_minutes} min</span>
                        )}
                        {(merchant.neighborhood || merchant.city) && (
                          <span>{[merchant.neighborhood, merchant.city].filter(Boolean).join(" · ")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>

                <div className="border-t border-zinc-900 p-3">
                  <button
                    type="button"
                    disabled={removingId === merchant.id}
                    onClick={() => void removeFavorite(merchant.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary/10 py-2.5 text-sm font-bold text-primary disabled:opacity-50"
                  >
                    {removingId === merchant.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Heart className="h-4 w-4 fill-primary" />
                    )}
                    Remover dos favoritos
                  </button>
                </div>
              </article>
            );
          })}

        {!loading && !error && favorites.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-zinc-900">
              <Heart className="h-8 w-8 text-zinc-600" />
            </div>
            <h2 className="text-lg font-bold">Nenhum favorito</h2>
            <p className="mt-2 max-w-xs text-sm text-zinc-500">
              Toque no coração de um estabelecimento para encontrá-lo rapidamente aqui.
            </p>
            <button
              type="button"
              onClick={() => void navigate({ to: "/inicio" })}
              className="mt-5 rounded-xl bg-primary px-6 py-3 font-bold text-black"
            >
              Explorar estabelecimentos
            </button>
          </div>
        )}
      </main>
      <AppBottomNav activeTab="favoritos" />
    </div>
  );
}
