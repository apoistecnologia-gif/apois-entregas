from pathlib import Path

path = Path("src/components/MerchantGrowthPanels.tsx")
text = path.read_text(encoding="utf-8")

replacements = {
    "  customer_id?: string | null;": "  customer_user_id?: string | null;",
    "      const customerId = order.customer_id;": "      const customerId = order.customer_user_id;",
}

for old, new in replacements.items():
    if text.count(old) != 1:
        raise SystemExit(f"expected exactly one occurrence of {old!r}, found {text.count(old)}")
    text = text.replace(old, new, 1)

if "order.customer_id" in text or "customer_id?:" in text:
    raise SystemExit("legacy customer_id reference still present in merchant customer panel")

path.write_text(text, encoding="utf-8")
