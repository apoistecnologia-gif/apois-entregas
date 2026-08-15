import fs from "node:fs";

const path = "src/routes/admin.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Patch marker not found: ${label}`);
  source = source.replace(search, replacement);
}

replaceOnce(
  '  const [auditLogs, setAuditLogs] = useState<any[]>([]);',
  '  const [auditLogs, setAuditLogs] = useState<any[]>([]);\n  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);',
  "selectedMerchantId state",
);

replaceOnce(
  '  const rolesByUser = useMemo(() => {\n    const map = new Map<string, string[]>();',
  '  const selectedMerchant = useMemo(\n    () => merchants.find((item) => item.id === selectedMerchantId) ?? null,\n    [merchants, selectedMerchantId],\n  );\n  const rolesByUser = useMemo(() => {\n    const map = new Map<string, string[]>();',
  "selectedMerchant memo",
);

const oldMerchantPanel = `      {activeTab === "merchants" && (\n        <div className="space-y-4">\n          {merchants.map((merchant) => (\n            <ApplicationCard\n              key={merchant.id}\n              kind="merchant"\n              item={merchant}\n              profile={profileById.get(merchant.owner_user_id)}\n              busy={busy === \`merchant:\${merchant.id}\`}\n              onReview={reviewMerchant}\n              onDocument={reviewDocument}\n              onOpenDocument={openDocument}\n            />\n          ))}\n          {merchants.length === 0 ? (\n            <EmptyState\n              title="Nenhum estabelecimento"\n              description="Cadastros de estabelecimentos aparecerão aqui."\n            />\n          ) : null}\n        </div>\n      )}`;

const newMerchantPanel = `      {activeTab === "merchants" && (\n        selectedMerchant ? (\n          <MerchantApplicationDetails\n            merchant={selectedMerchant}\n            profile={profileById.get(selectedMerchant.owner_user_id)}\n            busyKey={busy}\n            onBack={() => setSelectedMerchantId(null)}\n            onReview={reviewMerchant}\n            onDocument={reviewDocument}\n          />\n        ) : (\n          <div className="space-y-4">\n            {merchants.map((merchant) => (\n              <ApplicationCard\n                key={merchant.id}\n                kind="merchant"\n                item={merchant}\n                profile={profileById.get(merchant.owner_user_id)}\n                busy={busy === \`merchant:\${merchant.id}\`}\n                onReview={reviewMerchant}\n                onDocument={reviewDocument}\n                onOpenDocument={openDocument}\n                onOpenDetails={() => setSelectedMerchantId(merchant.id)}\n              />\n            ))}\n            {merchants.length === 0 ? (\n              <EmptyState\n                title="Nenhum estabelecimento"\n                description="Cadastros de estabelecimentos aparecerão aqui."\n              />\n            ) : null}\n          </div>\n        )\n      )}`;
replaceOnce(oldMerchantPanel, newMerchantPanel, "merchant panel");

replaceOnce(
  'function ApplicationCard({ kind, item, profile, busy, onReview, onDocument, onOpenDocument }: any) {',
  'function ApplicationCard({ kind, item, profile, busy, onReview, onDocument, onOpenDocument, onOpenDetails }: any) {',
  "ApplicationCard signature",
);

replaceOnce(
  '        <div className="flex flex-wrap gap-2">\n          <Button\n            type="button"\n            size="sm"\n            disabled={busy || !approvalReady}',
  '        <div className="flex flex-wrap gap-2">\n          {isMerchant && onOpenDetails ? (\n            <Button\n              type="button"\n              size="sm"\n              variant="outline"\n              className="border-primary/30 text-primary"\n              onClick={onOpenDetails}\n            >\n              Ver cadastro completo\n            </Button>\n          ) : null}\n          <Button\n            type="button"\n            size="sm"\n            disabled={busy || !approvalReady}',
  "details button",
);

const insertMarker = '\nfunction AdminReportsPanel({ orders, refunds, payouts }: any) {';
if (!source.includes(insertMarker)) throw new Error("Patch marker not found: AdminReportsPanel");

