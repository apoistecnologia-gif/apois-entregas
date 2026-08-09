from pathlib import Path

orders_path = Path("src/components/AdminOrdersPanel.tsx")
orders = orders_path.read_text(encoding="utf-8")
orders = orders.replace("  CreditCard,\n", "", 1).replace("  PackageSearch,\n", "", 1)
orders_path.write_text(orders, encoding="utf-8")

admin_path = Path("src/routes/admin.tsx")
admin = admin_path.read_text(encoding="utf-8")
import_anchor = 'import { AdminReviewsPanel } from "@/components/AdminReviewsPanel";\n'
order_import = 'import { AdminOrdersPanel } from "@/components/AdminOrdersPanel";\n'
if order_import not in admin:
    if import_anchor not in admin:
        raise SystemExit("AdminReviewsPanel import anchor missing")
    admin = admin.replace(import_anchor, import_anchor + order_import, 1)

start_marker = '      {activeTab === "orders" && (\n'
end_marker = '      {activeTab === "realtime" && <AdminRealtimeOperationsPanel />}\n'
start = admin.find(start_marker)
end = admin.find(end_marker, start)
if start == -1 or end == -1:
    raise SystemExit("admin orders render block anchors missing")
admin = admin[:start] + '      {activeTab === "orders" && <AdminOrdersPanel />}\n\n' + admin[end:]
admin_path.write_text(admin, encoding="utf-8")

doc_path = Path("supabase/MIGRATION_RECONCILIATION.md")
doc = doc_path.read_text(encoding="utf-8")
ledger_anchor = "- `20260809212129` — `allow_customer_active_courier_tracking`\n"
ledger_line = "- `20260809213849` — `harden_rpc_and_core_table_privileges`\n"
if ledger_line not in doc:
    if ledger_anchor not in doc:
        raise SystemExit("migration ledger anchor missing")
    doc = doc.replace(ledger_anchor, ledger_anchor + ledger_line, 1)

table_anchor = "| `20260809212129` | `allow_customer_active_courier_tracking` | 628 | `852e11a19afc8735634ffdd3354d6bea5fbb19981a1515418a3f52e88149ac19` |\n"
table_line = "| `20260809213849` | `harden_rpc_and_core_table_privileges` | 3899 | `4508a1484e9b1711ba99f61366e5fb396c9ddc191a0ccbf30812f008259fb1a7` |\n"
if table_line not in doc:
    if table_anchor not in doc:
        raise SystemExit("migration hash table anchor missing")
    doc = doc.replace(table_anchor, table_anchor + table_line, 1)
doc_path.write_text(doc, encoding="utf-8")
