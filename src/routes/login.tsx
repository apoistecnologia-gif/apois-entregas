import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bike,
  ChevronLeft,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import logoAsset from "@/assets/logo.png.asset.json";
import deliveryHeroAsset from "@/assets/delivery-hero.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  getApoisProductMode,
  getProductHomeRoute,
  getProductLabel,
  productAllowsPublicSignup,
} from "@/lib/product-routing";

async function hasAdminRole(userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !error && Boolean(data);
}

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    if (getApoisProductMode() === "admin" && !(await hasAdminRole(session.user.id))) {
      await supabase.auth.signOut();
      return;
    }
    throw redirect({ to: getProductHomeRoute() });
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
  const productMode = getApoisProductMode();
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

      if (getApoisProductMode() === "admin" && !(await hasAdminRole(authData.user.id))) {
        await supabase.auth.signOut();
        const message = "Esta conta não possui autorização para acessar o painel administrativo.";
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

  if (productMode === "courier") {
    return (
      <div className="relative min-h-dvh w-full overflow-x-hidden bg-black text-white">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[31rem] overflow-hidden">
          <img
            src={deliveryHeroAsset.url}
            alt=""
            aria-hidden="true"
            className="h-full w-full scale-105 object-cover object-center opacity-55 saturate-[0.8]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.12)_0%,rgba(0,0,0,0.62)_54%,#000_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(250,204,21,0.18),transparent_28%)]" />
        </div>

        <header className="relative z-10 mx-auto flex w-full max-w-md items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1rem)]">
          <button
            onClick={() => navigate({ to: "/" })}
            className="-ml-2 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/35 backdrop-blur-md transition-colors active:bg-white/10"
            aria-label="Voltar"
          >
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>
          <span className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-black/45 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-primary backdrop-blur-md">
            <Bike className="h-3.5 w-3.5" /> Entregador
          </span>
        </header>

        <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md flex-col px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-2">
          <div className="flex min-h-[8.5rem] flex-col items-center justify-end text-center">
            <img
              src={logoAsset.url}
              alt="APOIS ENTREGA"
              className="h-20 w-auto max-w-[72vw] object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.7)]"
            />
          </div>

          <section className="mt-1 rounded-[2rem] border border-primary/25 bg-[#090909]/94 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.7),0_0_45px_rgba(250,204,21,0.06)] backdrop-blur-xl sm:p-6">
            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
                APOIS ENTREGADOR
              </p>
              <h1 className="mt-2 text-[1.75rem] font-black leading-tight text-white">
                Entrar na sua <span className="text-primary">conta</span>
              </h1>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-5 text-zinc-400">
                Acesse sua conta para começar a receber entregas.
              </p>
            </div>

            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <div className="space-y-2">
                <label className="ml-1 text-xs font-bold text-zinc-400">E-mail</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-primary" />
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
                    className="h-14 rounded-2xl border-zinc-800 bg-black/65 pl-11 pr-4 text-base text-white placeholder:text-zinc-600 focus:border-primary focus:ring-primary"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="ml-1 text-xs font-bold text-zinc-400">Senha</label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-primary" />
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
                    className="h-14 rounded-2xl border-zinc-800 bg-black/65 pl-11 pr-12 text-base text-white placeholder:text-zinc-600 focus:border-primary focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 active:text-zinc-300"
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
                    className="text-xs font-bold text-primary disabled:opacity-50"
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
                className="h-14 w-full rounded-2xl bg-primary text-base font-black uppercase tracking-[0.06em] text-black shadow-[0_12px_35px_rgba(250,204,21,0.2)] transition-transform active:scale-[0.985]"
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

            <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Acesso protegido pela sua conta APOIS
            </div>
          </section>

          <div className="mt-5 text-center">
            {allowsSignup ? (
              <p className="text-sm text-zinc-500">
                Ainda não é entregador?{" "}
                <Link to="/register" className="font-black text-primary">
                  Criar minha conta
                </Link>
              </p>
            ) : null}
          </div>
        </main>
      </div>
    );
  }

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
