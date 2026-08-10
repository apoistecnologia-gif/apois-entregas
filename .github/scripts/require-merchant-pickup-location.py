from pathlib import Path

path = Path("src/routes/merchant.tsx")
text = path.read_text(encoding="utf-8")

replacements = [
    (
'''        onResubmit={resubmitApplication}
        onRefresh={() => void loadAll(true)}''',
'''        onResubmit={resubmitApplication}
        onCaptureLocation={captureMerchantLocation}
        onRefresh={() => void loadAll(true)}'''
    ),
    (
'''  onUpload,
  onResubmit,
  onRefresh,''',
'''  onUpload,
  onResubmit,
  onCaptureLocation,
  onRefresh,'''
    ),
]

for old, new in replacements:
    if text.count(old) != 1:
        raise SystemExit(f"expected exactly one target, found {text.count(old)}: {old!r}")
    text = text.replace(old, new, 1)

review_anchor = '''          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {requiredDocs.map((item) => {'''
review_panel = '''          <div className={`mt-6 rounded-2xl border p-4 ${
            merchant.latitude != null && merchant.longitude != null
              ? "border-emerald-500/20 bg-emerald-500/5"
              : "border-primary/30 bg-primary/5"
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black">Localização exata da loja</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {merchant.latitude != null && merchant.longitude != null
                    ? "Localização registrada. Ela será usada para validar a entrega e encontrar entregadores próximos."
                    : "Obrigatória antes da aprovação para calcular a área de entrega e a retirada do entregador."}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busyAction === "merchant-location"}
                onClick={() => void onCaptureLocation()}
                className="border-zinc-800 bg-black"
              >
                {busyAction === "merchant-location" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {merchant.latitude != null && merchant.longitude != null
                  ? "Atualizar localização"
                  : "Capturar localização"}
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {requiredDocs.map((item) => {'''
if text.count(review_anchor) != 1:
    raise SystemExit(f"expected review docs anchor once, found {text.count(review_anchor)}")
text = text.replace(review_anchor, review_panel, 1)

approved_anchor = '''      {activeTab === "dashboard" && ('''
approved_panel = '''      {merchant.latitude == null || merchant.longitude == null ? (
        <section className="mb-5 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-black text-primary">Localização da loja pendente</p>
              <p className="mt-1 text-sm text-zinc-400">
                Registre a posição exata para habilitar cálculos seguros de entrega e despacho por proximidade.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => void captureMerchantLocation()}
              disabled={busyAction === "merchant-location"}
            >
              {busyAction === "merchant-location" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Capturar localização
            </Button>
          </div>
        </section>
      ) : null}

      {activeTab === "dashboard" && ('''
if text.count(approved_anchor) != 1:
    raise SystemExit(f"expected approved dashboard anchor once, found {text.count(approved_anchor)}")
text = text.replace(approved_anchor, approved_panel, 1)

path.write_text(text, encoding="utf-8")
