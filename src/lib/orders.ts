import { supabase } from "@/integrations/supabase/client";

export const getOrderDetails = async (orderId: string) => {
  const { data, error } = await supabase
    .from("orders" as any)
    .select(`
      *,
      merchants (*),
      order_items (*)
    `)
    .eq("id", orderId)
    .single();

  if (error) throw error;
  return data;
};

export const getCustomerOrders = async () => {
  const { data, error } = await supabase
    .from("orders" as any)
    .select("*, merchants(name, logo_url)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
};
