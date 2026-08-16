from pathlib import Path
p=Path('src/routes/checkout.tsx')
s=p.read_text(encoding='utf-8')
old='to: "/pedido/$orderId/",'
new='to: "/pedido/$orderId",'
if old not in s:
    raise SystemExit('checkout order route marker not found')
p.write_text(s.replace(old,new,1),encoding='utf-8')
