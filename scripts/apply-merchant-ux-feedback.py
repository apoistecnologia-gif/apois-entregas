from pathlib import Path

path = Path("src/routes/merchant.tsx")
text = path.read_text(encoding="utf-8")

required = [
    'const operationErrors = [',
    'setBusyAction(`product:${product.id}`)',
    'Produto pausado.',
    'Produto ativado.',
    'setBusyAction(`hours:${weekday}`)',
    'Não foi possível salvar o horário.',
]

missing = [marker for marker in required if marker not in text]
if missing:
    raise SystemExit(f"merchant UX feedback controls missing from merchant.tsx: {missing}")

print("APOIS_MERCHANT_UX_FEEDBACK_OK")
