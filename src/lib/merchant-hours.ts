import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type BaseMerchantHours = Database["public"]["Tables"]["merchant_hours"]["Row"];

export type MerchantHours = BaseMerchantHours & {
  second_opens_at?: string | null;
  second_closes_at?: string | null;
};

export type MerchantSpecialHours = {
  id: string;
  merchant_id: string;
  service_date: string;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
  second_opens_at: string | null;
  second_closes_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type MerchantScheduleRow = {
  merchant_id: string;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
  second_opens_at?: string | null;
  second_closes_at?: string | null;
};

const from = (table: string) => (supabase.from as any)(table);

const localDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const fetchMerchantHours = async (merchantId: string) => {
  const { data, error } = await supabase
    .from("merchant_hours")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("weekday", { ascending: true });

  if (error) throw error;
  return (data ?? []) as MerchantHours[];
};

export const fetchMerchantsHoursBatch = async (merchantIds: string[]) => {
  if (merchantIds.length === 0) return [] as MerchantHours[];

  const { data, error } = await supabase
    .from("merchant_hours")
    .select("*")
    .in("merchant_id", merchantIds)
    .order("weekday", { ascending: true });

  if (error) throw error;
  return (data ?? []) as MerchantHours[];
};

export const fetchMerchantSpecialHours = async (merchantId: string, referenceDate = new Date()) => {
  const yesterday = new Date(referenceDate);
  yesterday.setDate(referenceDate.getDate() - 1);
  const { data, error } = await from("merchant_special_hours")
    .select("*")
    .eq("merchant_id", merchantId)
    .gte("service_date", localDateKey(yesterday))
    .lte("service_date", localDateKey(referenceDate))
    .order("service_date");

  if (error) throw error;
  return (data ?? []) as MerchantSpecialHours[];
};

export const fetchMerchantsSpecialHoursBatch = async (
  merchantIds: string[],
  referenceDate = new Date(),
) => {
  if (merchantIds.length === 0) return [] as MerchantSpecialHours[];
  const yesterday = new Date(referenceDate);
  yesterday.setDate(referenceDate.getDate() - 1);
  const { data, error } = await from("merchant_special_hours")
    .select("*")
    .in("merchant_id", merchantIds)
    .gte("service_date", localDateKey(yesterday))
    .lte("service_date", localDateKey(referenceDate))
    .order("service_date");

  if (error) throw error;
  return (data ?? []) as MerchantSpecialHours[];
};

export type MerchantStatusType = "open" | "closed" | "unknown";

export interface MerchantStatus {
  status: MerchantStatusType;
  message: string;
  closesAt?: string;
  hoursToday?: MerchantScheduleRow;
  specialDate?: string;
}

const timeToMinutes = (timeStr: string | null | undefined) => {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  return parseInt(parts[0] || "0", 10) * 60 + parseInt(parts[1] || "0", 10);
};

const getIntervals = (row: MerchantScheduleRow) => {
  const intervals: Array<{ opensAt: string; closesAt: string; open: number; close: number }> = [];
  const pairs = [
    [row.opens_at, row.closes_at],
    [row.second_opens_at, row.second_closes_at],
  ] as const;

  for (const [opensAt, closesAt] of pairs) {
    const open = timeToMinutes(opensAt);
    const close = timeToMinutes(closesAt);
    if (opensAt && closesAt && open !== null && close !== null) {
      intervals.push({ opensAt, closesAt, open, close });
    }
  }
  return intervals;
};

/**
 * Calcula o funcionamento usando horário semanal, segundo expediente opcional e exceções por data.
 * A exceção de data sempre prevalece sobre o horário semanal correspondente.
 */
export const calculateMerchantStatus = (
  hours: MerchantHours[],
  customNow?: Date,
  specialHours: MerchantSpecialHours[] = [],
): MerchantStatus => {
  if ((!hours || hours.length === 0) && specialHours.length === 0) {
    return { status: "unknown", message: "Horário não informado" };
  }

  const now = customNow || new Date();
  const currentWeekday = now.getDay();
  const yesterdayWeekday = (currentWeekday + 6) % 7;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayKey = localDateKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterdayKey = localDateKey(yesterdayDate);

  const todaySpecial = specialHours.find((row) => row.service_date === todayKey);
  const yesterdaySpecial = specialHours.find((row) => row.service_date === yesterdayKey);
  const todayWeekly = hours.find((row) => row.weekday === currentWeekday);
  const yesterdayWeekly = hours.find((row) => row.weekday === yesterdayWeekday);
  const todaySchedule = (todaySpecial ?? todayWeekly) as MerchantScheduleRow | undefined;
  const yesterdaySchedule = (yesterdaySpecial ?? yesterdayWeekly) as MerchantScheduleRow | undefined;

  if (yesterdaySchedule && !yesterdaySchedule.is_closed) {
    const overnight = getIntervals(yesterdaySchedule).find(
      (interval) => interval.close < interval.open && nowMinutes < interval.close,
    );
    if (overnight) {
      return {
        status: "open",
        message: `Aberto até ${overnight.closesAt.substring(0, 5)}`,
        closesAt: overnight.closesAt.substring(0, 5),
        hoursToday: yesterdaySchedule,
        specialDate: yesterdaySpecial?.service_date,
      };
    }
  }

  if (!todaySchedule) {
    return { status: "unknown", message: "Horário não informado" };
  }

  if (todaySchedule.is_closed) {
    return {
      status: "closed",
      message: todaySpecial?.note || "Fechado",
      hoursToday: todaySchedule,
      specialDate: todaySpecial?.service_date,
    };
  }

  const intervals = getIntervals(todaySchedule);
  if (intervals.length === 0) {
    return {
      status: "unknown",
      message: "Horário não informado",
      hoursToday: todaySchedule,
      specialDate: todaySpecial?.service_date,
    };
  }

  const activeInterval = intervals.find((interval) =>
    interval.close < interval.open
      ? nowMinutes >= interval.open
      : nowMinutes >= interval.open && nowMinutes < interval.close,
  );

  if (!activeInterval) {
    return {
      status: "closed",
      message: todaySpecial?.note || "Fechado",
      hoursToday: todaySchedule,
      specialDate: todaySpecial?.service_date,
    };
  }

  return {
    status: "open",
    message: `Aberto até ${activeInterval.closesAt.substring(0, 5)}`,
    closesAt: activeInterval.closesAt.substring(0, 5),
    hoursToday: todaySchedule,
    specialDate: todaySpecial?.service_date,
  };
};
