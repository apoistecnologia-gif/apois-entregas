#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const product = String(process.argv[2] ?? "")
  .trim()
  .toLowerCase();
const allowedProducts = new Set(["customer", "merchant", "courier", "admin"]);
if (!allowedProducts.has(product)) {
  console.error("Usage: node scripts/verify-product-isolation.mjs <customer|merchant|courier|admin>");
  process.exit(1);
}

const sharedRoutes = new Set([
  "__root",
  "index",
  "login",
  "register",
  "redefinir-senha",
  "auth.callback",
  "termos",
  "privacidade",
]);
const customerRoots = new Set([
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
]);

function routeRoot(routePath) {
  return routePath.split(/[/.]/, 1)[0] ?? routePath;
}

function isAllowed(routePath) {
  if (sharedRoutes.has(routePath)) return true;
  const root = routeRoot(routePath);
  if (product === "customer") return customerRoots.has(root);
  if (product === "courier") return root === "courier";
  if (product === "merchant") return root === "merchant" || root === "configuracoes-estabelecimento";
  return root === "admin";
}

const routeTree = await readFile(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8");
const imports = Array.from(routeTree.matchAll(/from ['"]\.\/routes\/([^'"]+)['"]/g), (match) =>
  match[1].replace(/\.tsx?$/, ""),
);

if (imports.length === 0) {
  console.error("Generated route tree has no route imports; isolation cannot be verified.");
  process.exit(1);
}

const forbidden = imports.filter((routePath) => !isAllowed(routePath));
if (forbidden.length > 0) {
  console.error(`Forbidden ${product} route imports found: ${forbidden.join(", ")}`);
  process.exit(1);
}

const requiredRoot = product === "customer" ? "index" : product;
if (!imports.some((routePath) => routeRoot(routePath) === requiredRoot)) {
  console.error(`Required ${product} route is missing from the generated route tree.`);
  process.exit(1);
}

console.log(`Verified ${product} route isolation (${imports.length} generated route imports).`);
