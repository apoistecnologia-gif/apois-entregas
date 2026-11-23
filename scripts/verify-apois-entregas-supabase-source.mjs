#!/usr/bin/env node
// Read-only regression guard for APOIS Entregas browser/mobile product bundles.
// This check does not contact or modify the production database.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = readFileSync(resolve(root, "src/integrations/supabase/config.ts"), "utf8");
const client = readFileSync(resolve(root, "src/integrations/supabase/client.ts"), "utf8");
const canonical = "ptgkwyyolrdgnqketkjj";
const retired = "sbvhdgyuuperszlsllji";
const checks = [
  [file.includes(canonical), "O projeto canônico de Entregas deve ser configurado"],
  [!file.includes(retired), "O host aposentado não pode permanecer como fallback"],
  [file.includes("hasExplicitPair"), "Overrides precisam fornecer URL e publishable key juntos"],
  [
    file.includes("hasExplicitPair ? optionalUrl! : canonicalUrl"),
    "Todas as interfaces usam par explicito de homologacao",
  ],
  [
    !file.includes("!backoffice && hasExplicitPair"),
    "Preview admin nao pode ignorar o par configurado",
  ],
  [
    file.includes("import.meta.env.DEV"),
    "Desenvolvimento local nao pode usar fallback de producao",
  ],
  [
    client.includes("SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY"),
    "O cliente precisa usar a configuração central",
  ],
  [
    client.includes('storageKey: "apois-merchant-auth-v2"'),
    "A sessão Merchant deve continuar isolada",
  ],
];
let failures = 0;
for (const [passed, description] of checks) {
  console.log(`[${passed ? "OK" : "FAIL"}] ${description}`);
  if (!passed) failures++;
}
if (failures) process.exit(1);
