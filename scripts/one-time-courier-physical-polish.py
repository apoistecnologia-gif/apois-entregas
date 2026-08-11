from pathlib import Path

panels = Path('src/components/CourierPanels.tsx')
text = panels.read_text(encoding='utf-8')
old = '<p className="truncate text-lg font-black">{user?.email || "Entregador APOIS"}</p>'
new = '<p className="break-all pr-1 text-base font-black leading-snug sm:text-lg">{user?.email || "Entregador APOIS"}</p>'
if old not in text:
    raise SystemExit('profile email target not found')
text = text.replace(old, new, 1)
panels.write_text(text, encoding='utf-8')

route = Path('src/routes/courier.tsx')
text = route.read_text(encoding='utf-8')
old = '<main className="space-y-4 p-4 pb-16">'
new = '<main className="space-y-4 p-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))]">'
if old not in text:
    raise SystemExit('wallet bottom spacing target not found')
text = text.replace(old, new, 1)
route.write_text(text, encoding='utf-8')
