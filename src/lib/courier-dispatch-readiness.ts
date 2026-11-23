/** Admin-only readiness helper. Courier dispatch radius is deliberately
 * independent from the customer's delivery radius (2026-08-15 migration).
 * Never replace an unset courier radius with a guessed default. */
export function isCourierDispatchRadiusConfigured(
  value: number | string | null | undefined,
): boolean {
  if (value === null || value === undefined || String(value).trim() === "") return false;
  const radius = Number(value);
  return Number.isFinite(radius) && radius > 0 && radius <= 100;
}

export type CourierDispatchCity = {
  id: string;
  name: string;
  state: string;
  is_active: boolean;
  courier_dispatch_radius_km: number | string | null;
};

export function citiesWithoutCourierDispatch<T extends CourierDispatchCity>(cities: T[]): T[] {
  return cities.filter(
    (city) => city.is_active && !isCourierDispatchRadiusConfigured(city.courier_dispatch_radius_km),
  );
}
