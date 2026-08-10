// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isMobileBuild = process.env["APOIS_MOBILE_BUILD"] === "1";

export default defineConfig({
  // The package defaults production builds to Cloudflare. TanStack Start's SPA
  // prerenderer boots the built server locally in Node, so mobile packaging needs a
  // Node-compatible Nitro target while the normal web build keeps its default target.
  ...(isMobileBuild ? { nitro: { preset: "node" } } : {}),
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    ...(isMobileBuild
      ? {
          spa: {
            enabled: true,
            maskPath: "/__apois_mobile_shell__",
            prerender: {
              outputPath: "/index.html",
              crawlLinks: false,
              retryCount: 0,
            },
          },
        }
      : {}),
  },
});
