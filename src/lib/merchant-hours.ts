import { supabase } from "@/integrations/supabase/client";

export interface MerchantHours {
  id: string;
  merchant_id: string;
  weekday: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
}

export const fetchMerchantHours = async (merchantId: string) => {
  const { data, error } = await supabase
    .from("merchant_hours")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("weekday", { ascending: true });

  if (error) throw error;
  return data as MerchantHours[];
};

export const fetchMerchantsHoursBatch = async (merchantIds: string[]) => {
  const { data, error } = await supabase
    .from("merchant_hours")
    .select("*")
    .in("merchant_id", merchantIds)
    .order("weekday", { ascending: true });

  if (error) throw error;
  return data as MerchantHours[];
};

export interface MerchantStatus {
  isOpen: boolean;
  message: string;
  closesAt?: string;
  hoursToday?: MerchantHours;
}

export const calculateMerchantStatus = (hours: MerchantHours[]): MerchantStatus => {
  if (!hours || hours.length === 0) {
    return { isOpen: false, message: "Horário não informado" };
  }

  const now = new Date();
  const currentWeekday = now.getDay();
  const todayHours = hours.find((h) => h.weekday === currentWeekday);

  if (!todayHours) {
    return { isOpen: false, message: "Fechado" };
  }

  if (todayHours.is_closed) {
    return { isOpen: false, message: "Fechado", hoursToday: todayHours };
  }

  if (!todayHours.opens_at || !todayHours.closes_at) {
    return { isOpen: false, message: "Horário não informado", hoursToday: todayHours };
  }

  const nowTime = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = todayHours.opens_at.split(":").map(Number);
  const [closeH, closeM] = todayHours.closes_at.split(":").map(Number);
  
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  // Handle overnight logic (e.g., closes after midnight)
  const isOvernight = closeMinutes < openMinutes;
  
  const isOpen = isOvernight 
    ? nowTime >= openMinutes || nowTime < closeMinutes
    : nowTime >= openMinutes && nowTime < closeMinutes;

  if (!isOpen) {
    return { isOpen: false, message: "Fechado", hoursToday: todayHours };
  }

  return { 
    isOpen: true, 
    message: `Aberto até ${todayHours.closes_at.substring(0, 5)}`,
    closesAt: todayHours.closes_at.substring(0, 5),
    hoursToday: todayHours 
  };
};
