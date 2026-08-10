export type ApoisProductMode = "customer" | "merchant" | "courier" | "admin";
export type ApoisProductHomeRoute = "/inicio" | "/merchant" | "/courier" | "/admin";
export type ApoisProductLandingRoute = "/" | "/merchant" | "/courier" | "/admin";

const PRODUCT_HOME_ROUTES: Record<ApoisProductMode, ApoisProductHomeRoute> = {
  customer: "/inicio",
  merchant: "/merchant",
  courier: "/courier",
  admin: "/admin",
};

const PRODUCT_LANDING_ROUTES: Record<ApoisProductMode, ApoisProductLandingRoute> = {
  customer: "/",
  merchant: "/merchant",
  courier: "/courier",
  admin: "/admin",
};

const PRODUCT_LABELS: Record<ApoisProductMode, string> = {
  customer: "APOIS ENTREGA",
  merchant: "APOIS Estabelecimento",
  courier: "APOIS Entregador",
  admin: "APOIS Administração",
};

export function getApoisProductMode(): ApoisProductMode {
  const raw = String(
    import.meta.env.VITE_APOIS_PRODUCT_MODE ?? import.meta.env.VITE_APOIS_APP_MODE ?? "customer",
  )
    .trim()
    .toLowerCase();

  return Object.prototype.hasOwnProperty.call(PRODUCT_HOME_ROUTES, raw)
    ? (raw as ApoisProductMode)
    : "customer";
}

export function getProductHomeRoute(product = getApoisProductMode()): ApoisProductHomeRoute {
  return PRODUCT_HOME_ROUTES[product];
}

export function getProductLandingRoute(product = getApoisProductMode()): ApoisProductLandingRoute {
  return PRODUCT_LANDING_ROUTES[product];
}

export function getProductLabel(product = getApoisProductMode()) {
  return PRODUCT_LABELS[product];
}

export function productAllowsPublicSignup(product = getApoisProductMode()) {
  return product !== "admin";
}
