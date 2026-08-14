from pathlib import Path

path = Path("src/routes/courier.tsx")
text = path.read_text(encoding="utf-8")

marker = "  const uploadDocument = async (documentType: string, file: File) => {"
if text.count(marker) != 1:
    raise SystemExit(f"uploadDocument marker count={text.count(marker)}")

resubmit = r'''  const resubmitApplication = async () => {
    if (!courier?.id || courier.status !== "rejected") return;
    const requiredTypes =
      courier.vehicle_type === "bicicleta"
        ? ["foto_perfil"]
        : ["cnh", "documento_veiculo", "foto_perfil"];
    const pendingCorrection = requiredTypes.some((documentType) => {
      const document = documents.find((row) => row.document_type === documentType);
      return !document || !["pending", "approved"].includes(document.status);
    });
    if (pendingCorrection) {
      toast.error("Substitua todos os documentos recusados antes de reenviar o cadastro.");
      return;
    }

    const address = courier.address ?? {};
    setBusy("application");
    const { error } = await rpc("submit_courier_application", {
      _payload: {
        cpf: courier.cpf ?? "",
        birth_date: courier.birth_date ?? "",
        address: {
          street: address.street ?? "",
          number: address.number ?? "",
          neighborhood: address.neighborhood ?? "",
          city: address.city ?? "",
          state: address.state ?? "",
        },
        vehicle_type: courier.vehicle_type ?? "moto",
        vehicle_model: courier.vehicle_model ?? "",
        vehicle_plate: courier.vehicle_plate ?? "",
        cnh_number: courier.cnh_number ?? "",
      },
    });
    setBusy(null);
    if (error) {
      toast.error(error.message || "Não foi possível reenviar o cadastro.");
      return;
    }
    toast.success("Cadastro reenviado para análise.");
    await loadAll(true);
  };

'''
text = text.replace(marker, resubmit + marker, 1)

validation_old = '''    if (!courier?.id || !user?.id) return;
    setBusy(`doc:${documentType}`);'''
validation_new = '''    if (!courier?.id || !user?.id) return;
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
    if (!allowedTypes.has(file.type)) {
      toast.error("Envie uma imagem JPG, PNG, WEBP ou um arquivo PDF.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("O documento deve ter no máximo 15 MB.");
      return;
    }
    setBusy(`doc:${documentType}`);'''
if text.count(validation_old) != 1:
    raise SystemExit(f"document validation marker count={text.count(validation_old)}")
text = text.replace(validation_old, validation_new, 1)

if text.count("onResubmit={submitApplication}") != 1:
    raise SystemExit("resubmit wiring marker not found exactly once")
text = text.replace("onResubmit={submitApplication}", "onResubmit={resubmitApplication}", 1)

start = text.find("function CourierReviewState(")
end = text.find("\nfunction OfferCard(", start)
if start < 0 or end < 0:
    raise SystemExit("CourierReviewState function boundaries not found")

