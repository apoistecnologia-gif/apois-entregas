 import { supabase } from "@/integrations/supabase/client";

export const fetchMerchantCategories = async () => {
  const { data, error } = await supabase
    .from("merchant_categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  
  if (error) throw error;
  return data;
};

export const fetchMerchants = async () => {
  const { data, error } = await supabase
    .from("merchants")
    .select("*")
    .eq("is_active", true);
  
  if (error) throw error;
  return data;
};

export const fetchMerchantById = async (id: string) => {
  const { data, error } = await supabase
    .from("merchants")
    .select("*")
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
