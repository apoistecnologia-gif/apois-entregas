import { describe, expect, test } from "bun:test";

import { calculateMerchantStatus, type MerchantHours, type MerchantSpecialHours } from "./merchant-hours";

const weekly = (
  weekday: number,
  overrides: Partial<MerchantHours> = {},
): MerchantHours =>
  ({
    id: `hours-${weekday}`,
    merchant_id: "merchant-1",
    weekday,
    is_closed: false,
    opens_at: "09:00:00",
    closes_at: "18:00:00",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    second_opens_at: null,
    second_closes_at: null,
    ...overrides,
  }) as MerchantHours;

const special = (
  serviceDate: string,
  overrides: Partial<MerchantSpecialHours> = {},
): MerchantSpecialHours => ({
  id: `special-${serviceDate}`,
  merchant_id: "merchant-1",
  service_date: serviceDate,
  is_closed: false,
  opens_at: "10:00:00",
  closes_at: "16:00:00",
  second_opens_at: null,
  second_closes_at: null,
  note: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

describe("calculateMerchantStatus", () => {
  test("returns unknown when no schedule exists", () => {
    expect(calculateMerchantStatus([], new Date(2026, 7, 10, 12, 0))).toEqual({
      status: "unknown",
      message: "Horário não informado",
    });
  });

  test("opens and closes within a regular weekly interval", () => {
    const sunday = weekly(0);

    expect(calculateMerchantStatus([sunday], new Date(2026, 7, 9, 12, 0)).status).toBe("open");
    expect(calculateMerchantStatus([sunday], new Date(2026, 7, 9, 18, 0)).status).toBe("closed");
  });

  test("supports a second service interval", () => {
    const sunday = weekly(0, {
      opens_at: "08:00:00",
      closes_at: "12:00:00",
      second_opens_at: "17:00:00",
      second_closes_at: "23:00:00",
    });

    expect(calculateMerchantStatus([sunday], new Date(2026, 7, 9, 14, 0)).status).toBe("closed");
    expect(calculateMerchantStatus([sunday], new Date(2026, 7, 9, 20, 0)).status).toBe("open");
  });

  test("keeps an overnight interval open after midnight", () => {
    const saturday = weekly(6, { opens_at: "18:00:00", closes_at: "02:00:00" });

    const result = calculateMerchantStatus([saturday], new Date(2026, 7, 9, 1, 30));
    expect(result.status).toBe("open");
    expect(result.closesAt).toBe("02:00");
  });

  test("special closure overrides the weekly schedule", () => {
    const sunday = weekly(0);
    const closure = special("2026-08-09", {
      is_closed: true,
      opens_at: null,
      closes_at: null,
      note: "Feriado local",
    });

    const result = calculateMerchantStatus([sunday], new Date(2026, 7, 9, 12, 0), [closure]);
    expect(result.status).toBe("closed");
    expect(result.message).toBe("Feriado local");
    expect(result.specialDate).toBe("2026-08-09");
  });
});
