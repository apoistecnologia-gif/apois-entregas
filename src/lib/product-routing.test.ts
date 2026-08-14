import { describe, expect, test } from "bun:test";
import { getSafeProductRoute, isPathAllowedForProduct } from "./product-routing";

describe("product route isolation", () => {
  test("courier never accepts customer or backoffice routes", () => {
    expect(isPathAllowedForProduct("/courier", "courier")).toBe(true);
    expect(isPathAllowedForProduct("/courier/history", "courier")).toBe(true);
    expect(isPathAllowedForProduct("/login", "courier")).toBe(true);
    expect(isPathAllowedForProduct("/register", "courier")).toBe(true);
    expect(isPathAllowedForProduct("/inicio", "courier")).toBe(false);
    expect(isPathAllowedForProduct("/favoritos", "courier")).toBe(false);
    expect(isPathAllowedForProduct("/checkout", "courier")).toBe(false);
    expect(isPathAllowedForProduct("/merchant", "courier")).toBe(false);
    expect(isPathAllowedForProduct("/admin", "courier")).toBe(false);
  });

  test("customer never accepts partner or admin workspaces", () => {
    expect(isPathAllowedForProduct("/inicio", "customer")).toBe(true);
    expect(isPathAllowedForProduct("/checkout", "customer")).toBe(true);
    expect(isPathAllowedForProduct("/register", "customer")).toBe(true);
    expect(isPathAllowedForProduct("/courier", "customer")).toBe(false);
    expect(isPathAllowedForProduct("/merchant", "customer")).toBe(false);
    expect(isPathAllowedForProduct("/configuracoes-estabelecimento", "customer")).toBe(false);
    expect(isPathAllowedForProduct("/admin", "customer")).toBe(false);
  });

  test("merchant and admin are restricted to their own workspaces", () => {
    expect(isPathAllowedForProduct("/merchant", "merchant")).toBe(true);
    expect(isPathAllowedForProduct("/configuracoes-estabelecimento", "merchant")).toBe(true);
    expect(isPathAllowedForProduct("/register", "merchant")).toBe(true);
    expect(isPathAllowedForProduct("/inicio", "merchant")).toBe(false);
    expect(isPathAllowedForProduct("/admin", "merchant")).toBe(false);

    expect(isPathAllowedForProduct("/admin", "admin")).toBe(true);
    expect(isPathAllowedForProduct("/admin/orders", "admin")).toBe(true);
    expect(isPathAllowedForProduct("/login", "admin")).toBe(true);
    expect(isPathAllowedForProduct("/register", "admin")).toBe(false);
    expect(isPathAllowedForProduct("/inicio", "admin")).toBe(false);
    expect(isPathAllowedForProduct("/courier", "admin")).toBe(false);
  });

  test("auth callback next path falls back to current product home", () => {
    expect(getSafeProductRoute("/inicio", "courier")).toBe("/courier");
    expect(getSafeProductRoute("/courier", "courier")).toBe("/courier");
    expect(getSafeProductRoute("//invalid.example", "courier")).toBe("/courier");
    expect(getSafeProductRoute("/admin", "customer")).toBe("/inicio");
    expect(getSafeProductRoute("/register", "admin")).toBe("/admin");
  });
});
