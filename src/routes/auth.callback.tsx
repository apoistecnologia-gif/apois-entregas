import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { verifyAccountAccessOrSignOut } from "@/lib/account-access";
import { getSafeProductRoute } from "@/lib/product-routing";
import { markPasswordRecoveryIntent } from "@/lib/passwordRecoveryIntent";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: AuthCallbackPage,
  head: () => ({ meta: [{ title: "Confirmando acesso | APOIS ENTREGA" }] }),
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const providerError = params.get("error_description") || params.get("error");
      if (providerError) {
        if (!cancelled) setErrorMessage(providerError);
        return;
      }

      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          if (!cancelled)
            setErrorMessage("Não foi possível confirmar este acesso. Solicite um novo link.");
          return;
        }
      }

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (error || !session) {
        if (!cancelled)
          setErrorMessage("O link expirou ou já foi utilizado. Tente entrar novamente.");
        return;
      }

      // Supabase recovery links are authentication sessions, not normal logins.
      // Keep the user on the password creation form before any home redirects.
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const isRecovery =
        params.get("type") === "recovery" ||
        hash.get("type") === "recovery" ||
        params.get("next") === "/redefinir-senha";
      if (isRecovery) {
        markPasswordRecoveryIntent();
        if (!cancelled) {
          await navigate({ to: "/redefinir-senha", replace: true });
        }
        return;
      }

      const access = await verifyAccountAccessOrSignOut();
      if (!access.allowed) {
        if (!cancelled) setErrorMessage(access.message);
        return;
      }

      if (!cancelled) {
        navigate({ to: getSafeProductRoute(params.get("next")) });
      }
    };

    void finish();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="grid min-h-dvh place-items-center bg-black p-6 text-white">
      <div className="w-full max-w-sm rounded-3xl border border-zinc-900 bg-zinc-950 p-6 text-center">
        {errorMessage ? (
          <>
            <XCircle className="mx-auto h-10 w-10 text-red-400" />
            <h1 className="mt-4 text-xl font-black">Não foi possível confirmar</h1>
            <p role="alert" className="mt-2 text-sm leading-relaxed text-zinc-400">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/login" })}
              className="mt-6 h-12 w-full rounded-2xl bg-primary font-black text-black"
            >
              Voltar ao login
            </button>
          </>
        ) : (
          <>
            <div className="relative mx-auto h-12 w-12">
              <CheckCircle2 className="absolute inset-0 h-12 w-12 text-primary/30" />
              <Loader2 className="absolute inset-2 h-8 w-8 animate-spin text-primary" />
            </div>
            <h1 className="mt-4 text-xl font-black">Confirmando seu acesso</h1>
            <p className="mt-2 text-sm text-zinc-500">Aguarde só um instante.</p>
          </>
        )}
      </div>
    </div>
  );
}