review = r'''function CourierReviewState({
  courier,
  documents,
  busy,
  onUpload,
  onRefresh,
  refreshing,
  onLogout,
  onResubmit,
}: any) {
  const required = [
    ...(courier.vehicle_type === "bicicleta"
      ? []
      : [
          { type: "cnh", label: "CNH" },
          { type: "documento_veiculo", label: "Documento do veículo" },
        ]),
    { type: "foto_perfil", label: "Foto do entregador" },
  ];
  const blocked = courier.status === "blocked" || courier.is_active === false;
  const requiredReady = required.every((item) => {
    const document = documents.find((row: any) => row.document_type === item.type);
    return document && ["pending", "approved"].includes(document.status);
  });
  const canResubmit = courier.status === "rejected" && !blocked && requiredReady;

  const statusLabel = blocked
    ? "CONTA BLOQUEADA"
    : courier.status === "under_review"
      ? "EM ANÁLISE"
      : courier.status === "rejected"
        ? "CADASTRO RECUSADO"
        : courier.status === "pending"
          ? "CADASTRO PENDENTE"
          : courier.status === "approved"
            ? "APROVADO"
            : String(courier.status ?? "PENDENTE").replaceAll("_", " ");

  return (
    <div className="min-h-dvh bg-black p-4 text-white">
      <div className="flex items-center justify-between pt-3">
        <p className="font-black text-primary">APOIS ENTREGADOR</p>
        <button type="button" onClick={onLogout} className="text-sm font-bold text-red-400">
          Sair
        </button>
      </div>
      <div className="mt-8 rounded-3xl border border-zinc-900 bg-zinc-950 p-5">
        <FileCheck2 className="h-9 w-9 text-primary" />
        <p className="mt-4 text-xs font-black uppercase text-zinc-500">Situação</p>
        <h1
          className={`mt-1 text-2xl font-black uppercase ${blocked ? "text-red-400" : "text-primary"}`}
        >
          {statusLabel}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          {blocked
            ? "Seu acesso operacional está bloqueado. Os documentos ficam preservados e não podem ser substituídos enquanto o bloqueio estiver ativo."
            : courier.status === "rejected"
              ? "Corrija os documentos recusados abaixo. Quando todos estiverem enviados ou aprovados, reenvie o cadastro para uma nova análise."
              : "Os documentos são enviados automaticamente assim que você seleciona o arquivo. Depois do envio, seu cadastro permanece em análise até a aprovação da APOIS."}
        </p>
        {courier.rejection_reason ? (
          <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
            {courier.rejection_reason}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onRefresh}
          className="mt-4 flex items-center gap-2 text-sm font-bold text-zinc-400"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Atualizar situação
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {required.map((item) => {
          const doc = documents.find((row: any) => row.document_type === item.type);
          return (
            <label
              key={item.type}
              className="block rounded-2xl border border-zinc-900 bg-zinc-950 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{item.label}</span>
                <span
                  className={`text-[10px] font-black uppercase ${doc?.status === "approved" ? "text-emerald-400" : doc?.status === "rejected" ? "text-red-400" : "text-primary"}`}
                >
                  {doc?.status === "approved"
                    ? "APROVADO"
                    : doc?.status === "rejected"
                      ? "RECUSADO"
                      : doc?.status === "pending"
                        ? "ENVIADO"
                        : "NÃO ENVIADO"}
                </span>
              </div>
              {doc?.status === "pending" ? (
                <p className="mt-2 rounded-xl bg-primary/5 px-3 py-2 text-xs leading-relaxed text-zinc-400">
                  Arquivo enviado com sucesso e aguardando análise. Se precisar corrigir o documento,
                  você pode selecionar outro arquivo abaixo para substituí-lo.
                </p>
              ) : null}
              {doc?.rejection_reason ? (
                <p className="mt-2 text-xs text-red-300">{doc.rejection_reason}</p>
              ) : null}
              {!blocked && doc?.status !== "approved" ? (
                <>
                  <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                    <Upload className="h-4 w-4" />
                    {busy === `doc:${item.type}`
                      ? "Enviando arquivo..."
                      : doc
                        ? "Substituir arquivo"
                        : "Selecionar arquivo para envio automático"}
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="mt-2 w-full text-xs text-zinc-600"
                    disabled={busy === `doc:${item.type}`}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      const input = event.currentTarget;
                      if (file) {
                        void onUpload(item.type, file).finally(() => {
                          input.value = "";
                        });
                      }
                    }}
                  />
                </>
              ) : doc?.status === "approved" ? (
                <p className="mt-3 text-xs font-bold text-emerald-400">
                  Documento aprovado. Nenhuma ação necessária.
                </p>
              ) : (
                <p className="mt-3 text-xs font-bold text-amber-300">
                  Envio desativado enquanto a conta estiver bloqueada.
                </p>
              )}
            </label>
          );
        })}
      </div>
      {courier.status === "rejected" && !blocked ? (
        <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <button
            type="button"
            disabled={Boolean(busy) || !canResubmit}
            onClick={() => void onResubmit()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-black text-black disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {busy === "application" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            REENVIAR PARA ANÁLISE
          </button>
          <p className="mt-2 text-center text-[11px] leading-4 text-zinc-500">
            {canResubmit
              ? "Seus documentos estão prontos para uma nova revisão."
              : "Substitua todos os documentos recusados e envie os documentos que estiverem faltando."}
          </p>
        </div>
      ) : null}
      <p className="mt-5 text-center text-xs text-zinc-600">
        {blocked
          ? "Entre em contato com o suporte da APOIS para entender ou revisar o bloqueio."
          : "Após a aprovação, o botão Online e as ofertas de entrega serão liberados automaticamente."}
      </p>
    </div>
  );
}
'''

text = text[:start] + review + text[end:]
path.write_text(text, encoding="utf-8")
