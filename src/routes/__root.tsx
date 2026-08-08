import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Heart, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { CartProvider } from "../contexts/CartContext";
import {
  isMerchantFavorite,
  toggleMerchantFavorite,
} from "../lib/favorites";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço acessado não existe ou foi movido.
        </p>
        <div className="mt-6">
          <Link
            to="/"
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
  console.error(error);
  const router = useRouter();
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
          Não foi possível concluir esta tela agora. Tente novamente ou volte ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "APOIS Entregas" },
      {
        name: "description",
        content: "APOIS Entregas — peça em estabelecimentos da sua região e acompanhe sua entrega.",
      },
      { name: "author", content: "APOIS Tecnologia" },
      { property: "og:title", content: "APOIS Entregas" },
      {
        property: "og:description",
        content: "Delivery regional com pedidos e acompanhamento em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "theme-color", content: "#000000" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-black antialiased">
        <div className="flex min-h-dvh w-full items-start justify-center overflow-x-hidden md:py-8 lg:py-12">
          <div className="relative flex min-h-dvh w-full flex-col bg-background md:min-h-[700px] md:max-w-[390px] md:overflow-hidden md:rounded-[3rem] md:shadow-2xl md:ring-8 md:ring-zinc-900">
            {children}
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}

function MerchantFavoriteOverlay() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const match = pathname.match(/^\/estabelecimento\/([0-9a-f-]{36})\/?$/i);
  const merchantId = match?.[1] ?? null;
  const [favorite, setFavorite] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setFavorite(false);
    if (!merchantId) return () => undefined;

    setLoading(true);
    void isMerchantFavorite(merchantId)
      .then((value) => {
        if (active) setFavorite(value);
      })
      .catch(() => {
        if (active) setFavorite(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [merchantId]);

  if (!merchantId) return null;

  const toggle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      setFavorite(await toggleMerchantFavorite(merchantId));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={loading}
      aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      className={`absolute right-4 top-6 z-[250] grid h-10 w-10 place-items-center rounded-full bg-black/70 backdrop-blur-md ring-1 ring-white/10 transition-colors ${
        favorite ? "text-primary" : "text-white"
      }`}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Heart className={`h-5 w-5 ${favorite ? "fill-primary" : ""}`} />
      )}
    </button>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <MerchantFavoriteOverlay />
        <Outlet />
      </CartProvider>
    </QueryClientProvider>
  );
}
