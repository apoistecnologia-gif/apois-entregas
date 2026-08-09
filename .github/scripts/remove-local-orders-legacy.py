from pathlib import Path
import re

legacy = Path("src/lib/local-orders.ts")
if not legacy.exists():
    raise SystemExit("legacy local-orders.ts not found")
text = legacy.read_text(encoding="utf-8")

match = re.search(r"export\s+(?:interface|type)\s+LocalAddressSnapshot\b[\s\S]*?(?=\nexport\s+(?:interface|type|const|function|class)|\Z)", text)
if not match:
    raise SystemExit("LocalAddressSnapshot declaration not found")
declaration = match.group(0).strip()

refs = []
for path in Path("src").rglob("*.ts*"):
    if path == legacy:
        continue
    source = path.read_text(encoding="utf-8")
    if "local-orders" in source:
        refs.append(path)

if not refs:
    raise SystemExit("no consumers of local-orders found")

for path in refs:
    source = path.read_text(encoding="utf-8")
    source = source.replace('from "@/lib/local-orders"', 'from "@/lib/order-types"')
    source = source.replace("from '@/lib/local-orders'", "from '@/lib/order-types'")
    path.write_text(source, encoding="utf-8")

Path("src/lib/order-types.ts").write_text(
    "/** Shared order/address snapshot types without local persistence. */\n" + declaration + "\n",
    encoding="utf-8",
)
legacy.unlink()

remaining = []
for path in Path("src").rglob("*.ts*"):
    if "local-orders" in path.read_text(encoding="utf-8"):
        remaining.append(str(path))
if remaining:
    raise SystemExit(f"remaining local-orders references: {remaining}")
