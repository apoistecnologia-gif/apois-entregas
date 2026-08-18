import { useEffect, useRef, useState } from "react";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const CUSTOMER_OAUTH_CALLBACK = "br.com.apois.cliente://auth/callback";

type AppUrlOpenEvent = { url: string };
type AppPlugin = {
  addListener(
    eventName: "appUrlOpen",
    listener: (event: AppUrlOpenEvent) => void,
  ): Promise<PluginListenerHandle>;
};
type BrowserPlugin = {
  open(options: { url: string }): Promise<void>;
  close(): Promise<void>;
};

const NativeApp = registerPlugin<AppPlugin>("App");
const NativeBrowser = registerPlugin<BrowserPlugin>("Browser");

async function completeNativeGoogleLogin(callbackUrl: string) {
  const url = new URL(callbackUrl);
  const providerError =
    url.searchParams.get("error_description") ||
    url.searchParams.get("error") ||
    new URLSearchParams(url.hash.replace(/^#/, "")).get("error_description") ||
    new URLSearchParams(url.hash.replace(/^#/, "")).get("error");

  if (providerError) throw new Error(providerError);

  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
  } else {
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

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
}

export function GoogleLoginButton() {
  const [loading, setLoading] = useState(false);
  const appListenerRef = useRef<PluginListenerHandle | null>(null);

  useEffect(() => {
    return () => {
      void appListenerRef.current?.remove();
      appListenerRef.current = null;
    };
  }, []);

  const handleNativeCallback = async (callbackUrl: string) => {
    if (!callbackUrl.startsWith(CUSTOMER_OAUTH_CALLBACK)) return;

    try {
      await NativeBrowser.close().catch(() => undefined);
      await completeNativeGoogleLogin(callbackUrl);
      await appListenerRef.current?.remove();
      appListenerRef.current = null;
      window.location.replace("/inicio");
    } catch (error) {
      console.error("Google native callback failed:", error);
      toast.error("Não foi possível concluir o acesso com Google.");
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const isNative = Capacitor.isNativePlatform();
      const redirectTo = isNative ? CUSTOMER_OAUTH_CALLBACK : `${window.location.origin}/auth/callback`;

      if (isNative && !appListenerRef.current) {
        appListenerRef.current = await NativeApp.addListener("appUrlOpen", ({ url }) => {
          void handleNativeCallback(url);
        });
      }

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
        await NativeBrowser.open({ url: data.url });
      }
    } catch (error) {
      console.error("Google sign-in failed:", error);
      toast.error("Não foi possível entrar com Google agora.");
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
          <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z" />
          <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.38l-3.24-2.53c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z" />
          <path fill="#FBBC05" d="M6.39 13.92A6.02 6.02 0 0 1 6.07 12c0-.67.12-1.32.32-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.13 1.04 4.53l3.35-2.61Z" />
          <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z" />
        </svg>
      )}
      {loading ? "Abrindo Google..." : "Continuar com Google"}
    </button>
  );
}