const detailsComponent = String.raw`

function MerchantApplicationDetails({ merchant, profile, busyKey, onBack, onReview, onDocument }: any) {
  const [preview, setPreview] = useState<{ url: string; doc: any } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const docs = merchant.merchant_documents ?? [];
  const requiredDocumentTypes = ["documento_empresa", "responsavel", "comprovante_endereco"];
  const missingDocuments = requiredDocumentTypes.filter(
    (type) => !docs.some((doc: any) => doc.document_type === type && doc.status === "approved"),
  );
  const approvalReady = missingDocuments.length === 0;
  const merchantBusy = busyKey === \`merchant:\${merchant.id}\`;

  const showDocument = async (doc: any) => {
    setPreviewing(doc.id);
    const { data, error } = await supabase.storage
      .from("merchant-documents")
      .createSignedUrl(doc.storage_path, 600);
    setPreviewing(null);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível carregar este documento.");
      return;
    }
    setPreview({ url: data.signedUrl, doc });
  };

  const field = (label: string, value: unknown) => (
    <div className="rounded-xl border border-zinc-900 bg-black p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-zinc-200">{String(value || "Não informado")}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="mb-2 text-sm font-bold text-primary">
            ← Voltar para estabelecimentos
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-black">{merchant.name}</h2>
            <Status value={merchant.approval_status} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">Revisão completa antes da aprovação do parceiro.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={merchantBusy || !approvalReady}
            title={approvalReady ? "Aprovar estabelecimento" : "Aprove primeiro todos os documentos obrigatórios."}
            onClick={() => void onReview(merchant.id, "approved")}
          >
            Aprovar estabelecimento
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={merchantBusy}
            onClick={() => void onReview(merchant.id, "rejected")}
            className="border-red-500/30 text-red-400"
          >
            Recusar cadastro
          </Button>
        </div>
      </div>

      {!approvalReady ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          Aprovação bloqueada até revisar: {missingDocuments.map((type) => type.replaceAll("_", " ")).join(", ")}.
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          Todos os documentos obrigatórios estão aprovados. O cadastro pode ser aprovado após a conferência dos dados abaixo.
        </div>
      )}

      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <h3 className="text-lg font-black">Dados do estabelecimento</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {field("Nome fantasia", merchant.name)}
          {field("Razão social", merchant.legal_name)}
          {field("CNPJ / MEI", merchant.document)}
          {field("Categoria", merchant.merchant_categories?.name)}
          {field("Telefone", merchant.contact_phone)}
          {field("E-mail", merchant.contact_email)}
          {field("Responsável", profile?.full_name)}
          {field("Telefone do responsável", profile?.phone)}
          {field("Cadastrado em", dateTime(merchant.created_at))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <h3 className="text-lg font-black">Endereço e localização</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {field("Endereço", merchant.address_line)}
          {field("Bairro", merchant.neighborhood)}
          {field("Cidade / UF", [merchant.city, merchant.state].filter(Boolean).join(" / "))}
          {field("Latitude", merchant.latitude)}
          {field("Longitude", merchant.longitude)}
          {field("ID do estabelecimento", merchant.id)}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <div>
          <h3 className="text-lg font-black">Documentos para conferência</h3>
          <p className="mt-1 text-sm text-zinc-500">Abra cada documento em tamanho maior e aprove ou recuse individualmente.</p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {docs.map((doc: any) => {
            const docBusy = busyKey === \`doc:\${doc.id}\`;
            return (
              <div key={doc.id} className="rounded-2xl border border-zinc-800 bg-black p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-black capitalize">{doc.document_type.replaceAll("_", " ")}</p>
                    <div className="mt-2"><Status value={doc.status} /></div>
                  </div>
                  <FileCheck2 className="h-5 w-5 text-zinc-600" />
                </div>
                {doc.rejection_reason ? <p className="mt-3 text-sm text-red-300">{doc.rejection_reason}</p> : null}
                <div className="mt-4 grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-zinc-700"
                    disabled={previewing === doc.id}
                    onClick={() => void showDocument(doc)}
                  >
                    {previewing === doc.id ? "Carregando..." : "Visualizar documento"}
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      disabled={docBusy || doc.status === "approved"}
                      onClick={() => void onDocument("merchant", doc.id, "approved")}
                      className="bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      Aprovar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={docBusy}
                      onClick={() => void onDocument("merchant", doc.id, "rejected")}
                      className="border-red-500/30 text-red-400"
                    >
                      Recusar
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {preview ? (
        <section className="rounded-2xl border border-primary/30 bg-zinc-950 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-black capitalize">{preview.doc.document_type.replaceAll("_", " ")}</p>
              <p className="text-xs text-zinc-500">Visualização ampliada para conferência.</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => window.open(preview.url, "_blank", "noopener,noreferrer")}>
                Abrir em nova aba
              </Button>
              <Button type="button" variant="outline" onClick={() => setPreview(null)}>Fechar</Button>
            </div>
          </div>
          {String(preview.doc.storage_path).toLowerCase().endsWith(".pdf") ? (
            <iframe title="Documento do estabelecimento" src={preview.url} className="h-[70vh] w-full rounded-xl border border-zinc-800 bg-white" />
          ) : (
            <div className="grid min-h-[420px] place-items-center overflow-auto rounded-xl border border-zinc-800 bg-black p-3">
              <img src={preview.url} alt="Documento do estabelecimento" className="max-h-[70vh] max-w-full object-contain" />
            </div>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              disabled={busyKey === \`doc:\${preview.doc.id}\` || preview.doc.status === "approved"}
              onClick={() => void onDocument("merchant", preview.doc.id, "approved")}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              Aprovar este documento
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busyKey === \`doc:\${preview.doc.id}\`}
              onClick={() => void onDocument("merchant", preview.doc.id, "rejected")}
              className="border-red-500/30 text-red-400"
            >
              Recusar este documento
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
`;

source = source.replace(insertMarker, detailsComponent + insertMarker);
fs.writeFileSync(path, source);
console.log("Admin partner review UI patch applied.");
