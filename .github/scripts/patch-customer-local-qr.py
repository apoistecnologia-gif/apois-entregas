from pathlib import Path
p=Path('src/routes/checkout.tsx')
s=p.read_text(encoding='utf-8')
import_marker='import { useCallback, useEffect, useState } from "react";\n'
if import_marker not in s:
    raise SystemExit('react import marker not found')
s=s.replace(import_marker, import_marker+'import QRCode from "qrcode";\n',1)
state_marker='  const [paymentStatus, setPaymentStatus] = useState<string>("pending");\n'
if state_marker not in s:
    raise SystemExit('payment state marker not found')
s=s.replace(state_marker,state_marker+'  const [localQrImage, setLocalQrImage] = useState<string | null>(null);\n\n  useEffect(() => {\n    let disposed = false;\n    void QRCode.toDataURL(pixData.qrCodeText, { width: 512, margin: 2, errorCorrectionLevel: "M" })\n      .then((value) => { if (!disposed) setLocalQrImage(value); })\n      .catch((error) => console.warn("pix local qr generation failed", error));\n    return () => { disposed = true; };\n  }, [pixData.qrCodeText]);\n',1)
img='<img src={pixData.qrCodeImageUrl} alt="QR Code PIX" className="h-64 w-64" />'
replacement='''{localQrImage ? (
          <img src={localQrImage} alt="QR Code PIX" className="h-64 w-64" />
        ) : pixData.qrCodeImageUrl ? (
          <img src={pixData.qrCodeImageUrl} alt="QR Code PIX" className="h-64 w-64" />
        ) : (
          <div className="grid h-64 w-64 place-items-center bg-white text-center text-sm font-bold text-black">
            Gerando QR Code PIX...
          </div>
        )}'''
if img not in s:
    raise SystemExit('pix img marker not found')
s=s.replace(img,replacement,1)
p.write_text(s,encoding='utf-8')
