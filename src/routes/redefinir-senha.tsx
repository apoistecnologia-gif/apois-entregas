import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getApoisProductMode } from "@/lib/product-routing";
import { APOIS_OFFICIAL_RED_LOGO_URL } from "@/assets/apoisOfficial2026";

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

  const product = getApoisProductMode();
  const isBackoffice = product === "admin" || product === "merchant";

  useEffect(() => {
    let cancelled = false;
    let recoveryEvent = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session && !cancelled) {
        recoveryEvent = true;
        setReady(true);
        setLinkError(null);
        setChecking(false);
      }
    });
    const establishRecoverySession = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        if (params.has("error") || hash.has("error")) throw new Error("invalid_recovery_link");
        const code = params.get("code");
        const tokenHash = params.get("token_hash");
        const type = params.get("type") ?? hash.get("type");
        let recoveryIntent = recoveryEvent;

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          recoveryIntent = true;
        } else if (tokenHash && type === "recovery") {
          const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
          if (error) throw error;
          recoveryIntent = true;
        } else if (type === "recovery" && hash.has("access_token")) {
          // The Supabase client consumes implicit recovery tokens automatically.
          recoveryIntent = true;
        }
        if (!isBackoffice) {
          // Preserve the historical customer/courier recovery contract.
          // Only the two administrative web portals adopt the stricter link gate.
          const { data: { session }, error } = await supabase.auth.getSession();
          if (error || !session) throw error ?? new Error("invalid_recovery_session");
          if (!cancelled) { setReady(true); setLinkError(null); setChecking(false); }
          return;
        }
        if (!recoveryIntent && !recoveryEvent) throw new Error("no_recovery_link");

        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) throw error ?? new Error("invalid_recovery_session");
        if (!cancelled) {
          setReady(true);
          setLinkError(null);
          setChecking(false);
        }
      } catch {
        if (!cancelled && !recoveryEvent) {
          setReady(false);
          setLinkError("Este link de recuperação é inválido ou expirou. Solicite outro pelo login.");
          setChecking(false);
        }
      }
    };
    void establishRecoverySession();
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [isBackoffice]);

  const passwordError = useMemo(() => {
    if (!password) return "Informe a nova senha.";
    if (isBackoffice ? (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) : password.length < 8) return isBackoffice ? "Use pelo menos 10 caracteres, incluindo letras e números." : "Use pelo menos 8 caracteres.";
    if (confirmPassword !== password) return "As senhas não coincidem.";
    return null;
  }, [confirmPassword, password, isBackoffice]);

  const savePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || passwordError || saving) return;
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error("Não foi possível atualizar a senha. Solicite outro link, se necessário.");
      setSaving(false);
      return;
    }
    await supabase.auth.signOut();
    toast.success("Senha atualizada. Entre novamente com a nova senha.");
    navigate({ to: "/login" });
  };

  return (
    <div className={isBackoffice ? "grid min-h-dvh place-items-center bg-[#F6F7F9] p-6 text-[#182130]" : "grid min-h-dvh place-items-center bg-black p-6 text-white"}>
      <div className={isBackoffice ? "w-full max-w-md rounded-3xl border border-[#E1E4EA] bg-white p-7 shadow-[0_16px_54px_rgba(24,33,48,0.08)]" : "w-full max-w-sm rounded-3xl border border-zinc-900 bg-zinc-950 p-6"}>
        <div className="text-center">
          {isBackoffice && <img src={APOIS_OFFICIAL_RED_LOGO_URL} alt="APOIS" width="72" height="72" className="mx-auto mb-3 h-[72px] w-[72px] rounded-full bg-white object-contain" />}
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            {checking ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : (
              <LockKeyhole className="h-7 w-7" />
            )}
          </div>
          <h1 className="mt-4 text-2xl font-black">Redefinir senha</h1>
          <p className={isBackoffice ? "mt-2 text-sm text-[#606B7A]" : "mt-2 text-sm text-zinc-500"}>Crie uma nova senha para sua conta APOIS.</p>
        </div>

        {checking ? (
          <p className={isBackoffice ? "mt-6 text-center text-sm text-[#606B7A]" : "mt-6 text-center text-sm text-zinc-500"}>
            Validando o link de recuperação...
          </p>
        ) : linkError ? (
          <div className="mt-6">
            <p
              role="alert"
              className={isBackoffice ? "rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" : "rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"}
            >
              {linkError}
            </p>
            <Button
              type="button"
              onClick={() => navigate({ to: "/login" })}
              className="mt-4 h-12 w-full"
            >
              Voltar ao login
            </Button>
          </div>
        ) : (
          <form onSubmit={savePassword} method="post" className="mt-6 space-y-4">
            <label className={isBackoffice ? "block text-xs font-bold text-[#606B7A]" : "block text-xs font-bold text-zinc-400"}>
              Nova senha
              <div className="relative mt-2">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  className={isBackoffice ? "h-12 border-[#DCE1E8] bg-white pr-12 text-[#182130]" : "h-12 border-zinc-800 bg-black pr-12"}
                  placeholder={isBackoffice ? "Mínimo 10 caracteres, letras e números" : "Mínimo 8 caracteres"}
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
                className={isBackoffice ? "mt-2 h-12 border-[#DCE1E8] bg-white text-[#182130]" : "mt-2 h-12 border-zinc-800 bg-black"}
                placeholder="Repita a senha"
              />
            </label>
            {password || confirmPassword ? (
              <p className={`text-xs ${passwordError ? "text-red-400" : "text-emerald-400"}`}>
                {passwordError ?? "Senha pronta para ser atualizada."}
              </p>
            ) : null}
            <Button disabled={Boolean(passwordError) || saving} className={isBackoffice ? "h-12 w-full bg-[#E51B23] font-black text-white hover:bg-[#C9141B]" : "h-12 w-full font-black"}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar nova senha
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
