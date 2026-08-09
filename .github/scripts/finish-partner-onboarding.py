from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor missing")
    return text.replace(old, new, 1)


courier_path = Path("src/routes/courier.tsx")
courier = courier_path.read_text(encoding="utf-8")

courier = replace_once(
    courier,
    '''function CourierApplication({ user, busy, onSubmit, onBack }: any) {
  return (''',
    '''function CourierApplication({ user, busy, onSubmit, onBack }: any) {
  const [vehicleType, setVehicleType] = useState("moto");
  const motorized = vehicleType === "moto" || vehicleType === "carro";

  return (''',
    "CourierApplication state",
)

courier = replace_once(
    courier,
    '''        <select
          name="vehicleType"
          required
          className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-sm"
        >''',
    '''        <select
          name="vehicleType"
          required
          value={vehicleType}
          onChange={(event) => setVehicleType(event.target.value)}
          className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-sm"
        >''',
    "vehicle selector",
)

courier = replace_once(
    courier,
    '''        <Input name="vehicleModel" placeholder="Modelo do veículo" required />
        <Input name="vehiclePlate" placeholder="Placa do veículo" />
        <Input name="cnh" placeholder="Número da CNH" inputMode="numeric" />
        <p className="text-xs text-zinc-600">Conta: {user?.email}</p>''',
    '''        <Input name="vehicleModel" placeholder="Modelo do veículo" required />
        {motorized ? (
          <>
            <Input
              name="vehiclePlate"
              placeholder="Placa do veículo"
              required
              autoCapitalize="characters"
              maxLength={8}
            />
            <Input
              name="cnh"
              placeholder="Número da CNH (11 dígitos)"
              required
              inputMode="numeric"
              maxLength={14}
            />
            <p className="rounded-2xl border border-zinc-900 bg-zinc-950 p-3 text-xs text-zinc-500">
              Para moto ou carro, placa, CNH e documento do veículo serão validados antes da aprovação.
            </p>
          </>
        ) : (
          <p className="rounded-2xl border border-zinc-900 bg-zinc-950 p-3 text-xs text-zinc-500">
            Para bicicleta, CNH e documento do veículo não são exigidos. A foto do entregador continua obrigatória.
          </p>
        )}
        <p className="text-xs text-zinc-600">Conta: {user?.email}</p>''',
    "motorized application fields",
)

courier = replace_once(
    courier,
    '''  const required = [
    { type: "cnh", label: "CNH" },
    { type: "documento_veiculo", label: "Documento do veículo" },
    { type: "foto_perfil", label: "Foto do entregador" },
  ];''',
    '''  const required = [
    ...(courier.vehicle_type === "bicicleta"
      ? []
      : [
          { type: "cnh", label: "CNH" },
          { type: "documento_veiculo", label: "Documento do veículo" },
        ]),
    { type: "foto_perfil", label: "Foto do entregador" },
  ];''',
    "courier document requirements",
)

courier_path.write_text(courier, encoding="utf-8")

# Keep the migration ledger convergent with the production migration that was already applied.
doc_path = Path("supabase/MIGRATION_RECONCILIATION.md")
doc = doc_path.read_text(encoding="utf-8")
ledger_anchor = "- `20260809213849` — `harden_rpc_and_core_table_privileges`\n"
ledger_line = "- `20260809215048` — `enforce_partner_approval_requirements`\n"
if ledger_line not in doc:
    doc = replace_once(doc, ledger_anchor, ledger_anchor + ledger_line, "partner migration ledger")

if "| `20260809215048` |" not in doc:
    lines = doc.splitlines()
    table_line = "| `20260809215048` | `enforce_partner_approval_requirements` | 9683 | `a6eac3e426d0b98a9c8e29afc65b9fdaf5ec00aa0478dc14bd465356edd71503` |"
    for index, line in enumerate(lines):
        if line.startswith("| `20260809213849` |"):
            lines.insert(index + 1, table_line)
            break
    else:
        raise SystemExit("partner migration hash anchor missing")
    doc = "\n".join(lines) + "\n"

doc_path.write_text(doc, encoding="utf-8")
