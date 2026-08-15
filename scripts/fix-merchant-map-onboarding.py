from pathlib import Path
import re

path = Path("src/routes/merchant.tsx")
s = path.read_text()

pattern = re.compile(r"\n  const captureMerchantLocation = async \(\) => \{.*?\n  \};\n\n  const saveMerchantMappedLocation", re.S)
s, count = pattern.subn("\n  const saveMerchantMappedLocation", s, count=1)
assert count == 1, f"captureMerchantLocation block replacement count={count}"

start = s.index("  const saveMerchantMappedLocation = async (address: {")
end = s.index("  const uploadMerchantAsset = async", start)
replacement = '''  const saveMerchantMappedLocation = async (address: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    postal_code: string;
    latitude?: number | null;
    longitude?: number | null;
  }) => {
    if (!merchant?.id || address.latitude == null || address.longitude == null) return;
    const mappedAddressLine = [address.street, address.number].filter(Boolean).join(", ");
    setBusyAction("merchant-map-location");
    try {
      const { error: coordinateError } = await rpc("set_merchant_mapped_location", {
        _latitude: address.latitude,
        _longitude: address.longitude,
      });
      if (coordinateError) throw coordinateError;

      const addressPatch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (mappedAddressLine) addressPatch.address_line = mappedAddressLine;
      if (address.neighborhood) addressPatch.neighborhood = address.neighborhood;

      if (Object.keys(addressPatch).length > 1) {
        const { error } = await from("merchants").update(addressPatch).eq("id", merchant.id);
        if (error) throw error;
      }

      await loadAll(true);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível salvar o ponto da loja.");
    } finally {
      setBusyAction(null);
    }
  };

'''
s = s[:start] + replacement + s[end:]

old = "        onCaptureLocation={captureMerchantLocation}\n"
assert old in s
s = s.replace(old, "        onMappedLocation={saveMerchantMappedLocation}\n", 1)

old = '''            <Button
              type="button"
              onClick={() => void captureMerchantLocation()}
              disabled={busyAction === "merchant-location"}
            >
              {busyAction === "merchant-location" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Capturar localização
            </Button>'''
assert old in s
s = s.replace(
    old,
    '''            <Button type="button" onClick={() => setActiveTab("settings")}>
              Definir no mapa
            </Button>''',
    1,
)

old = '''            <Button
              type="button"
              variant="outline"
              onClick={captureMerchantLocation}
              disabled={busyAction === "merchant-location"}
              className="w-full border-zinc-800 bg-black"
            >
              {busyAction === "merchant-location" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Usar localização atual da loja
            </Button>
'''
assert old in s
s = s.replace(old, "", 1)

old = "  onCaptureLocation,\n"
assert old in s
s = s.replace(old, "  onMappedLocation,\n", 1)

start_marker = '''          <div
            className={`mt-6 rounded-2xl border p-4 ${
              merchant.latitude != null && merchant.longitude != null
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-primary/30 bg-primary/5"
            }`}
          >'''
start = s.index(start_marker)
end_marker = '          <div className="mt-6 grid gap-3 md:grid-cols-3">'
end = s.index(end_marker, start)
review_section = '''          <div
            className={`mt-6 rounded-2xl border p-4 ${
              merchant.latitude != null && merchant.longitude != null
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-primary/30 bg-primary/5"
            }`}
          >
            <div>
              <p className="text-sm font-black">Localização exata da loja</p>
              <p className="mt-1 text-xs text-zinc-500">
                {merchant.latitude != null && merchant.longitude != null
                  ? "Ponto registrado. Pesquise ou ajuste o marcador abaixo se precisar corrigir a posição da loja."
                  : "Obrigatória antes da aprovação. Pesquise o endereço físico real da loja e confirme o marcador no mapa."}
              </p>
            </div>
            <div className="mt-4 rounded-2xl border border-zinc-900 bg-black p-3">
              <GoogleMapsAddressSelector
                initialCenter={
                  merchant.latitude != null && merchant.longitude != null
                    ? { lat: Number(merchant.latitude), lng: Number(merchant.longitude) }
                    : undefined
                }
                onAddressSelected={(address) => void onMappedLocation(address)}
              />
            </div>
          </div>

'''
s = s[:start] + review_section + s[end:]

assert "captureMerchantLocation" not in s
assert "onCaptureLocation" not in s
assert "Usar localização atual da loja" not in s

path.write_text(s)
