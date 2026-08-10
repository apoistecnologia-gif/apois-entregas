from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one occurrence, found {count}")
    return text.replace(old, new, 1)

checkout_path = Path("src/routes/checkout.tsx")
checkout = checkout_path.read_text(encoding="utf-8")

checkout = replace_once(
    checkout,
    '  const [merchantConfig, setMerchantConfig] = useState<MerchantCheckoutConfig | null>(null);\n  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);',
    '  const [merchantConfig, setMerchantConfig] = useState<MerchantCheckoutConfig | null>(null);\n  const [serviceFee, setServiceFee] = useState(0);\n  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);',
    "checkout service fee state",
)

checkout = replace_once(
    checkout,
    '''  }, [merchant?.id]);\n\n  useEffect(() => {\n    if (fulfillmentType !== "delivery") {''',
    '''  }, [merchant?.id]);\n\n  useEffect(() => {\n    if (!merchant?.id) {\n      setServiceFee(0);\n      return;\n    }\n\n    let disposed = false;\n    const loadServiceFee = async () => {\n      const { data, error } = await (supabase.rpc as any)("preview_checkout_fee", {\n        p_merchant_id: merchant.id,\n      });\n      if (disposed) return;\n      if (error) {\n        console.error("Erro ao carregar taxa de serviço:", error);\n        setServiceFee(0);\n        return;\n      }\n      const value = Number(data ?? 0);\n      setServiceFee(Number.isFinite(value) && value >= 0 ? value : 0);\n    };\n\n    void loadServiceFee();\n    return () => {\n      disposed = true;\n    };\n  }, [merchant?.id]);\n\n  useEffect(() => {\n    if (fulfillmentType !== "delivery") {''',
    "checkout service fee effect",
)

checkout = replace_once(
    checkout,
    '  const total = Math.max(0, subtotal + deliveryFee - discount);',
    '  const total = Math.max(0, subtotal + deliveryFee + serviceFee - discount);',
    "checkout total",
)

checkout = replace_once(
    checkout,
    '''          <div className="flex justify-between">\n            <span>{fulfillmentType === "delivery" ? "Taxa de entrega" : "Retirada"}</span>\n            <span>R$ {deliveryFee.toFixed(2).replace(".", ",")}</span>\n          </div>''',
    '''          <div className="flex justify-between">\n            <span>{fulfillmentType === "delivery" ? "Taxa de entrega" : "Retirada"}</span>\n            <span>R$ {deliveryFee.toFixed(2).replace(".", ",")}</span>\n          </div>\n          {serviceFee > 0 ? (\n            <div className="flex justify-between">\n              <span>Taxa de serviço</span>\n              <span>R$ {serviceFee.toFixed(2).replace(".", ",")}</span>\n            </div>\n          ) : null}''',
    "checkout service fee display",
)

checkout = replace_once(
    checkout,
    ''': deliveryQuote?.reason === "coordinates_required"\n                        ? "Atualize este endereço pelo mapa para validar a área de entrega."\n                        : "Não foi possível validar a área de entrega agora."''',
    ''': deliveryQuote?.reason === "merchant_location_required"\n                        ? "O estabelecimento precisa confirmar a localização da loja antes de liberar entregas."\n                        : deliveryQuote?.reason === "coordinates_required"\n                          ? "Atualize este endereço pelo mapa para validar a área de entrega."\n                          : "Não foi possível validar a área de entrega agora."''',
    "checkout merchant location message",
)

checkout_path.write_text(checkout, encoding="utf-8")

admin_path = Path("src/routes/admin.tsx")
admin = admin_path.read_text(encoding="utf-8")

