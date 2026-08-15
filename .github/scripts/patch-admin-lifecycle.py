from pathlib import Path

path = Path("src/routes/admin.tsx")
text = path.read_text(encoding="utf-8")
changed = text

repairs = {
    r"busyKey === \`merchant:\${merchant.id}\`": "busyKey === `merchant:${merchant.id}`",
    r"busyKey === \`doc:\${doc.id}\`": "busyKey === `doc:${doc.id}`",
    r"busyKey === \`doc:\${preview.doc.id}\`": "busyKey === `doc:${preview.doc.id}`",
}
for broken, fixed in repairs.items():
    changed = changed.replace(broken, fixed)

old = '  const reviewCourier = async (courierId: string, status: "approved" | "rejected" | "blocked") => {'
lifecycle = '''  const suspendMerchant = async (merchantId: string, suspended: boolean) => {
    const reason = suspended ? window.prompt("Motivo da suspensão:")?.trim() : null;
    if (suspended && !reason) return;
    setBusy(`merchant:${merchantId}`);
    const { error } = await rpc("admin_suspend_merchant", {
      _merchant_id: merchantId,
      _suspended: suspended,
      _reason: reason,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(suspended ? "Estabelecimento suspenso." : "Estabelecimento reativado.");
    await loadAll(true);
  };

  const deleteMerchant = async (merchantId: string, merchantName: string) => {
    const confirmed = window.confirm(
      `Excluir definitivamente ${merchantName}? Esta ação só será permitida se não houver histórico de pedidos.`,
    );
    if (!confirmed) return;
    const typed = window.prompt(`Digite EXCLUIR para confirmar a exclusão de ${merchantName}:`)?.trim();
    if (typed !== "EXCLUIR") {
      toast.error("Exclusão cancelada: confirmação inválida.");
      return;
    }
    setBusy(`merchant:${merchantId}`);
    const { error } = await rpc("admin_delete_merchant", { _merchant_id: merchantId });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Estabelecimento excluído.");
    if (selectedMerchantId === merchantId) setSelectedMerchantId(null);
    await loadAll(true);
  };

  const reviewCourier = async (courierId: string, status: "approved" | "rejected" | "blocked") => {'''
if old in changed and "const suspendMerchant = async" not in changed:
    changed = changed.replace(old, lifecycle, 1)

changed = changed.replace(
'''            onReview={reviewMerchant}
            onDocument={reviewDocument}
          />''',
'''            onReview={reviewMerchant}
            onSuspend={suspendMerchant}
            onDelete={deleteMerchant}
            onDocument={reviewDocument}
          />''',
1,
)

changed = changed.replace(
'''                onReview={reviewMerchant}
                onDocument={reviewDocument}
                onOpenDocument={openDocument}''',
'''                onReview={reviewMerchant}
                onSuspend={suspendMerchant}
                onDelete={deleteMerchant}
                onDocument={reviewDocument}
                onOpenDocument={openDocument}''',
1,
)

changed = changed.replace(
    "function ApplicationCard({ kind, item, profile, busy, onReview, onDocument, onOpenDocument, onOpenDetails }: any) {",
    "function ApplicationCard({ kind, item, profile, busy, onReview, onSuspend, onDelete, onDocument, onOpenDocument, onOpenDetails }: any) {",
    1,
)

old_buttons = '''          <Button
            type="button"
            size="sm"
            disabled={busy || !approvalReady}
            title={
              approvalReady
                ? "Aprovar parceiro"
                : "Aprove primeiro todos os documentos e dados obrigatórios."
            }
            onClick={() => void onReview(item.id, "approved")}
          >
            Aprovar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void onReview(item.id, "rejected")}
            className="border-red-500/20 text-red-400"
          >
            Reprovar
          </Button>
          {status === "approved" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void onReview(item.id, "blocked")}
              className="border-zinc-800"
            >
              Bloquear
            </Button>
          ) : null}'''
new_buttons = '''          <Button
            type="button"
            size="sm"
            disabled={busy || !approvalReady || status === "approved"}
            title={
              status === "approved"
                ? "Estabelecimento já aprovado"
                : approvalReady
                  ? "Aprovar parceiro"
                  : "Aprove primeiro todos os documentos e dados obrigatórios."
            }
            onClick={() => void onReview(item.id, "approved")}
          >
            {status === "approved" ? "Aprovado" : "Aprovar"}
          </Button>
          {status !== "approved" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void onReview(item.id, "rejected")}
              className="border-red-500/20 text-red-400"
            >
              Reprovar
            </Button>
          ) : null}
          {isMerchant && status === "approved" ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void onSuspend(item.id, item.is_active)}
                className="border-amber-500/30 text-amber-300"
              >
                {item.is_active ? "Suspender" : "Reativar"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void onReview(item.id, "blocked")}
                className="border-red-500/30 text-red-400"
              >
                Bloquear
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void onDelete(item.id, title)}
                className="border-red-700/50 text-red-500"
              >
                Excluir
              </Button>
            </>
          ) : null}
          {!isMerchant && status === "approved" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void onReview(item.id, "blocked")}
              className="border-zinc-800"
            >
              Bloquear
            </Button>
          ) : null}'''
if old_buttons in changed:
    changed = changed.replace(old_buttons, new_buttons, 1)

changed = changed.replace(
    "function MerchantApplicationDetails({ merchant, profile, busyKey, onBack, onReview, onDocument }: any) {",
    "function MerchantApplicationDetails({ merchant, profile, busyKey, onBack, onReview, onSuspend, onDelete, onDocument }: any) {",
    1,
)

old_detail_buttons = '''          <Button
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
          </Button>'''
new_detail_buttons = '''          <Button
            type="button"
            disabled={merchantBusy || !approvalReady || merchant.approval_status === "approved"}
            title={
              merchant.approval_status === "approved"
                ? "Estabelecimento já aprovado"
                : approvalReady
                  ? "Aprovar estabelecimento"
                  : "Aprove primeiro todos os documentos obrigatórios."
            }
            onClick={() => void onReview(merchant.id, "approved")}
          >
            {merchant.approval_status === "approved" ? "Estabelecimento aprovado" : "Aprovar estabelecimento"}
          </Button>
          {merchant.approval_status !== "approved" ? (
            <Button
              type="button"
              variant="outline"
              disabled={merchantBusy}
              onClick={() => void onReview(merchant.id, "rejected")}
              className="border-red-500/30 text-red-400"
            >
              Recusar cadastro
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={merchantBusy}
                onClick={() => void onSuspend(merchant.id, merchant.is_active)}
                className="border-amber-500/30 text-amber-300"
              >
                {merchant.is_active ? "Suspender" : "Reativar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={merchantBusy}
                onClick={() => void onReview(merchant.id, "blocked")}
                className="border-red-500/30 text-red-400"
              >
                Bloquear
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={merchantBusy}
                onClick={() => void onDelete(merchant.id, merchant.name)}
                className="border-red-700/50 text-red-500"
              >
                Excluir
              </Button>
            </>
          )}'''
if old_detail_buttons in changed:
    changed = changed.replace(old_detail_buttons, new_detail_buttons, 1)

if changed == text:
    raise SystemExit("merchant lifecycle patch did not change admin.tsx")
path.write_text(changed, encoding="utf-8")
print("APOIS_ADMIN_MERCHANT_LIFECYCLE_PATCH_APPLIED")
