import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  getApoisProductMode,
  getProductLandingRoute,
  isPathAllowedForProduct,
} from "./lib/product-routing";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

function merchantFreshLoginResponse(): Response {
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <title>APOIS Estabelecimento</title>
  <style>
    html,body{margin:0;background:#000;color:#fff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{min-height:100dvh;display:grid;place-items:center;padding:24px;text-align:center}
    strong{display:block;font-size:22px;letter-spacing:.04em}.gold{color:#ffd700;font-size:12px;font-weight:800;letter-spacing:.18em;margin-top:8px}
    p{color:#71717a;font-size:14px;margin-top:16px}
  </style>
</head>
<body>
  <main><div><strong>APOIS</strong><div class="gold">ESTABELECIMENTO</div><p>Abrindo área de acesso…</p></div></main>
  <script>
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    try {
      document.cookie.split(';').forEach(function(cookie) {
        const name = cookie.split('=')[0].trim();
        if (name) document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax';
      });
    } catch {}
    window.location.replace('/login?fresh=1&t=' + Date.now());
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "clear-site-data": '"cache", "cookies", "storage"',
      pragma: "no-cache",
      expires: "0",
    },
  });
}

function enforceProductRouteBoundary(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const url = new URL(request.url);
  const product = getApoisProductMode();
  const landingRoute = getProductLandingRoute(product);

  if (
    product === "merchant" &&
    (url.pathname === "/" ||
      url.pathname === "/merchant" ||
      url.pathname === "/configuracoes-estabelecimento")
  ) {
    if (request.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
          "clear-site-data": '"cache", "cookies", "storage"',
        },
      });
    }
    return merchantFreshLoginResponse();
  }

  if (isPathAllowedForProduct(url.pathname, product)) return null;

  url.pathname = landingRoute;
  url.search = "";
  url.hash = "";

  return Response.redirect(url, 307);
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const boundaryResponse = enforceProductRouteBoundary(request);
      if (boundaryResponse) return boundaryResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};