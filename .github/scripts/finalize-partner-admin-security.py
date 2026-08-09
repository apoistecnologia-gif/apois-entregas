from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor missing")
    return text.replace(old, new, 1)


admin_path = Path("src/routes/admin.tsx")
admin = admin_path.read_text(encoding="utf-8")
admin = replace_once(
    admin,
    '''  const docs = isMerchant ? (item.merchant_documents ?? []) : (item.courier_documents ?? []);
  const title = isMerchant ? item.name : profile?.full_name || `Entregador ${item.id.slice(0, 8)}`;
  return (''',
    '''  const docs = isMerchant ? (item.merchant_documents ?? []) : (item.courier_documents ?? []);
  const requiredDocumentTypes = isMerchant
    ? ["documento_empresa", "responsavel", "comprovante_endereco"]
    : item.vehicle_type === "bicicleta"
      ? ["foto_perfil"]
      : ["cnh", "documento_veiculo", "foto_perfil"];
  const missingDocuments = requiredDocumentTypes.filter(
    (type) => !docs.some((doc: any) => doc.document_type === type && doc.status === "approved"),
  );
  const identityReady =
    isMerchant ||
    item.vehicle_type === "bicicleta" ||
    (Boolean(item.vehicle_plate?.trim()) && Boolean(item.cnh_number?.trim()));
  const approvalReady = missingDocuments.length === 0 && identityReady;
  const title = isMerchant ? item.name : profile?.full_name || `Entregador ${item.id.slice(0, 8)}`;
  return (''',
    "partner approval readiness",
)
admin = replace_once(
    admin,
    '''          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void onReview(item.id, "approved")}
          >
            Aprovar
          </Button>''',
    '''          <Button
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
          </Button>''',
    "partner approve button",
)
admin = replace_once(
    admin,
    '''      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">''',
    '''      </div>
      {!approvalReady ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
          {missingDocuments.length > 0
            ? `Aprovação bloqueada: faltam documentos aprovados (${missingDocuments
                .map((type) => type.replaceAll("_", " "))
                .join(", ")}).`
            : "Aprovação bloqueada: complete placa e CNH do veículo antes de aprovar."}
        </div>
      ) : null}
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">''',
    "partner approval warning",
)
admin_path.write_text(admin, encoding="utf-8")

login_path = Path("src/routes/login.tsx")
login = login_path.read_text(encoding="utf-8")
login = replace_once(
    login,
    '''        const redirectPath = searchParams.get("redirect");

        if (redirectPath) {
          navigate({ to: redirectPath });
        } else {''',
    '''        const redirectPath = searchParams.get("redirect");
        const safeRedirectPath =
          redirectPath?.startsWith("/") && !redirectPath.startsWith("//") ? redirectPath : null;

        if (safeRedirectPath) {
          navigate({ to: safeRedirectPath });
        } else {''',
    "login redirect sanitization",
)
login_path.write_text(login, encoding="utf-8")

readme_path = Path("README.md")
readme = readme_path.read_text(encoding="utf-8")
if "VITE_GOOGLE_MAPS_MAP_ID=" not in readme:
    readme = replace_once(
        readme,
        "VITE_GOOGLE_MAPS_BROWSER_KEY=\n",
        "VITE_GOOGLE_MAPS_BROWSER_KEY=\nVITE_GOOGLE_MAPS_MAP_ID=\n",
        "README maps env",
    )
readme_path.write_text(readme, encoding="utf-8")

doc_path = Path("supabase/MIGRATION_RECONCILIATION.md")
doc = doc_path.read_text(encoding="utf-8")
ledger_anchor = "- `20260809215048` — `enforce_partner_approval_requirements`\n"
ledger_line = "- `20260809215700` — `harden_auth_trigger_search_path`\n"
if ledger_line not in doc:
    doc = replace_once(doc, ledger_anchor, ledger_anchor + ledger_line, "auth trigger migration ledger")
if "| `20260809215700` |" not in doc:
    lines = doc.splitlines()
    table_line = "| `20260809215700` | `harden_auth_trigger_search_path` | 699 | `b8036ea85d7519cf2561485dc419deee90c3b8424fef9370632fcd0899aac5d3` |"
    for index, line in enumerate(lines):
        if line.startswith("| `20260809215048` |"):
            lines.insert(index + 1, table_line)
            break
    else:
        raise SystemExit("auth trigger hash table anchor missing")
    doc = "\n".join(lines) + "\n"
doc_path.write_text(doc, encoding="utf-8")
