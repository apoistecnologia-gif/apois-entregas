import { describe, it, expect } from "vitest";
import { calculateMerchantStatus, MerchantHours } from "./merchant-hours";

const createHours = (weekday: number, opens: string | null, closes: string | null, isClosed = false): MerchantHours => ({
  id: "1",
  merchant_id: "m1",
  weekday,
  opens_at: opens,
  closes_at: closes,
  is_closed: isClosed,
  created_at: "",
  updated_at: ""
});

describe("calculateMerchantStatus", () => {
  it("Cenário A: sexta 13:00–23:00, sexta 18:47 -> aberto até 23:00", () => {
    const hours = [createHours(5, "13:00:00", "23:00:00")];
    const now = new Date("2026-08-07T18:47:00"); // Sexta-feira
    const status = calculateMerchantStatus(hours, now);
    expect(status.status).toBe("open");
    expect(status.message).toBe("Aberto até 23:00");
  });

  it("Cenário B: nenhum horário -> horário não informado", () => {
    const status = calculateMerchantStatus([], new Date());
    expect(status.status).toBe("unknown");
    expect(status.message).toBe("Horário não informado");
  });

  it("Cenário C: há horários na semana, mas não existe registro de hoje -> horário não informado", () => {
    const hours = [createHours(1, "08:00:00", "18:00:00")]; // Segunda
    const now = new Date("2026-08-07T10:00:00"); // Sexta
    const status = calculateMerchantStatus(hours, now);
    expect(status.status).toBe("unknown");
    expect(status.message).toBe("Horário não informado");
  });

  it("Cenário D: sexta 20:00–02:00, sábado 01:00 -> aberto até 02:00 usando o registro de sexta", () => {
    const hours = [
      createHours(5, "20:00:00", "02:00:00"),
      createHours(6, "12:00:00", "22:00:00")
    ];
    const now = new Date("2026-08-08T01:00:00"); // Sábado
    const status = calculateMerchantStatus(hours, now);
    expect(status.status).toBe("open");
    expect(status.message).toBe("Aberto até 02:00");
  });

  it("Cenário E: sexta 20:00–02:00, sábado 03:00 -> expediente de sexta já encerrado", () => {
    const hours = [
      createHours(5, "20:00:00", "02:00:00"),
      createHours(6, "12:00:00", "22:00:00")
    ];
    const now = new Date("2026-08-08T03:00:00"); // Sábado
    const status = calculateMerchantStatus(hours, now);
    expect(status.status).toBe("closed");
  });

  it("Cenário F: sábado 20:00–02:00, sábado 01:00 -> NÃO considerar o expediente de sábado como aberto antes das 20:00", () => {
    const hours = [
      createHours(6, "20:00:00", "02:00:00")
    ];
    const now = new Date("2026-08-08T01:00:00"); // Sábado
    const status = calculateMerchantStatus(hours, now);
    expect(status.status).toBe("closed");
  });
});