create_handlers = '''  const createFeeRule = async () => {\n    if (cities.length === 0) {\n      toast.error("Cadastre uma cidade antes de criar uma regra financeira.");\n      return;\n    }\n\n    const suggestedCity = cities.find((city) => city.is_active) ?? cities[0];\n    const cityInput = window\n      .prompt(\n        "Cidade da regra (Nome/UF):",\n        `${suggestedCity.name}/${suggestedCity.state}`,\n      )\n      ?.trim();\n    if (!cityInput) return;\n    const normalized = cityInput.toLocaleLowerCase("pt-BR").replaceAll(" ", "");\n    const city = cities.find(\n      (item) =>\n        `${item.name}/${item.state}`.toLocaleLowerCase("pt-BR").replaceAll(" ", "") === normalized,\n    );\n    if (!city) {\n      toast.error("Cidade não encontrada. Use o formato Nome/UF exibido no painel.");\n      return;\n    }\n\n    const name = window.prompt("Nome da regra:", `Regra ${city.name}/${city.state}`)?.trim();\n    if (!name) return;\n    const commissionRaw = window.prompt("Comissão do estabelecimento (%):", "0");\n    if (commissionRaw === null) return;\n    const courierBaseRaw = window.prompt("Base do entregador (R$):", "0");\n    if (courierBaseRaw === null) return;\n    const perKmRaw = window.prompt("Valor por km do entregador (R$):", "0");\n    if (perKmRaw === null) return;\n    const minimumRaw = window.prompt("Ganho mínimo do entregador (R$):", "0");\n    if (minimumRaw === null) return;\n    const customerFeeRaw = window.prompt("Taxa de serviço do cliente (R$):", "0");\n    if (customerFeeRaw === null) return;\n\n    const values = {\n      commission: Number(commissionRaw.replace(",", ".")),\n      courierBase: Number(courierBaseRaw.replace(",", ".")),\n      perKm: Number(perKmRaw.replace(",", ".")),\n      minimum: Number(minimumRaw.replace(",", ".")),\n      customerFee: Number(customerFeeRaw.replace(",", ".")),\n    };\n    if (\n      !Number.isFinite(values.commission) ||\n      values.commission < 0 ||\n      values.commission > 100 ||\n      !Number.isFinite(values.courierBase) ||\n      values.courierBase < 0 ||\n      !Number.isFinite(values.perKm) ||\n      values.perKm < 0 ||\n      !Number.isFinite(values.minimum) ||\n      values.minimum < 0 ||\n      !Number.isFinite(values.customerFee) ||\n      values.customerFee < 0\n    ) {\n      toast.error("Revise os valores da regra financeira.");\n      return;\n    }\n\n    setBusy("fee:new");\n    const { error } = await rpc("admin_create_fee_rule", {\n      _name: name,\n      _city_id: city.id,\n      _merchant_id: null,\n      _merchant_commission_percent: values.commission,\n      _courier_base_fee: values.courierBase,\n      _courier_per_km: values.perKm,\n      _courier_minimum_fee: values.minimum,\n      _customer_service_fee: values.customerFee,\n    });\n    setBusy(null);\n    if (error) return toast.error(error.message);\n    toast.success("Regra financeira criada e auditada.");\n    await loadAll(true);\n  };\n\n  const toggleFeeRule = async (rule: any) => {\n    setBusy(`fee:${rule.id}`);\n    const { error } = await rpc("admin_set_fee_rule_active", {\n      _fee_rule_id: rule.id,\n      _is_active: !rule.is_active,\n    });\n    setBusy(null);\n    if (error) return toast.error(error.message);\n    toast.success(rule.is_active ? "Regra financeira desativada." : "Regra financeira ativada.");\n    await loadAll(true);\n  };\n\n'''

admin = replace_once(
    admin,
    '  const editFeeRule = async (rule: any) => {',
    create_handlers + '  const editFeeRule = async (rule: any) => {',
    "admin fee handlers",
)

admin = replace_once(
    admin,
    '''          onToggleCity={toggleCity}\n          onEditFee={editFeeRule}\n          onEditSetting={editSetting}''',
    '''          onToggleCity={toggleCity}\n          onCreateFee={createFeeRule}\n          onEditFee={editFeeRule}\n          onToggleFee={toggleFeeRule}\n          onEditSetting={editSetting}''',
    "admin operation panel props",
)

