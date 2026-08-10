import { supabase } from "@/integrations/supabase/client";

const PUBLIC_MERCHANT_COLUMNS =
  "id,category_id,name,slug,description,logo_url,cover_url,tags,delivery_fee,delivery_min_minutes,delivery_max_minutes,rating,review_count,is_open,closes_at,is_active,address_line,neighborhood,city,state,latitude,longitude,created_at,updated_at,minimum_order,pickup_enabled,delivery_enabled,approval_status,temporarily_closed,city_id";

export const fetchMerchantCategories = async () => {
  const { data, error } = await supabase
    .from("merchant_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
};

export const fetchMerchants = async (city?: string, state?: string) => {
  let query = supabase.from("merchants").select(PUBLIC_MERCHANT_COLUMNS).eq("is_active", true);

  if (city && state) {
    query = query.ilike("city", city).ilike("state", state);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
};

export const fetchMerchantById = async (id: string) => {
  const { data, error } = await supabase
    .from("merchants")
    .select(PUBLIC_MERCHANT_COLUMNS)
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error) throw error;
  return data;
};

export const fetchMenuCategoriesByMerchant = async (merchantId: string) => {
  const { data, error } = await supabase
    .from("menu_categories")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
};

export const fetchProductsByMerchant = async (merchantId: string) => {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("is_available", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
};

export const fetchMerchantCategoryById = async (id: string) => {
  const { data, error } = await supabase
    .from("merchant_categories")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
};

export const fetchProductOptionGroups = async (productId: string) => {
  const { data, error } = await supabase
    .from("product_option_groups")
    .select("*")
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data;
};

export const fetchProductOptionsByGroupIds = async (groupIds: string[]) => {
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
  const groupIds = groups.map((g) => g.id);
  const options = await fetchProductOptionsByGroupIds(groupIds);

  return {
    groups,
    options,
  };
};
