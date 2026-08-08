import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type MerchantCategory = Tables<"merchant_categories">;
export type Merchant = Tables<"merchants">;
export type MenuCategory = Tables<"menu_categories">;
export type Product = Tables<"products">;
export type ProductOptionGroup = Tables<"product_option_groups">;
export type ProductOption = Tables<"product_options">;

export const fetchMerchantCategories = async (): Promise<MerchantCategory[]> => {
  const { data, error } = await supabase
    .from("merchant_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
};

export const fetchMerchants = async (city?: string, state?: string): Promise<Merchant[]> => {
  let query = supabase.from("merchants").select("*").eq("is_active", true);

  if (city && state) {
    query = query.ilike("city", city).ilike("state", state);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
};

export const fetchMerchantById = async (id: string): Promise<Merchant> => {
  const { data, error } = await supabase
    .from("merchants")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error) throw error;
  return data;
};

export const fetchMenuCategoriesByMerchant = async (merchantId: string): Promise<MenuCategory[]> => {
  const { data, error } = await supabase
    .from("menu_categories")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
};

export const fetchProductsByMerchant = async (merchantId: string): Promise<Product[]> => {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("is_available", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
};

export const fetchMerchantCategoryById = async (id: string): Promise<MerchantCategory> => {
  const { data, error } = await supabase
    .from("merchant_categories")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
};

export const fetchProductOptionGroups = async (productId: string): Promise<ProductOptionGroup[]> => {
  const { data, error } = await supabase
    .from("product_option_groups")
    .select("*")
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
};

export const fetchProductOptionsByGroupIds = async (groupIds: string[]): Promise<ProductOption[]> => {
  if (groupIds.length === 0) return [];

  const { data, error } = await supabase
    .from("product_options")
    .select("*")
    .in("option_group_id", groupIds)
    .eq("is_available", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
};

export const fetchProductCustomization = async (productId: string) => {
  const groups = await fetchProductOptionGroups(productId);
  const groupIds = groups.map((group) => group.id);
  const options = await fetchProductOptionsByGroupIds(groupIds);

  return { groups, options };
};
