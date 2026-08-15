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

function rewriteProductRootRequest(request: Request): Request {
  if (request.method !== "GET" && request.method !== "HEAD") return request;

  const url = new URL(request.url);
  const product = getApoisProductMode();
  const landingRoute = getProductLandingRoute(product);

  if (url.pathname !== "/" || landingRoute === "/") return request;

  // On Vercel/Nitro an HTTP redirect emitted from the custom server entry can be
  // resolved against the generated function route prefix (for Admin that became
  // /admin/login). Render the product landing route internally instead. This keeps
  // the public root HTTP-safe (200), never renders the customer app, and lets the
  // normal client router take over from the product-specific authentication screen.
  url.pathname = landingRoute;
  url.search = "";
  url.hash = "";

  return new Request(url, request);
}

function enforceProductRouteBoundary(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const url = new URL(request.url);
  const product = getApoisProductMode();
  const landingRoute = getProductLandingRoute(product);

  if (isPathAllowedForProduct(url.pathname, product)) return null;

  url.pathname = landingRoute;
  url.search = "";
  url.hash = "";

  return Response.redirect(url, 307);
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
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
      const routedRequest = rewriteProductRootRequest(request);
      const boundaryResponse = enforceProductRouteBoundary(routedRequest);
      if (boundaryResponse) return boundaryResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(routedRequest, env, ctx);
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
