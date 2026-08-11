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

  const handlePasswordReset = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      toast.error("Digite seu e-mail para receber o link de recuperação.");
      return;
    }
    if (isLoading) return;
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setIsLoading(false);
    if (error) {
      toast.error("Não foi possível enviar o link de recuperação agora.");
      return;
    }
    toast.success("Se este e-mail estiver cadastrado, você receberá o link de recuperação.");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || isLoading) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!error) {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          await supabase.auth.signOut();
          toast.error("Não foi possível validar sua conta. Tente novamente.");
          setIsLoading(false);
          return;
        }
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("is_active,blocked_reason")
          .eq("id", authData.user.id)
          .maybeSingle();
        if (profileError || !profile) {
          await supabase.auth.signOut();
          toast.error("Não foi possível validar seu perfil. Tente novamente.");
          setIsLoading(false);
          return;
        }
        if (profile.is_active === false) {
          await supabase.auth.signOut();
          toast.error(
            profile.blocked_reason || "Sua conta está desativada. Entre em contato com o suporte.",
          );
          setIsLoading(false);
          return;
        }
      }

      if (error) {
        toast.error("E-mail ou senha incorretos.");
        setIsLoading(false);
        return;
      }

      if (data.session) {
        toast.success("Login realizado com sucesso!");
        const searchParams = new URLSearchParams(window.location.search);
        const redirectPath = searchParams.get("redirect");
        const safeRedirectPath =
          redirectPath && isRedirectAllowedForCurrentProduct(redirectPath) ? redirectPath : null;

        if (safeRedirectPath) {
          navigate({ to: safeRedirectPath });
        } else {
          navigate({ to: getProductHomeRoute() });
        }
      }
    } catch (err: any) {
      toast.error("Erro ao realizar login. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-black text-white overflow-hidden w-full">
      <header className="flex items-center px-3 py-2 shrink-0 bg-black">
        <button
          onClick={() => navigate({ to: "/" })}
          className="p-2 -ml-1 hover:bg-white/10 rounded-full transition-colors"
          aria-label="Voltar"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
      </header>

      <main className="flex-1 flex flex-col px-6 justify-between pb-4 min-h-0">
        <div className="flex flex-col">
          <div className="flex flex-col items-center mb-4 text-center">
            <img
              src={logoAsset.url}
              alt="APOIS ENTREGA"
              className="h-12 w-auto object-contain mb-3"
            />
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
              {productLabel}
            </p>
            <h1 className="mt-2 text-[20px] font-black text-white leading-tight">
              Que bom ter você de volta
            </h1>
          </div>

          <div className="space-y-3">
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-400 ml-1">E-mail</label>
                <Input
                  type="email"
                  placeholder="Digite seu e-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-zinc-900/50 border-zinc-800 h-11 rounded-xl text-white placeholder:text-zinc-600 focus:ring-primary focus:border-primary text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-400 ml-1">Senha</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-zinc-900/50 border-zinc-800 h-11 rounded-xl text-white placeholder:text-zinc-600 pr-12 focus:ring-primary focus:border-primary text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => void handlePasswordReset()}
                    className="text-primary text-[11px] font-bold hover:underline disabled:opacity-50"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-primary text-black hover:bg-primary/90 font-bold h-11 text-base rounded-xl mt-1 transition-transform active:scale-[0.98]"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Entrar"}
              </Button>
            </form>
          </div>
        </div>

        <div className="flex flex-col space-y-4">
          <div className="text-center">
            {allowsSignup ? (
              <p className="text-zinc-500 text-xs">
                Ainda não tem uma conta?{" "}
                <Link to="/register" className="text-primary font-bold hover:underline">
                  Criar minha conta
                </Link>
              </p>
            ) : (
              <p className="text-zinc-500 text-xs">
                Acesso restrito a administradores autorizados.
              </p>
            )}
          </div>

          <div className="text-center opacity-40">
            <p className="text-zinc-600 text-[10px] font-medium uppercase tracking-wider">
              © 2026 APOIS ENTREGA
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
