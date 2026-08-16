from pathlib import Path

# Make OpenPix QR images self-contained for Android WebView. Sandbox image URLs can render blank.
p = Path('supabase/functions/create-pix-charge/index.ts')
s = p.read_text(encoding='utf-8')
marker = '''async function readJson(providerResponse: Response): Promise<unknown> {
  try {
    return await providerResponse.json();
  } catch {
    return null;
  }
}
'''
helper = marker + '''async function qrImageAsDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:image/")) return url;
  try {
    const imageResponse = await fetch(url, { headers: { Accept: "image/png,image/*" } });
    if (!imageResponse.ok) return url;
    const contentType = imageResponse.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    if (!bytes.length) return url;
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
  } catch {
    return url;
  }
}
'''
if marker not in s:
    raise SystemExit('readJson marker not found')
s = s.replace(marker, helper, 1)
old = '  const qrCodeImageUrl = text(charge.qrCodeImage);\n'
new = '  const qrCodeImageUrl = await qrImageAsDataUrl(text(charge.qrCodeImage));\n'
if old not in s:
    raise SystemExit('qr image marker not found')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# Order details: load the owned order first, then relations separately. A relation/RLS failure must not
# turn a valid customer-owned order into "Pedido não encontrado".
p = Path('src/routes/pedido/$orderId/index.tsx')
s = p.read_text(encoding='utf-8')
old = '''    const orderResult = await supabase
      .from("orders")
      .select("*, merchants (*), order_items (*)")
      .eq("id", orderId)
      .single();

    if (orderResult.error || !orderResult.data) {
      toast.error("Não foi possível carregar os detalhes deste pedido.");
      setOrder(null);
      setDeliveryJob(null);
      setPickupPin(null);
      setLoading(false);
      return;
    }

    const nextOrder: any = orderResult.data;
    setOrder(nextOrder);
'''
new = '''    const orderResult = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();

    if (orderResult.error || !orderResult.data) {
      console.warn("customer order lookup failed", orderResult.error?.code, orderResult.error?.message);
      toast.error("Não foi possível carregar os detalhes deste pedido.");
      setOrder(null);
      setDeliveryJob(null);
      setPickupPin(null);
      setLoading(false);
      return;
    }

    const baseOrder: any = orderResult.data;
    const [merchantResult, itemsResult] = await Promise.all([
      supabase.from("merchants").select("*").eq("id", baseOrder.merchant_id).maybeSingle(),
      supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
    ]);
    if (merchantResult.error)
      console.warn("customer merchant relation lookup failed", merchantResult.error.code);
    if (itemsResult.error)
      console.warn("customer order items lookup failed", itemsResult.error.code);

    const nextOrder: any = {
      ...baseOrder,
      merchants: merchantResult.data ?? null,
      order_items: itemsResult.data ?? [],
    };
    setOrder(nextOrder);
'''
if old not in s:
    raise SystemExit('order details marker not found')
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')
