from pathlib import Path

path = Path("supabase/MIGRATION_RECONCILIATION.md")
text = path.read_text(encoding="utf-8")

ledger_anchor = "- `20260809220123` — `persist_legal_acceptance_audit`\n"
ledger_lines = (
    "- `20260809221841` — `enforce_delivery_quote_in_order_creation`\n"
    "- `20260809222108` — `fix_pickup_delivery_quote_state`\n"
)
if "20260809221841" not in text:
    if ledger_anchor not in text:
        raise SystemExit("migration ledger anchor missing")
    text = text.replace(ledger_anchor, ledger_anchor + ledger_lines, 1)

if "| `20260809221841` |" not in text:
    lines = text.splitlines()
    insert_at = None
    for index, line in enumerate(lines):
        if line.startswith("| `20260809220123` |"):
            insert_at = index + 1
            break
    if insert_at is None:
        raise SystemExit("migration hash anchor missing")
    rows = [
        "| `20260809221841` | `enforce_delivery_quote_in_order_creation` | 6841 | `b614b6e1718693532309699991310c1ea4a0bda4d7df5525e4e944e6262e9999` |",
        "| `20260809222108` | `fix_pickup_delivery_quote_state` | 7090 | `6b3f0f4d46befb832bb728f7f6e117b26ad849df2971904c46ee2e939767327b` |",
    ]
    lines[insert_at:insert_at] = rows
    text = "\n".join(lines) + "\n"

path.write_text(text, encoding="utf-8")
