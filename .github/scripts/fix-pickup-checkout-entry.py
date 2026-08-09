from pathlib import Path

path = Path("src/routes/sacola.tsx")
text = path.read_text(encoding="utf-8")

replacements = [
    (
'''  const subtotal = totalPrice;
  const deliveryFee = merchant?.deliveryFee || 0;
  const total = subtotal + deliveryFee;

  const handleFinishOrder = () => {
    if (items.length === 0) return;
    if (!defaultAddress) {
      alert("Selecione um endereço de entrega!");
      return;
    }
    sessionStorage.setItem("apois_payment_method", "pix");
    navigate({ to: "/checkout" });
  };''',
'''  const subtotal = totalPrice;

  const handleFinishOrder = () => {
    if (items.length === 0) return;
    sessionStorage.setItem("apois_payment_method", "pix");
    navigate({ to: "/checkout" });
  };'''
    ),
    (
'''                    <p className="font-bold text-primary">Selecione um endereço</p>''',
'''                    <p className="font-bold text-primary">Escolha no checkout ou retire no local</p>'''
    ),
    (
'''                <span>R$ {deliveryFee.toFixed(2).replace(".", ",")}</span>''',
'''                <span className="text-right text-xs">Calculada no checkout</span>'''
    ),
    (
'''                <span>Total</span>
                <span className="text-xl text-primary">
                  R$ {total.toFixed(2).replace(".", ",")}
                </span>''',
'''                <span>Subtotal dos itens</span>
                <span className="text-xl text-primary">
                  R$ {subtotal.toFixed(2).replace(".", ",")}
                </span>'''
    ),
    (
'''              <span className="text-lg font-black">R$ {total.toFixed(2).replace(".", ",")}</span>''',
'''              <span className="text-lg font-black">R$ {subtotal.toFixed(2).replace(".", ",")}</span>'''
    ),
]

for old, new in replacements:
    if text.count(old) != 1:
        raise SystemExit(f"expected exactly one target snippet, found {text.count(old)}:\n{old[:240]}")
    text = text.replace(old, new, 1)

if "Selecione um endereço de entrega!" in text or "const deliveryFee =" in text:
    raise SystemExit("legacy delivery-only cart guard or fee estimate is still present")

path.write_text(text, encoding="utf-8")
