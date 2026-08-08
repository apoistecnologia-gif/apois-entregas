import { supabase } from "@/integrations/supabase/client";

export type FavoriteMerchant = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  cover_url: string | null;
  description: string | null;
  delivery_fee: number;
  delivery_min_minutes: number | null;
  delivery_max_minutes: number | null;
  rating: number;
  review_count: number;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  is_open: boolean;
};

export type CustomerFavorite = {
  merchant_id: string;
  created_at: string;
  merchants: FavoriteMerchant | null;
};

type FavoritesListResponse = { favorites: CustomerFavorite[] };
type FavoriteStatusResponse = { favorite: boolean };
type FunctionErrorBody = { error?: string; code?: string };

export class FavoritesError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "FavoritesError";
    this.code = code;
  }
}

async function invokeFavorites<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("customer-favorites", { body });
  if (error || !data) {
    let message = "Não foi possível atualizar seus favoritos.";
    let code: string | undefined;
    const context = error?.context;
    if (context instanceof Response) {
      try {
        const payload = (await context.clone().json()) as FunctionErrorBody;
        if (payload.error) message = payload.error;
        code = payload.code;
      } catch {
        // Keep safe fallback.
      }
    }
    throw new FavoritesError(message, code);
  }
  return data;
}

export async function fetchCustomerFavorites(): Promise<CustomerFavorite[]> {
  const data = await invokeFavorites<FavoritesListResponse>({ action: "list" });
  return data.favorites.map((favorite) => ({
    ...favorite,
    merchants: favorite.merchants
      ? {
          ...favorite.merchants,
          delivery_fee: Number(favorite.merchants.delivery_fee),
          rating: Number(favorite.merchants.rating),
          review_count: Number(favorite.merchants.review_count),
        }
      : null,
  }));
}

export async function isMerchantFavorite(merchantId: string): Promise<boolean> {
  const data = await invokeFavorites<FavoriteStatusResponse>({ action: "status", merchantId });
  return data.favorite;
}

export async function toggleMerchantFavorite(merchantId: string): Promise<boolean> {
  const data = await invokeFavorites<FavoriteStatusResponse>({ action: "toggle", merchantId });
  return data.favorite;
}
