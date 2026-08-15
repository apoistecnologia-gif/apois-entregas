// Security/UX boundary shared by the four independently shipped APOIS products.
// Keep courier mobile builds isolated even when a stale deep link targets another product.
export type ApoisProductMode = "customer" | "merchant" | "courier" | "admin";
export type ApoisProductHomeRoute = "/inicio" | "/merchant" | "/courier" | "/admin";
export type ApoisProductLandingRoute =
  | "/"
  | "/login"
  | "/login-estabelecimento"
  | "/courier";

const PRODUCT_HOME_ROUTES: Record<ApoisProductMode, ApoisProductHomeRoute> = {
  customer: "/inicio",
  merchant: "/merchant",
  courier: "/courier",
  admin: "/admin",
};

const PRODUCT_LANDING_ROUTES: Record<ApoisProductMode, ApoisProductLandingRoute> = {
  customer: "/",
  merchant: "/login-estabelecimento",
  courier: "/courier",
  admin: "/login",
};

const PRODUCT_LABELS: Record<ApoisProductMode, string> = {
  customer: "APOIS ENTREGA",
  merchant: "APOIS Estabelecimento",
  courier: "APOIS Entregador",
  admin: "APOIS Administração",
};

const SHARED_PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/redefinir-senha",
  "/auth/callback",
  "/termos",
  "/privacidade",
]);

function isWithin(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function getApoisProductMode(): ApoisProductMode {
  const { VITE_APOIS_PRODUCT_MODE, VITE_APOIS_APP_MODE } = import.meta.env;
  const raw = String(VITE_APOIS_PRODUCT_MODE ?? VITE_APOIS_APP_MODE ?? "customer")
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

/**
 * Runtime route boundary for the four independently shipped APOIS products.
 *
 * The generated TanStack route tree still knows about every route in the monorepo,
 * so a product build must reject routes that belong to another product even when a
 * stale WebView URL, deep link, auth callback or persisted browser history points to it.
 */
export function isPathAllowedForProduct(pathname: string, product = getApoisProductMode()) {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return false;
  if (pathname === "/register") return product !== "admin";
  if (SHARED_PUBLIC_PATHS.has(pathname)) return true;

  if (product === "courier") return isWithin(pathname, "/courier");
  if (product === "merchant") {
    return (
      isWithin(pathname, "/merchant") ||
      isWithin(pathname, "/configuracoes-estabelecimento") ||
      isWithin(pathname, "/login-estabelecimento")
    );
  }
  if (product === "admin") return isWithin(pathname, "/admin");

  return !(
    isWithin(pathname, "/courier") ||
    isWithin(pathname, "/merchant") ||
    isWithin(pathname, "/configuracoes-estabelecimento") ||
    isWithin(pathname, "/login-estabelecimento") ||
    isWithin(pathname, "/admin")
  );
}

export function getSafeProductRoute(
  candidate: string | null | undefined,
  product = getApoisProductMode(),
  fallback: ApoisProductHomeRoute | ApoisProductLandingRoute = getProductHomeRoute(product),
) {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  const pathname = candidate.split(/[?#]/, 1)[0] || "/";
  return isPathAllowedForProduct(pathname, product) ? candidate : fallback;
}
