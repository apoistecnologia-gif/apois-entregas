// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isMobileBuild = process.env["APOIS_MOBILE_BUILD"] === "1";
const isVercelBuild = process.env["APOIS_VERCEL_BUILD"] === "1" || process.env["VERCEL"] === "1";

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
  },
});
