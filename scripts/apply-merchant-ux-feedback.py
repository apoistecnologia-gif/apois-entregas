from pathlib import Path

# Idempotent merchant UX/type-safety validator used by the isolated production build.
path = Path("src/routes/merchant.tsx")
text = path.read_text(encoding="utf-8")

broken = '''    if (operationErrors.length > 0) {
      const [, area] = operationErrors[0];
      toast.error(`Não foi possível carregar ${area} do estabelecimento.`);
    }
'''
fixed = '''    const firstOperationError = operationErrors[0];
    if (firstOperationError) {
      const [, area] = firstOperationError;
      toast.error(`Não foi possível carregar ${area} do estabelecimento.`);
    }
'''

if broken in text:
    text = text.replace(broken, fixed, 1)
    path.write_text(text, encoding="utf-8")
    print("APOIS_MERCHANT_OPERATION_ERROR_GUARD_APPLIED")

required = [
    'const operationErrors = [',
    'const firstOperationError = operationErrors[0];',
    'if (firstOperationError) {',
    'setBusyAction(`product:${product.id}`)',
    'Produto pausado.',
    'Produto ativado.',
    'setBusyAction(`hours:${weekday}`)',
    'Não foi possível salvar o horário.',
]

current = path.read_text(encoding="utf-8")
missing = [marker for marker in required if marker not in current]
if missing:
    raise SystemExit(f"merchant UX feedback controls missing from merchant.tsx: {missing}")

print("APOIS_MERCHANT_UX_FEEDBACK_OK")
