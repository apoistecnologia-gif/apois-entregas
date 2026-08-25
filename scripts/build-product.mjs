#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const allowedProducts = new Set(["customer", "merchant", "courier", "admin"]);
const product = String(process.argv[2] ?? "")
  .trim()
  .toLowerCase();

if (!allowedProducts.has(product)) {
  console.error("Usage: node scripts/build-product.mjs <customer|merchant|courier|admin>");
  process.exit(1);
}

// Node's child_process hardening (since Node 18.19/20.11/21.6, see
// nodejs/node#52554) rejects spawning a .cmd/.bat target directly with
// EINVAL unless shell:true is set, because argument escaping for cmd.exe
// batch files differs from normal executables. shell:true routes this
// through cmd.exe correctly on Windows without changing behavior elsewhere.
const command = process.platform === "win32" ? "bun.cmd" : "bun";
const result = spawnSync(command, ["run", "build"], {
  env: {
    ...process.env,
    VITE_APOIS_PRODUCT_MODE: product,
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
