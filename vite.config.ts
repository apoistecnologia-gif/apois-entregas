// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isMobileBuild = process.env["APOIS_MOBILE_BUILD"] === "1";
const isVercelBuild = process.env["APOIS_VERCEL_BUILD"] === "1" || process.env["VERCEL"] === "1";
const productMode = String(process.env["VITE_APOIS_PRODUCT_MODE"] ?? "customer")
  .trim()
  .toLowerCase();

const customerOnlyRouteRoots = [
  "apois-plus",
  "buscar",
  "chamado-suporte",
  "checkout",
  "enderecos",
  "estabelecimento",
  "favoritos",
  "inicio",
  "notificacoes",
  "pedido",
  "pedidos",
  "perfil",
  "sacola",
];

const productOnlyRouteRoots: Record<string, string[]> = {
  customer: ["admin", "courier", "merchant", "configuracoes-estabelecimento"],
  courier: ["admin", "merchant", "configuracoes-estabelecimento", ...customerOnlyRouteRoots],
  merchant: ["admin", "courier", ...customerOnlyRouteRoots],
  admin: ["courier", "merchant", "configuracoes-estabelecimento", ...customerOnlyRouteRoots],
};

const ignoredRouteRoots = productOnlyRouteRoots[productMode] ?? productOnlyRouteRoots.customer;
const routeFileIgnorePattern = `(^|/)(${ignoredRouteRoots.join("|")})(?:[./]|$)`;

export default defineConfig({
  // Mobile packaging renders the built app once in CI to produce Capacitor's index.html.
  // Use a Node-compatible Nitro server for that build-only render.
  ...(isMobileBuild
    ? { nitro: { preset: "node" } }
    : isVercelBuild
      ? { nitro: { preset: "vercel" } }
      : {}),
  tanstackStart: {
    server: { entry: "server" },
    router: {
      // Each deployed product gets a route tree that contains only its own operational
      // routes plus the small shared auth/legal surface. This is build-time isolation,
      // not merely a runtime redirect, so mobile artifacts cannot contain admin/merchant
      // route modules and backoffice builds cannot expose another product's route tree.
      routeFileIgnorePattern,
    },
  },
});
