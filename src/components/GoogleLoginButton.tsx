import { useEffect, useRef, useState } from "react";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { verifyAccountAccessOrSignOut } from "@/lib/account-access";
import { getApoisProductMode, getProductHomeRoute } from "@/lib/product-routing";
import { toast } from "sonner";

const DEFAULT_NATIVE_SCHEMES = {
  customer: "br.com.apois.cliente",
  merchant: "br.com.apois.estabelecimento",
  courier: "br.com.apois.entregador",
  admin: "br.com.apois.admin",
} as const;

function getNativeAuthCallback() {
  const product = getApoisProductMode();
  const configured = String(import.meta.env["VITE_APOIS_NATIVE_SCHEME"] ?? "").trim();
  const scheme = configured || DEFAULT_NATIVE_SCHEMES[product];
  return `${scheme}://auth/callback`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Erro desconhecido";
}

async function completeNativeGoogleLogin(callbackUrl: string) {
  const url = new URL(callbackUrl);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const providerError =
    url.searchParams.get("error_description") ||
    url.searchParams.get("error") ||
    hashParams.get("error_description") ||
    hashParams.get("error");

  if (providerError) throw new Error(providerError);

  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
  } else {
    const accessToken = hashParams.get("access_token") || url.searchParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token") || url.searchParams.get("refresh_token");
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
    }
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    throw error ?? new Error("A sessão do Google não foi criada.");
  }

  const access = await verifyAccountAccessOrSignOut();
  if (!access.allowed) {
    throw new Error(access.message);
  }
}

export function GoogleLoginButton() {
  const [loading, setLoading] = useState(false);
  const appListenerRef = useRef<PluginListenerHandle | null>(null);
  const nativeCallback = getNativeAuthCallback();

  useEffect(() => {
    return () => {
      void appListenerRef.current?.remove();
      appListenerRef.current = null;
    };
  }, []);

  const handleNativeCallback = async (callbackUrl: string) => {
    if (!callbackUrl.startsWith(nativeCallback)) return;

    try {
      await Browser.close().catch(() => undefined);
      await completeNativeGoogleLogin(callbackUrl);
      await appListenerRef.current?.remove();
      appListenerRef.current = null;
      const home = getProductHomeRoute();
      window.location.replace(`#${home}`);
    } catch (error) {
      const message = getErrorMessage(error);
      console.error("Google native callback failed:", error);
      toast.error(`Não foi possível concluir o acesso com Google: ${message}`);
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const isNative = Capacitor.isNativePlatform();
      const redirectTo = isNative ? nativeCallback : `${window.location.origin}/auth/callback`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: isNative,
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
          },
        },
      });

      if (error) throw error;

      if (isNative) {
        if (!data.url) throw new Error("O Google não retornou a URL de autenticação.");

        if (!appListenerRef.current) {
          appListenerRef.current = await App.addListener("appUrlOpen", ({ url }) => {
            void handleNativeCallback(url);
          });
        }

        await Browser.open({ url: data.url });
      }
    } catch (error) {
      const message = getErrorMessage(error);
      console.error("Google sign-in failed:", error);
      toast.error(`Não foi possível entrar com Google: ${message}`);
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => void handleGoogleLogin()}
      className="flex h-[54px] w-full items-center justify-center gap-3 rounded-[18px] border border-white/10 bg-white text-[15px] font-bold text-black transition-all active:scale-[0.985] disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
          <path
            fill="#4285F4"
            d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z"
          />
          <path
            fill="#34A853"
            d="M12 22c2.7 0 4.97-.9 6.62-2.38l-3.24-2.53c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z"
          />
          <path
            fill="#FBBC05"
            d="M6.39 13.92A6.02 6.02 0 0 1 6.07 12c0-.67.12-1.32.32-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.13 1.04 4.53l3.35-2.61Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z"
          />
        </svg>
      )}
      {loading ? "Abrindo Google..." : "Continuar com Google"}
    </button>
  );
}
