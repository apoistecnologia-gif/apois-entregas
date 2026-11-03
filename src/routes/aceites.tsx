import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, FileCheck2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getApoisProductMode, getProductHomeRoute } from "@/lib/product-routing";

// Recurso desligado por padrão. Publicação jurídica, schema e função devem ser
// homologados ANTES de configurar VITE_APOIS_LEGAL_ACCEPTANCE_V2=true.
const enabled = import.meta.env.VITE_APOIS_LEGAL_ACCEPTANCE_V2 === "true";

export const Route = createFileRoute("/aceites")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (!enabled) throw redirect({ to: getProductHomeRoute() });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } });
  },
  component: LegalAcceptances,
  head: () => ({ meta: [{ title: "Documentos e aceites | APOIS Entregas" }] }),
});

type DocumentVersion = {
  id: string;
  document_key: string;
  audience: string;
  version: string;
  content_text: string;
  content_sha256: string;
  effective_at: string;
};
type AcceptanceEvent = {
  id: string;
  document_version_id: string;
  action: string;
  occurred_at: string;
};

const labels: Record<string, string> = {
  general_terms: "Termos Gerais de Uso",
  privacy_notice: "Política de Privacidade",
  courier_contract: "Contrato do Entregador",
  merchant_contract: "Contrato do Estabelecimento",
  customer_delivery_terms: "Termos do Cliente de Entregas",
  safety_policy: "Regulamento de Segurança",
  cancellation_policy: "Cancelamentos e Reembolsos",
};

function LegalAcceptances() {
  const navigate = useNavigate();
  const product = getApoisProductMode();
  const [documents, setDocuments] = useState<DocumentVersion[]>([]);
  const [events, setEvents] = useState<AcceptanceEvent[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const { data: userInfo, error: userError } = await supabase.auth.getUser();
        const userId = userInfo.user?.id;
        if (userError || !userId) throw new Error("Sessão não autenticada");
        const audience = product === "admin" ? "all" : product;
        const [catalog, history] = await Promise.all([
          supabase.from("legal_document_versions")
            .select("id,document_key,audience,version,content_text,content_sha256,effective_at")
            .eq("status", "published")
            .lte("effective_at", new Date().toISOString())
            .in("audience", audience === "all" ? ["all"] : ["all", audience]),
          supabase.from("legal_acceptance_events")
            .select("id,document_version_id,action,occurred_at")
            .eq("user_id", userId),
        ]);
        if (catalog.error || history.error) throw new Error("Não foi possível consultar as versões jurídicas");
        if (!mounted) return;
        setDocuments((catalog.data ?? []) as DocumentVersion[]);
        setEvents((history.data ?? []) as AcceptanceEvent[]);
      } catch {
        if (mounted) setError("Não foi possível carregar os documentos. Nenhum aceite foi registrado.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [product]);

  const acceptedByDocument = useMemo(() => {
    const map = new Map<string, AcceptanceEvent>();
    for (const event of events) map.set(event.document_version_id, event);
    return map;
  }, [events]);

  async function confirm(document: DocumentVersion) {
    if (!checked[document.id] || working) return;
    if (!expanded[document.id]) return;
    if (!window.crypto?.randomUUID) {
      setError("O dispositivo não suporta a geração segura do protocolo. Atualize o aplicativo.");
      return;
    }
    const action = document.document_key === "privacy_notice" ? "acknowledged" : "accepted";
    setWorking(document.id);
    setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("legal-acceptance", {
        body: {
          document_id: document.id,
          content_sha256: document.content_sha256,
          action,
          request_id: window.crypto.randomUUID(),
          app_version: String(import.meta.env.VITE_APP_VERSION ?? "nao-informada").slice(0, 64),
        },
      });
      if (invokeError || !data?.id || data?.content_sha256 !== document.content_sha256 ||
          data?.document_version_id !== document.id) {
        throw new Error("O servidor não confirmou o registro da versão exibida");
      }
      setEvents((current) => [...current, {
        id: String(data.id),
        document_version_id: document.id,
        action,
        occurred_at: String(data.occurred_at),
      }]);
      setChecked((previous) => ({ ...previous, [document.id]: false }));
    } catch {
      setError("Não foi possível registrar o aceite. Nada foi confirmado. Tente novamente.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-950 p-4">
        <button type="button" className="rounded-xl p-2 hover:bg-white/10"
          aria-label="Voltar" onClick={() => navigate({ to: getProductHomeRoute() })}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-black">Documentos e aceites</h1>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 p-5">
        <p className="text-sm leading-relaxed text-zinc-400">
          Leia cada documento publicado para seu perfil. O aceite contratual e a ciência da Política
          de Privacidade são registrados separadamente, com a versão e a data informadas pelo servidor.
        </p>
        {loading && <p className="flex items-center gap-2 text-zinc-300"><Loader2 className="h-4 w-4 animate-spin" /> Carregando versões...</p>}
        {error && <p role="alert" className="rounded-xl border border-red-500/40 p-4 text-sm text-red-300">{error}</p>}
        {!loading && !error && documents.length === 0 && (
          <p className="rounded-xl border border-white/10 p-5 text-sm text-zinc-400">
            Nenhum documento novo está publicado para aceite neste momento. Seus aceites anteriores permanecem preservados.
          </p>
        )}
        {documents.map((doc) => {
          const accepted = acceptedByDocument.get(doc.id);
          const actionLabel = doc.document_key === "privacy_notice"
            ? "Confirmar ciência desta política"
            : "Aceitar este documento";
          return (
            <section key={doc.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-black">{labels[doc.document_key] ?? doc.document_key}</h2>
                  <p className="mt-1 text-xs text-zinc-500">Versão: {doc.version}</p>
                </div>
                {accepted && <CheckCircle2 aria-label="Registrado" className="h-6 w-6 text-emerald-400" />}
              </div>
              <button type="button" className="text-sm font-bold text-primary underline"
                onClick={() => setExpanded((old) => ({ ...old, [doc.id]: !old[doc.id] }))}>
                {expanded[doc.id] ? "Recolher documento" : "Ler documento completo"}
              </button>
              {expanded[doc.id] && (
                <div className="mt-4 space-y-3">
                  <div className="max-h-[55dvh] overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black p-4 text-sm leading-6 text-zinc-300">{doc.content_text}</div>
                  <p className="break-all text-[11px] text-zinc-500">Identificador SHA-256: {doc.content_sha256}</p>
                </div>
              )}
              {accepted ? (
                <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300">
                  <FileCheck2 className="h-4 w-4" />
                  {doc.document_key === "privacy_notice" ? "Ciência registrada" : "Aceite registrado"}
                  {" em "}{new Date(accepted.occurred_at).toLocaleString("pt-BR")}.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  <label className="flex items-start gap-3 text-sm text-zinc-300">
                    <input type="checkbox" className="mt-1 accent-rose-600"
                      disabled={!expanded[doc.id] || Boolean(working)}
                      checked={Boolean(checked[doc.id])}
                      onChange={(event) => setChecked((old) => ({ ...old, [doc.id]: event.target.checked }))} />
                    Declaro que tive acesso ao texto desta versão do documento.
                  </label>
                  <button type="button" disabled={!checked[doc.id] || !expanded[doc.id] || Boolean(working)}
                    onClick={() => void confirm(doc)}
                    className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300">
                    {working === doc.id ? "Registrando..." : actionLabel}
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}
