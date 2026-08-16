from pathlib import Path
p=Path('src/routes/admin.tsx')
s=p.read_text()
imp='import { AdminMerchantCreateDialog } from "@/components/AdminMerchantCreateDialog";\n'
if imp not in s:
    s=s.replace('import { AdminOrdersPanel } from "@/components/AdminOrdersPanel";\n', 'import { AdminOrdersPanel } from "@/components/AdminOrdersPanel";\n'+imp)
state='  const [createMerchantOpen, setCreateMerchantOpen] = useState(false);\n'
if state not in s:
    s=s.replace('  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);\n', '  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);\n'+state)
s=s.replace('onClick={() => void createMerchantManually()}', 'onClick={() => setCreateMerchantOpen(true)}')
marker='      {activeTab === "merchants" &&\n'
if '<AdminMerchantCreateDialog' not in s:
    dialog='''      <AdminMerchantCreateDialog\n        open={createMerchantOpen}\n        onOpenChange={setCreateMerchantOpen}\n        onCreated={async (merchantId) => {\n          await loadAll(true);\n          setSelectedMerchantId(merchantId);\n        }}\n      />\n\n'''
    s=s.replace(marker, dialog+marker)
p.write_text(s)
