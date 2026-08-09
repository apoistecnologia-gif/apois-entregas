import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/redefinir-senha")({
  ssr: false,
  component: RedefinirSenhaPage,
  head: () => ({ meta: [{ title: "Redefinir senha | APOIS ENTREGA" }] }),
});

function RedefinirSenhaPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const establishRecoverySession = async () => {
      const params = new URLSearchParams(window.location.search);
      const providerError = params.get("error_description") || params.get("error");
      if (providerError) {
        if (!cancelled) {
          setLinkError("Este link de recuperação é inválido ou expirou.");
          setChecking(false);
        }
        return;
      }

      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (!cancelled) {
            setLinkError("Este link de recuperação é inválido ou expirou.");
            setChecking(false);
          }
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) {
        setReady(Boolean(session));
        setLinkError(session ? null : "Não encontramos uma sessão válida para redefinir a senha.");
        setChecking(false);
      }
    };

    void establishRecoverySession();
    return () => {
      cancelled = true;
    };
  }, []);

  const passwordError = useMemo(() => {
    if (!password) return "Informe a nova senha.";
    if (password.length < 8) return "Use pelo menos 8 caracteres.";
    if (confirmPassword !== password) return "As senhas não coincidem.";
    return null;
  }, [confirmPassword, password]);

  const savePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || passwordError || saving) return;
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message || "Não foi possível atualizar sua senha.");
      setSaving(false);
      return;
    }
    await supabase.auth.signOut();
    toast.success("Senha atualizada. Entre novamente com a nova senha.");
    navigate({ to: "/login" });
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-black p-6 text-white">
      <div className="w-full max-w-sm rounded-3xl border border-zinc-900 bg-zinc-950 p-6">
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            {checking ? <Loader2 className="h-7 w-7 animate-spin" /> : <LockKeyhole className="h-7 w-7" />}
          </div>
          <h1 className="mt-4 text-2xl font-black">Redefinir senha</h1>
          <p className="mt-2 text-sm text-zinc-500">Crie uma nova senha para sua conta APOIS.</p>
        </div>

        {checking ? (
          <p className="mt-6 text-center text-sm text-zinc-500">Validando o link de recuperação...</p>
        ) : linkError ? (
          <div className="mt-6">
            <p role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
              {linkError}
            </p>
            <Button type="button" onClick={() => navigate({ to: "/login" })} className="mt-4 h-12 w-full">
              Voltar ao login
            </Button>
          </div>
        ) : (
          <form onSubmit={savePassword} className="mt-6 space-y-4">
            <label className="block text-xs font-bold text-zinc-400">
              Nova senha
              <div className="relative mt-2">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  className="h-12 border-zinc-800 bg-black pr-12"
                  placeholder="Mínimo 8 caracteres"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </label>
            <label className="block text-xs font-bold text-zinc-400">
              Confirme a nova senha
              <Input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                className="mt-2 h-12 border-zinc-800 bg-black"
                placeholder="Repita a senha"
              />
            </label>
            {password || confirmPassword ? (
              <p className={`text-xs ${passwordError ? "text-red-400" : "text-emerald-400"}`}>
                {passwordError ?? "Senha pronta para ser atualizada."}
              </p>
            ) : null}
            <Button disabled={Boolean(passwordError) || saving} className="h-12 w-full font-black">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar nova senha
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
