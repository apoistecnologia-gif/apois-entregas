import { supabase } from "@/integrations/supabase/client";

export const getOrderDetails = async (orderId: string) => {
  const { data, error } = await supabase
    .from("orders" as any)
    .select(
      `
      *,
      merchants (id,name,logo_url,cover_url,address_line,neighborhood,city,state,latitude,longitude,delivery_fee,delivery_min_minutes,delivery_max_minutes,pickup_enabled,delivery_enabled,temporarily_closed),
      order_items (*)
    `,
    )
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
