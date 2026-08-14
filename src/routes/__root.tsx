import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { ApoisLaunchSplash } from "../components/ApoisLaunchSplash";
import { AuthSessionIsolation } from "../components/AuthSessionIsolation";
import { CourierOfferOverlay } from "../components/CourierOfferOverlay";
import { MerchantOrderSoundWatcher } from "../components/MerchantOrderSoundWatcher";
import { CartProvider } from "../contexts/CartContext";
import { reportLovableError } from "../lib/lovable-error-reporting";
import {
  getApoisProductMode,
  getProductLabel,
  getProductLandingRoute,
  isPathAllowedForProduct,
} from "../lib/product-routing";

function getDocumentProductLabel() {
  const product = getApoisProductMode();
  return product === "customer" ? "APOIS Cliente" : getProductLabel(product);
}

function ProductRouteIsolation({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const product = getApoisProductMode();
  const blocked = !isPathAllowedForProduct(pathname, product);

  useEffect(() => {
    if (!blocked) return;
    void router.navigate({ to: getProductLandingRoute(product), replace: true });
  }, [blocked, product, router]);

  if (blocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-black px-6 text-center text-sm text-zinc-400">
        Redirecionando para o produto correto…
      </div>
    );
  }

  return children;
}

function NotFoundComponent() {
  const product = getApoisProductMode();
  const landingRoute = getProductLandingRoute(product);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página solicitada não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to={landingRoute}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const landingRoute = getProductLandingRoute();

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Ops! Algo deu errado
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Não foi possível carregar esta tela. Tente novamente.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              void router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <Link
            to={landingRoute}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => {
    const productLabel = getDocumentProductLabel();
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { title: productLabel },
        {
          name: "description",
          content: `${productLabel} — ecossistema operacional APOIS ENTREGAS.`,
        },
        { name: "author", content: "APOIS" },
        { property: "og:title", content: productLabel },
        { property: "og:description", content: `${productLabel} — APOIS ENTREGAS.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", href: "/favicon.png", type: "image/png" },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const product = getApoisProductMode();
  const isBackofficeProduct = product === "admin" || product === "merchant";

  return (
    <html lang="pt-BR" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-black antialiased">
        {isBackofficeProduct ? (
          <div className="min-h-dvh w-full bg-black">{children}</div>
        ) : (
          <div className="flex min-h-dvh w-full items-start justify-center overflow-x-hidden md:py-8 lg:py-12">
            <div className="relative flex min-h-dvh w-full flex-col bg-background md:min-h-[700px] md:max-w-[390px] md:overflow-hidden md:rounded-[3rem] md:shadow-2xl md:ring-8 md:ring-zinc-900">
              {children}
            </div>
          </div>
        )}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ApoisLaunchSplash />
      <MerchantOrderSoundWatcher />
      <CourierOfferOverlay />
      <ProductRouteIsolation>
        <AuthSessionIsolation>
          <CartProvider>
            <Outlet />
          </CartProvider>
        </AuthSessionIsolation>
      </ProductRouteIsolation>
    </QueryClientProvider>
  );
}
