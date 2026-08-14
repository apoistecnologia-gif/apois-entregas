import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["src", "supabase/functions", ".github/workflows"];
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
]);
const PUBLIC_WEBHOOK_FUNCTIONS = new Set([
  "mercadopago-webhook",
  "openpix-webhook",
  "asaas-webhook",
]);

const findings = [];

async function collectFiles(relativeDir) {
  const absoluteDir = path.join(ROOT, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(relativePath)));
      continue;
    }

    if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(relativePath);
    }
  }

  return files;
}

function report(file, rule, detail) {
  findings.push({ file: file.replaceAll("\\", "/"), rule, detail });
}

function scanSource(file, content) {
  const checks = [
    {
      rule: "legacy-supabase-project",
      regex: /hampouulutorqkgpnhzc/g,
      detail: "legacy Lovable Supabase project reference",
    },
    {
      rule: "vite-service-role",
      regex: /VITE_[A-Z0-9_]*SERVICE_ROLE[A-Z0-9_]*/g,
      detail: "service-role credential referenced through a VITE_* variable",
    },
    {
      rule: "mercado-pago-token",
      regex: /\b(?:APP_USR|TEST)-[A-Za-z0-9_-]{20,}\b/g,
      detail: "literal Mercado Pago access token-like value",
    },
    {
      rule: "not-implemented",
      regex: /throw\s+new\s+Error\(\s*["'`]Not implemented/gi,
      detail: "explicit not-implemented runtime stub",
    },
    {
      rule: "empty-click-handler",
      regex: /onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/g,
      detail: "empty onClick handler",
    },
    {
      rule: "dead-hash-link",
      regex: /href\s*=\s*["']#["']/g,
      detail: "dead href=# navigation target",
    },
    {
      rule: "incomplete-marker",
      regex: /\b(?:TODO|FIXME|NOT_IMPLEMENTED)\b/g,
      detail: "unfinished implementation marker",
    },
  ];

  if (file.startsWith("src/") || file.startsWith("supabase/functions/")) {
    checks.push({
      rule: "console-log",
      regex: /\bconsole\.log\s*\(/g,
      detail: "console.log left in application/function source",
    });
  }

  const serverOnlySource =
    file === "src/server.ts" ||
    file.startsWith("src/server/") ||
    file.endsWith(".server.ts") ||
    file.endsWith(".server.tsx");
  if (
    file.startsWith("src/") &&
    !serverOnlySource &&
    /\b(?:APOIS_SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY)\b/.test(content)
  ) {
    report(
      file,
      "client-service-role-reference",
      "service-role key referenced outside server-only source",
    );
  }

  for (const check of checks) {
    if (check.regex.test(content)) {
      report(file, check.rule, check.detail);
    }
  }
}

async function verifySupabaseConfig() {
  const file = "supabase/config.toml";
  const content = await readFile(path.join(ROOT, file), "utf8");

  if (!/^project_id\s*=\s*["']sbvhdgyuuperszlsllji["']/m.test(content)) {
    report(file, "wrong-project", "project_id must point to APOIS ENTREGA - PRODUÇÃO");
  }

  const publicFunctions = new Set();
  const sectionHeader = /^\[functions\.([^\]]+)\]\s*$/gm;
  const matches = [...content.matchAll(sectionHeader)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const slug = match[1];
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? content.length;
    const body = content.slice(bodyStart, bodyEnd);
    if (!/^verify_jwt\s*=\s*false\s*$/m.test(body)) continue;
    publicFunctions.add(slug);
    if (!PUBLIC_WEBHOOK_FUNCTIONS.has(slug)) {
      report(
        file,
        "unexpected-public-edge-function",
        `${slug} disables Supabase JWT verification but is not an approved provider webhook`,
      );
    }
  }

  for (const slug of PUBLIC_WEBHOOK_FUNCTIONS) {
    if (!publicFunctions.has(slug)) {
      report(
        file,
        "webhook-jwt-config-drift",
        `${slug} must disable Supabase JWT verification because the provider authenticates the webhook directly`,
      );
    }
  }
}

async function verifyMigrationDirectory() {
  const relativeDir = "supabase/migrations";
  const entries = await readdir(path.join(ROOT, relativeDir), { withFileTypes: true });
  const seenVersions = new Map();
  const seenNames = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".sql")) continue;

    const match = entry.name.match(/^(\d{14})_(.+)\.sql$/);
    if (!match) {
      report(
        `${relativeDir}/${entry.name}`,
        "invalid-migration-name",
        "expected YYYYMMDDHHMMSS_name.sql",
      );
      continue;
    }

    const [, version, name] = match;
    const previousVersion = seenVersions.get(version);
    if (previousVersion) {
      report(
        `${relativeDir}/${entry.name}`,
        "duplicate-migration-version",
        `version ${version} is also used by ${previousVersion}`,
      );
    } else {
      seenVersions.set(version, entry.name);
    }

    const previousName = seenNames.get(name);
    if (previousName) {
      report(
        `${relativeDir}/${entry.name}`,
        "duplicate-migration-name",
        `migration name ${name} is also used by ${previousName}`,
      );
    } else {
      seenNames.set(name, entry.name);
    }
  }
}

for (const sourceRoot of SOURCE_ROOTS) {
  for (const file of await collectFiles(sourceRoot)) {
    const content = await readFile(path.join(ROOT, file), "utf8");
    scanSource(file.replaceAll("\\", "/"), content);
  }
}

await verifySupabaseConfig();
await verifyMigrationDirectory();

if (findings.length > 0) {
  console.error("Repository safety audit failed:\n");
  for (const finding of findings) {
    console.error(`- ${finding.file}: [${finding.rule}] ${finding.detail}`);
  }
  process.exit(1);
}

console.info("Repository safety audit passed.");
