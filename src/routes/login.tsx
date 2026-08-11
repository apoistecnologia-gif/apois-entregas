import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import logoAsset from "@/assets/logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  getApoisProductMode,
  getProductHomeRoute,
  getProductLabel,
  productAllowsPublicSignup,
} from "@/lib/product-routing";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      throw redirect({ to: getProductHomeRoute() });
    }
  },
  component: Login,
  head: () => ({
    title: `Login - ${getProductLabel()}`,
    meta: [{ name: "description", content: `Entre na sua conta do ${getProductLabel()}` }],
  }),
});

function isRedirectAllowedForCurrentProduct(pathname: string) {
  const product = getApoisProductMode();
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return false;

  if (product === "courier") return pathname === "/courier" || pathname.startsWith("/courier/");
  if (product === "merchant") {
    return (
      pathname === "/merchant" ||
      pathname.startsWith("/merchant/") ||
      pathname === "/configuracoes-estabelecimento" ||
      pathname.startsWith("/configuracoes-estabelecimento/")
    );
  }
  if (product === "admin") return pathname === "/admin" || pathname.startsWith("/admin/");

  return !(
    pathname === "/courier" ||
    pathname.startsWith("/courier/") ||
    pathname === "/merchant" ||
    pathname.startsWith("/merchant/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}

function Login() {
  const navigate = useNavigate();
  const productLabel = getProductLabel();
  const allowsSignup = productAllowsPublicSignup();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  const handlePasswordReset = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setLoginError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      const message = "Digite seu e-mail para receber o link de recuperação.";
      setLoginError(message);
      toast.error(message);
      return;
    }
    if (isLoading) return;
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setIsLoading(false);
    if (error) {
      const message = "Não foi possível enviar o link de recuperação agora.";
      setLoginError(message);
      toast.error(message);
      return;
    }
    toast.success("Se este e-mail estiver cadastrado, você receberá o link de recuperação.");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const normalizedEmail = email.trim().toLowerCase();
    setLoginError(null);
    if (!normalizedEmail || !password) {
      setLoginError("Preencha o e-mail e a senha para entrar.");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        const message = "E-mail ou senha incorretos. Confira os dados e tente novamente.";
        setLoginError(message);
        toast.error(message);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        await supabase.auth.signOut();
        const message = "Não foi possível validar sua conta. Tente novamente.";
        setLoginError(message);
        toast.error(message);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("is_active,blocked_reason")
        .eq("id", authData.user.id)
        .maybeSingle();
      if (profileError || !profile) {
        await supabase.auth.signOut();
        const message = "Não foi possível validar seu perfil. Tente novamente.";
        setLoginError(message);
        toast.error(message);
        return;
      }
      if (profile.is_active === false) {
        await supabase.auth.signOut();
        const message =
          profile.blocked_reason || "Sua conta está desativada. Entre em contato com o suporte.";
        setLoginError(message);
        toast.error(message);
        return;
      }

      if (data.session) {
        toast.success("Login realizado com sucesso!");
        const searchParams = new URLSearchParams(window.location.search);
        const redirectPath = searchParams.get("redirect");
        const safeRedirectPath =
          redirectPath && isRedirectAllowedForCurrentProduct(redirectPath) ? redirectPath : null;

        await navigate({ to: safeRedirectPath || getProductHomeRoute() });
      }
    } catch {
      const message = "Erro ao realizar login. Tente novamente.";
      setLoginError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh w-full overflow-y-auto bg-black text-white">
      <header className="mx-auto flex w-full max-w-md items-center px-5 pt-[max(env(safe-area-inset-top),1rem)]">
        <button
          onClick={() => navigate({ to: "/" })}
          className="-ml-2 rounded-full p-2 transition-colors hover:bg-white/10"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-5 w-5 text-white" />
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col px-6 pb-[max(env(safe-area-inset-bottom),2rem)] pt-8">
        <div className="flex flex-col items-center text-center">
          <img
            src={logoAsset.url}
            alt="APOIS ENTREGA"
            className="mb-5 h-20 w-auto object-contain"
          />
          <p className="text-sm font-black uppercase tracking-[0.24em] text-primary">
            {productLabel}
          </p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-white">
            Que bom ter você de volta
          </h1>
        </div>

        <form onSubmit={handleLogin} className="mt-10 space-y-5">
          <div className="space-y-2">
            <label className="ml-1 text-sm font-medium text-zinc-400">E-mail</label>
            <Input
              type="email"
              placeholder="Digite seu e-mail"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (loginError) setLoginError(null);
              }}
              required
              autoComplete="email"
              className="h-14 rounded-2xl border-zinc-800 bg-zinc-900/50 px-4 text-base text-white placeholder:text-zinc-600 focus:border-primary focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <label className="ml-1 text-sm font-medium text-zinc-400">Senha</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Sua senha"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (loginError) setLoginError(null);
                }}
                required
                autoComplete="current-password"
                className="h-14 rounded-2xl border-zinc-800 bg-zinc-900/50 px-4 pr-12 text-base text-white placeholder:text-zinc-600 focus:border-primary focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => void handlePasswordReset()}
                className="text-sm font-bold text-primary hover:underline disabled:opacity-50"
              >
                Esqueci minha senha
              </button>
            </div>
          </div>

          {loginError ? (
            <div
              role="alert"
              className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium leading-relaxed text-red-300"
            >
              {loginError}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={isLoading}
            className="h-14 w-full rounded-2xl bg-primary text-lg font-black text-black transition-transform hover:bg-primary/90 active:scale-[0.98]"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Entrando...
              </>
            ) : (
              "Entrar"
            )}
          </Button>
        </form>

        <div className="mt-7 text-center">
          {allowsSignup ? (
            <p className="text-sm text-zinc-500">
              Ainda não tem uma conta?{" "}
              <Link to="/register" className="font-bold text-primary hover:underline">
                Criar minha conta
              </Link>
            </p>
          ) : (
            <p className="text-sm text-zinc-500">Acesso restrito a administradores autorizados.</p>
          )}
        </div>

        <div className="mt-8 pb-3 text-center opacity-40">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">
            © 2026 APOIS ENTREGA
          </p>
        </div>
      </main>
    </div>
  );
}
