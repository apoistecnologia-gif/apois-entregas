#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const allowedProducts = new Set(["customer", "merchant", "courier", "admin"]);
const product = String(process.argv[2] ?? "").trim().toLowerCase();

if (!allowedProducts.has(product)) {
  console.error(
    "Usage: node scripts/build-product.mjs <customer|merchant|courier|admin>",
  );
  process.exit(1);
}

const command = process.platform === "win32" ? "bun.cmd" : "bun";
const result = spawnSync(command, ["run", "build"], {
  env: {
    ...process.env,
    VITE_APOIS_PRODUCT_MODE: product,
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
