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

  const sections = [...content.matchAll(/^\[functions\.([^\]]+)\]([\s\S]*?)(?=^\[|\s*$)/gm)];
  for (const [, slug, body] of sections) {
    if (/^verify_jwt\s*=\s*false\s*$/m.test(body) && slug !== "mercadopago-webhook") {
      report(
        file,
        "unexpected-public-edge-function",
        `${slug} disables Supabase JWT verification; only mercadopago-webhook is allowed`,
      );
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

if (findings.length > 0) {
  console.error("Repository safety audit failed:\n");
  for (const finding of findings) {
    console.error(`- ${finding.file}: [${finding.rule}] ${finding.detail}`);
  }
  process.exit(1);
}

console.info("Repository safety audit passed.");
