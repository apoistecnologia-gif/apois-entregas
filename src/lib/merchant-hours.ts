import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

export type MerchantHours = Database["public"]["Tables"]["merchant_hours"]["Row"];

export const fetchMerchantHours = async (merchantId: string) => {
  const { data, error } = await supabase
    .from("merchant_hours")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("weekday", { ascending: true });

  if (error) throw error;
  return data;
};

export const fetchMerchantsHoursBatch = async (merchantIds: string[]) => {
  if (merchantIds.length === 0) return [];
  
  const { data, error } = await supabase
    .from("merchant_hours")
    .select("*")
    .in("merchant_id", merchantIds)
    .order("weekday", { ascending: true });

  if (error) throw error;
  return data;
};

export type MerchantStatusType = "open" | "closed" | "unknown";

export interface MerchantStatus {
  status: MerchantStatusType;
  message: string;
  closesAt?: string;
  hoursToday?: MerchantHours;
}

/**
 * Lógica de status de funcionamento com suporte a horários que atravessam a meia-noite.
 */
export const calculateMerchantStatus = (hours: MerchantHours[], customNow?: Date): MerchantStatus => {
  if (!hours || hours.length === 0) {
    return { status: "unknown", message: "Horário não informado" };
  }

  const now = customNow || new Date();
  const currentWeekday = now.getDay(); // 0 (Dom) - 6 (Sab)
  const yesterdayWeekday = (currentWeekday + 6) % 7;
  
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Helper para converter "HH:mm:ss" ou "HH:mm" para minutos totais do dia
  const timeToMinutes = (timeStr: string | null) => {
    if (!timeStr) return null;
    const parts = timeStr.split(":");
    return parseInt(parts[0] || "0", 10) * 60 + parseInt(parts[1] || "0", 10);
  };

  // 1. Verificar expediente do DIA ANTERIOR (atravessa meia-noite)
  const yesterdayHours = hours.find(h => h.weekday === yesterdayWeekday);
  if (yesterdayHours && !yesterdayHours.is_closed && yesterdayHours.opens_at && yesterdayHours.closes_at) {
    const openMins = timeToMinutes(yesterdayHours.opens_at)!;
    const closeMins = timeToMinutes(yesterdayHours.closes_at)!;
    
    if (closeMins < openMins) {
      // Atravessa meia-noite. Ex: 20:00 - 02:00
      // Se agora é 01:00 (sábado), ainda está no expediente de ontem (sexta)
      if (nowMinutes < closeMins) {
        return {
          status: "open",
          message: `Aberto até ${yesterdayHours.closes_at.substring(0, 5)}`,
          closesAt: yesterdayHours.closes_at.substring(0, 5),
          hoursToday: yesterdayHours
        };
      }
    }
  }

  // 2. Verificar expediente do DIA ATUAL
  const todayHours = hours.find(h => h.weekday === currentWeekday);
  
  if (!todayHours) {
    return { status: "unknown", message: "Horário não informado" };
  }

  if (todayHours.is_closed) {
    return { status: "closed", message: "Fechado", hoursToday: todayHours };
  }

  const openMins = timeToMinutes(todayHours.opens_at);
  const closeMins = timeToMinutes(todayHours.closes_at);

  if (openMins === null || closeMins === null) {
    return { status: "unknown", message: "Horário não informado", hoursToday: todayHours };
  }

  const isOvernight = closeMins < openMins;
  
  // Se for overnight (ex: 20:00 - 02:00)
  // Aberto se agora >= 20:00 OU agora < 02:00
  // Mas a verificação de "agora < 02:00" já foi tratada no passo 1 (dia anterior)
  // Então aqui só validamos o início do expediente de hoje.
  const isOpen = isOvernight 
    ? (nowMinutes >= openMins) // Se agora >= 20:00 (o resto é tratado amanhã)
    : (nowMinutes >= openMins && nowMinutes < closeMins);

  if (!isOpen) {
    // Se o dia tem registro mas não bate o horário, está fechado
    return { status: "closed", message: "Fechado", hoursToday: todayHours };
  }

  return { 
    status: "open", 
    message: `Aberto até ${todayHours.closes_at.substring(0, 5)}`,
    closesAt: todayHours.closes_at.substring(0, 5),
    hoursToday: todayHours 
  };
};
