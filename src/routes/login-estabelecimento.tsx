import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Store,
} from "lucide-react";
import { useState } from "react";
import logoAsset from "@/assets/logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { getApoisProductMode, getProductLandingRoute } from "@/lib/product-routing";
import { toast } from "sonner";

export const Route = createFileRoute("/login-estabelecimento")({
  beforeLoad: () => {
    if (getApoisProductMode() !== "merchant") {
      throw redirect({ to: getProductLandingRoute() });
    }
  },
  component: MerchantLogin,
  head: () => ({
    title: "Entrar | APOIS Estabelecimento",
    meta: [
      {
        name: "description",
        content: "Entre no painel do seu estabelecimento ou faça seu cadastro na APOIS ENTREGA.",
      },
    ],
  }),
});

function MerchantLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;

    const normalizedEmail = email.trim().toLowerCase();
    setLoginError(null);
    if (!normalizedEmail || !password) {
      setLoginError("Preencha o e-mail e a senha para entrar.");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
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

      toast.success("Login realizado com sucesso!");
      await navigate({ to: "/merchant" });
    } catch {
      const message = "Erro ao realizar login. Tente novamente.";
      setLoginError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

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

  const handleRegister = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      // O acesso público do estabelecimento precisa permitir o cadastro de uma
      // nova empresa mesmo quando existe uma sessão antiga neste navegador.
      await supabase.auth.signOut();
      await navigate({ to: "/register" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute -right-28 bottom-12 h-80 w-80 rounded-full bg-primary/10 blur-[130px]" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={logoAsset.url} alt="APOIS ENTREGA" className="h-20 w-auto object-contain" />
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
            <Store className="h-4 w-4" /> APOIS Estabelecimento
          </div>
          <h1 className="mt-5 text-3xl font-black leading-tight text-white">Entre no seu painel</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-400">
            Já é parceiro? Entre com sua conta. Ainda não é? Faça o cadastro do seu estabelecimento.
          </p>
        </div>

        <section className="rounded-[2rem] border border-white/10 bg-zinc-950/90 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="ml-1 text-xs font-bold text-zinc-400">E-mail</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (loginError) setLoginError(null);
                  }}
                  placeholder="Digite seu e-mail"
                  autoComplete="email"
                  required
                  className="h-14 rounded-2xl border-zinc-800 bg-black/70 pl-12 pr-4 text-base text-white placeholder:text-zinc-600 focus:border-primary focus:ring-primary"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="ml-1 text-xs font-bold text-zinc-400">Senha</label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (loginError) setLoginError(null);
                  }}
                  placeholder="Sua senha"
                  autoComplete="current-password"
                  required
                  className="h-14 rounded-2xl border-zinc-800 bg-black/70 pl-12 pr-12 text-base text-white placeholder:text-zinc-600 focus:border-primary focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-white"
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
                  className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
                >
                  Esqueci minha senha
                </button>
              </div>
            </div>

            {loginError ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium leading-relaxed text-red-300" role="alert">
                {loginError}
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={isLoading}
              className="h-14 w-full rounded-2xl bg-primary text-base font-black uppercase tracking-[0.05em] text-black shadow-[0_12px_35px_rgba(250,204,21,0.18)] hover:bg-primary/90"
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

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-800" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">ou</span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={isLoading}
            onClick={() => void handleRegister()}
            className="h-14 w-full rounded-2xl border-primary/35 bg-primary/5 text-sm font-black text-primary hover:bg-primary/10"
          >
            Cadastrar estabelecimento <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Acesso protegido pela sua conta APOIS
          </div>
        </section>

        <p className="mt-6 text-center text-[11px] leading-5 text-zinc-600">
          No primeiro cadastro, você criará sua conta e depois informará os dados e documentos do estabelecimento para análise.
        </p>
      </main>
    </div>
  );
}
