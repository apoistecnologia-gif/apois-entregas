import { expect, test } from "bun:test";
import { citiesWithoutCourierDispatch, isCourierDispatchRadiusConfigured } from "./courier-dispatch-readiness";

test("no implicit radius is inferred from client delivery coverage", () => {
  expect(isCourierDispatchRadiusConfigured(null)).toBe(false);
  expect(isCourierDispatchRadiusConfigured("")).toBe(false);
  expect(isCourierDispatchRadiusConfigured("0")).toBe(false);
  expect(isCourierDispatchRadiusConfigured(-1)).toBe(false);
  expect(isCourierDispatchRadiusConfigured(101)).toBe(false);
  expect(isCourierDispatchRadiusConfigured("NaN")).toBe(false);
  expect(isCourierDispatchRadiusConfigured("8")).toBe(true);
  expect(isCourierDispatchRadiusConfigured(20)).toBe(true);
});

test("administration highlights active cities without dispatch coverage, not inactive cities", () => {
  const cities = [
    { id: "a", name: "Cidade A", state: "PE", is_active: true, courier_dispatch_radius_km: null, default_delivery_radius_km: 10 },
    { id: "b", name: "Cidade B", state: "PI", is_active: true, courier_dispatch_radius_km: 20, default_delivery_radius_km: 10 },
    { id: "c", name: "Cidade C", state: "PE", is_active: false, courier_dispatch_radius_km: null, default_delivery_radius_km: 10 },
  ];
  expect(citiesWithoutCourierDispatch(cities).map((city) => city.id)).toEqual(["a"]);
});
