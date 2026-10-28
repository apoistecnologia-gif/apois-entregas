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
import { APOIS_LOGO_DATA_URL } from "@/assets/apoisOfficialLogo";
import { APOIS_OFFICIAL_RED_LOGO_URL } from "@/assets/apoisOfficial2026";
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

  // Web-only backoffice login: do not reuse the compact mobile customer/courier shell.
  // All auth, role checks, password recovery and redirect logic are unchanged above.
  if (productMode === "admin" || productMode === "merchant") {
    const isAdmin = productMode === "admin";
    const sectionLabel = isAdmin ? "Administração de Entregas" : "Portal do Estabelecimento";
    return (
      <div className="min-h-dvh w-full bg-[#F6F7F9] text-[#182130]" data-apois-backoffice-desktop-login={productMode}>
        <div className="grid min-h-dvh w-full lg:grid-cols-[minmax(0,1fr)_minmax(460px,.87fr)]">
          <aside data-apois-portal-brand-hero className="relative hidden flex-col justify-between overflow-hidden bg-[#182130] p-12 text-white lg:flex xl:p-16">
            <div aria-hidden="true" className="pointer-events-none absolute -left-28 bottom-[-240px] h-[510px] w-[510px] rounded-full border-[76px] border-[#E51B23]/15" />
            <div aria-hidden="true" className="pointer-events-none absolute -right-36 top-[-190px] h-[510px] w-[510px] rounded-full bg-[#E51B23]/10 blur-3xl" />
            <div className="relative z-10 flex items-center gap-4">
              <img src={APOIS_OFFICIAL_RED_LOGO_URL} alt="APOIS" width="64" height="64" className="h-16 w-16 rounded-full bg-white object-contain" />
              <div>
                <p className="text-xl font-black tracking-[.12em]">APOIS</p>
                <p className="text-xs font-extrabold uppercase tracking-[.13em] text-[#FF858A]">{sectionLabel}</p>
              </div>
            </div>
            <div className="relative z-10 max-w-lg space-y-6">
              <div className="h-1.5 w-16 rounded-full bg-[#E51B23]" />
              <h1 data-apois-portal-brand-headline className="text-4xl font-black leading-tight tracking-tight text-white xl:text-5xl">
                {isAdmin ? "Controle completo das entregas." : "Seu negócio em movimento."}
              </h1>
              <p className="max-w-md text-base leading-7 text-white/75">
                {isAdmin
                  ? "Gestão de estabelecimentos, entregadores e operações em um ambiente seguro."
                  : "Acompanhe pedidos, produtos e entregas na central do seu estabelecimento."}
              </p>
            </div>
            <p className="relative z-10 border-t border-white/15 pt-6 text-xs text-white/55">
              APOIS Tecnologia e Mobilidade · Acesso restrito
            </p>
          </aside>
          <main className="flex min-h-dvh items-center justify-center px-5 py-12 sm:px-10 lg:bg-white lg:px-12" aria-labelledby="apois-portal-login-title">
            <div className="w-full max-w-[460px]">
              <div className="mb-10 flex items-center gap-3">
                <img src={APOIS_OFFICIAL_RED_LOGO_URL} alt="Logomarca APOIS" width="64" height="64" className="h-16 w-16 rounded-full bg-white object-contain shadow-[0_8px_24px_rgba(229,27,35,0.10)]" />
                <div>
                  <p className="text-xl font-black tracking-[.09em] text-[#182130]">APOIS</p>
                  <p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#C9141B]">{sectionLabel}</p>
                </div>
              </div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[.19em] text-[#C9141B]">Acesso seguro</p>
              <h2 id="apois-portal-login-title" className="text-3xl font-black tracking-tight text-[#182130]">Entrar no painel</h2>
              <p className="mb-8 mt-3 text-sm leading-6 text-[#606B7A]">
                Entre com seu e-mail e senha para acessar o {isAdmin ? "administrativo" : "estabelecimento"}.
              </p>
              <form onSubmit={handleLogin} method="post" className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="apois-portal-email" className="block text-sm font-semibold text-[#293547]">E-mail</label>
                  <Input
                    id="apois-portal-email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (loginError) setLoginError(null); }}
                    required
                    autoComplete="email"
                    placeholder="seuemail@exemplo.com"
                    className="h-12 rounded-xl border-[#DCE1E8] bg-white px-4 text-base text-[#182130]"
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="apois-portal-password" className="block text-sm font-semibold text-[#293547]">Senha</label>
                  <div className="relative">
                    <Input
                      id="apois-portal-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (loginError) setLoginError(null); }}
                      required
                      autoComplete="current-password"
                      placeholder="Digite sua senha"
                      className="h-12 rounded-xl border-[#DCE1E8] bg-white px-4 pr-12 text-base text-[#182130]"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#667081] hover:text-[#C9141B]"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  <button type="button" disabled={isLoading} onClick={() => void handlePasswordReset()} className="block w-fit text-sm font-semibold text-[#C9141B] hover:underline disabled:opacity-50">
                    Esqueci minha senha
                  </button>
                </div>
                {loginError && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{loginError}</p>}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="h-12 w-full rounded-xl bg-[#E51B23] text-base font-bold text-white shadow-[0_12px_24px_-14px_rgba(229,27,35,0.65)] hover:bg-[#C9141B]"
                >
                  {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Entrando…</> : "Entrar com segurança"}
                </Button>
              </form>
              <p className="mt-10 border-t border-[#E1E4EA] pt-5 text-center text-xs text-[#667081]">
                Acesso exclusivo às contas autorizadas. As permissões são verificadas após entrar.
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

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
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(200,138,8,0.28),transparent_30%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_30%,rgba(246,190,28,0.12),transparent_24%)]" />
        </div>

        <header className="relative z-10 mx-auto flex w-full max-w-md items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1rem)]">
          <button
            onClick={() => navigate({ to: "/" })}
            className="-ml-2 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/35 backdrop-blur-md transition-colors active:bg-white/10"
            aria-label="Voltar"
          >
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>
          <span className="flex items-center gap-1.5 rounded-full border border-accent/35 bg-black/45 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-white backdrop-blur-md">
            <Bike className="h-3.5 w-3.5 text-primary" /> Entregador
          </span>
        </header>

        <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md flex-col px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-2">
          <div className="flex min-h-[8.5rem] flex-col items-center justify-end text-center">
            <img
              src={APOIS_LOGO_DATA_URL}
              alt="APOIS ENTREGA"
              className="h-20 w-auto max-w-[72vw] object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.7)]"
            />
          </div>

          <section className="mt-1 rounded-[2rem] border border-accent/30 bg-[#090909]/94 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.7),0_0_45px_rgba(200,138,8,0.14)] backdrop-blur-xl sm:p-6">
            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-accent">
                APOIS ENTREGADOR
              </p>
              <h1 className="mt-2 text-[1.75rem] font-black leading-tight text-white">
                Entrar na sua <span className="text-primary">conta</span>
              </h1>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-5 text-zinc-400">
                Acesse sua conta para começar a receber entregas.
              </p>
            </div>

            <form onSubmit={handleLogin} method="post" className="mt-6 space-y-4">
              <div className="space-y-2">
                <label className="ml-1 text-xs font-bold text-zinc-400">E-mail</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-accent" />
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
                    className="h-14 rounded-2xl border-zinc-800 bg-black/65 pl-11 pr-4 text-base text-white placeholder:text-zinc-600 focus:border-accent focus:ring-accent"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="ml-1 text-xs font-bold text-zinc-400">Senha</label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-accent" />
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
                    className="h-14 rounded-2xl border-zinc-800 bg-black/65 pl-11 pr-12 text-base text-white placeholder:text-zinc-600 focus:border-accent focus:ring-accent"
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
                className="h-14 w-full rounded-2xl bg-gradient-to-r from-primary to-accent text-base font-black uppercase tracking-[0.06em] text-white shadow-[0_12px_35px_rgba(246,190,28,0.22),0_0_30px_rgba(200,138,8,0.15)] transition-transform active:scale-[0.985]"
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
            src={APOIS_LOGO_DATA_URL}
            alt="APOIS ENTREGA"
            className="mb-5 h-20 w-auto object-contain"
          />
          <p className="text-sm font-black uppercase tracking-[0.24em] text-accent">
            {productLabel}
          </p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-white">
            Que bom ter você de volta
          </h1>
        </div>

        <form onSubmit={handleLogin} method="post" className="mt-10 space-y-5">
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
              className="h-14 rounded-2xl border-zinc-800 bg-zinc-900/50 px-4 text-base text-white placeholder:text-zinc-600 focus:border-accent focus:ring-accent"
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
                className="h-14 rounded-2xl border-zinc-800 bg-zinc-900/50 px-4 pr-12 text-base text-white placeholder:text-zinc-600 focus:border-accent focus:ring-accent"
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
            className="h-14 w-full rounded-2xl bg-gradient-to-r from-primary to-accent text-lg font-black text-white shadow-[0_12px_35px_rgba(200,138,8,0.18)] transition-transform hover:opacity-95 active:scale-[0.98]"
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
