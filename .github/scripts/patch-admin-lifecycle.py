from pathlib import Path

path = Path("src/routes/admin.tsx")
text = path.read_text(encoding="utf-8")

required = [
    'const suspendMerchant = async',
    'const deleteMerchant = async',
    'admin_suspend_merchant',
    'admin_delete_merchant',
    'Estabelecimento aprovado',
    'Suspender',
    'Reativar',
    'Bloquear',
    'Excluir',
]

missing = [marker for marker in required if marker not in text]
if missing:
    raise SystemExit(f"merchant lifecycle controls missing from admin.tsx: {missing}")

print("APOIS_ADMIN_MERCHANT_LIFECYCLE_OK")