admin = replace_once(
    admin,
    '''  onToggleCity,\n  onEditFee,\n  onEditSetting,''',
    '''  onToggleCity,\n  onCreateFee,\n  onEditFee,\n  onToggleFee,\n  onEditSetting,''',
    "admin operation panel signature",
)

admin = replace_once(
    admin,
    '''        <div className="flex items-center gap-2">\n          <CircleDollarSign className="h-5 w-5 text-primary" />\n          <h2 className="font-black">Regras financeiras</h2>\n        </div>\n        <div className="mt-4 space-y-2">\n          {feeRules.map((rule: any) => (\n            <button\n              type="button"\n              onClick={() => void onEditFee(rule)}\n              disabled={busy === `fee:${rule.id}`}\n              key={rule.id}\n              className="w-full rounded-xl bg-black p-3 text-left disabled:opacity-50"\n            >\n              <div className="flex justify-between">\n                <b>{rule.name}</b>\n                <Status value={rule.is_active ? "active" : "inactive"} />\n              </div>\n              <p className="mt-1 text-xs text-zinc-500">\n                Comissão {rule.merchant_commission_percent}% · entregador{" "}\n                {money(rule.courier_base_fee)} + {money(rule.courier_per_km)}/km\n              </p>\n            </button>\n          ))}\n        </div>''',
    '''        <div className="flex flex-wrap items-center justify-between gap-3">\n          <div className="flex items-center gap-2">\n            <CircleDollarSign className="h-5 w-5 text-primary" />\n            <h2 className="font-black">Regras financeiras</h2>\n          </div>\n          <Button\n            type="button"\n            size="sm"\n            onClick={() => void onCreateFee()}\n            disabled={busy === "fee:new"}\n          >\n            {busy === "fee:new" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}\n            Nova regra\n          </Button>\n        </div>\n        <div className="mt-4 space-y-2">\n          {feeRules.map((rule: any) => (\n            <div key={rule.id} className="rounded-xl bg-black p-3">\n              <div className="flex flex-wrap items-start justify-between gap-3">\n                <div>\n                  <b>{rule.name}</b>\n                  <p className="mt-1 text-xs text-zinc-500">\n                    Comissão {rule.merchant_commission_percent}% · entregador{" "}\n                    {money(rule.courier_base_fee)} + {money(rule.courier_per_km)}/km · mínimo{" "}\n                    {money(rule.courier_minimum_fee)} · serviço {money(rule.customer_service_fee)}\n                  </p>\n                </div>\n                <Status value={rule.is_active ? "active" : "inactive"} />\n              </div>\n              <div className="mt-3 flex flex-wrap gap-2">\n                <Button\n                  type="button"\n                  size="sm"\n                  variant="outline"\n                  onClick={() => void onEditFee(rule)}\n                  disabled={busy === `fee:${rule.id}`}\n                  className="border-zinc-800"\n                >\n                  Editar valores\n                </Button>\n                <Button\n                  type="button"\n                  size="sm"\n                  variant="outline"\n                  onClick={() => void onToggleFee(rule)}\n                  disabled={busy === `fee:${rule.id}`}\n                  className={rule.is_active ? "border-red-500/20 text-red-400" : "border-emerald-500/20 text-emerald-400"}\n                >\n                  {rule.is_active ? "Desativar" : "Ativar"}\n                </Button>\n              </div>\n            </div>\n          ))}\n          {feeRules.length === 0 ? (\n            <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">\n              Nenhuma regra financeira criada. Sem regra ativa, a plataforma usa a taxa de entrega da loja e não cobra taxa de serviço/comissão.\n            </div>\n          ) : null}\n        </div>''',
    "admin fee rule panel",
)

admin_path.write_text(admin, encoding="utf-8")
