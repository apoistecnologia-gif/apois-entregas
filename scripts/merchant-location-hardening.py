from pathlib import Path
import re

selector = Path("src/components/GoogleMapsAddressSelector.tsx")
s = selector.read_text(encoding="utf-8")

old = '''  const persistMerchantCoordinates = async (lat: number, lng: number) => {
    if (!isMerchantProduct) return;
    const { error } = await (supabase as any).rpc("set_merchant_mapped_location", {
      _latitude: lat,
      _longitude: lng,
    });
    if (error) throw error;
  };
'''
new = '''  const persistMerchantMappedAddress = async (
    address: {
      street: string;
      number: string;
      neighborhood: string;
      city: string;
      state: string;
      postal_code: string;
    },
    lat: number,
    lng: number,
  ) => {
    if (!isMerchantProduct) return;
    const addressLine = [address.street, address.number].filter(Boolean).join(", ").trim();
    if (!addressLine || !address.city || !address.state) {
      throw new Error("O mapa não retornou endereço, cidade e estado suficientes para confirmar a loja.");
    }
    const { error } = await (supabase as any).rpc("confirm_merchant_mapped_address", {
      _latitude: lat,
      _longitude: lng,
      _city: address.city,
      _state: address.state,
      _address_line: addressLine,
      _neighborhood: address.neighborhood || null,
    });
    if (error) throw error;
  };
'''
if old not in s:
    raise SystemExit("merchant persistence block not found")
s = s.replace(old, new, 1)

start = s.find("  const confirmCoordinates = async (")
end = s.find("\n  const handleMarkerDragEnd", start)
if start < 0 or end < 0:
    raise SystemExit("confirmCoordinates block not found")
new_confirm = '''  const confirmCoordinates = async (
    lat: number,
    lng: number,
    successMessage?: string,
    allowMerchantConfirmation = false,
  ) => {
    if (isMerchantProduct && !hasExplicitPoint && !allowMerchantConfirmation) {
      toast.error("Pesquise o endereço da loja ou mova o marcador antes de confirmar.");
      return;
    }
    setMarkerPos({ lat, lng });
    setIsConfirming(true);

    try {
      const accessToken = await getAccessToken();
      const data = await geocodeFn({ data: { lat, lng, accessToken } });
      const first = data.results[0];

      if (isMerchantProduct) {
        if (!first) {
          throw new Error("Não foi possível validar o endereço físico deste ponto.");
        }
        const address = parseAddressComponents(first.address_components);
        await persistMerchantMappedAddress(address, lat, lng);
        onAddressSelected({ ...address, latitude: lat, longitude: lng });
        setPointConfirmed(true);
        toast.success(successMessage || "Ponto e endereço físico da loja confirmados!");
        return;
      }

      // For customers, coordinates remain authoritative even if reverse geocoding is
      // temporarily unavailable. The saved-address flow still validates ownership.
      onAddressSelected({
        street: "",
        number: "",
        neighborhood: "",
        city: "",
        state: "",
        postal_code: "",
        latitude: lat,
        longitude: lng,
      });

      if (first) {
        const address = parseAddressComponents(first.address_components);
        onAddressSelected({ ...address, latitude: lat, longitude: lng });
      }
      setPointConfirmed(true);
      toast.success(successMessage || "Ponto de entrega confirmado!");
    } catch (error) {
      console.error("Reverse geocoding / merchant address confirmation error:", error);
      if (isMerchantProduct) {
        setPointConfirmed(false);
        toast.error(
          error instanceof Error && error.message
            ? error.message
            : "Não foi possível validar e salvar o endereço físico da loja.",
        );
      } else {
        setPointConfirmed(true);
        toast.success("Ponto de entrega confirmado. Revise os dados do endereço antes de salvar.");
      }
    } finally {
      setIsConfirming(false);
    }
  };
'''
s = s[:start] + new_confirm + s[end:]

old = '''      const { lat, lng } = result.geometry.location;
      setHasExplicitPoint(true);
      await persistMerchantCoordinates(lat, lng);
      setMarkerPos({ lat, lng });
      const address = parseAddressComponents(result.address_components);
      onAddressSelected({ ...address, latitude: lat, longitude: lng });
'''
new = '''      const { lat, lng } = result.geometry.location;
      setHasExplicitPoint(true);
      const address = parseAddressComponents(result.address_components);
      await persistMerchantMappedAddress(address, lat, lng);
      setMarkerPos({ lat, lng });
      onAddressSelected({ ...address, latitude: lat, longitude: lng });
'''
if old not in s:
    raise SystemExit("suggestion persistence block not found")
s = s.replace(old, new, 1)
selector.write_text(s, encoding="utf-8")

merchant = Path("src/routes/merchant.tsx")
s = merchant.read_text(encoding="utf-8")
start = s.find("  const saveMerchantMappedLocation = async (address: {")
end = s.find("\n  const uploadMerchantAsset", start)
if start < 0 or end < 0:
    raise SystemExit("merchant location callback block not found")
new_callback = '''  const saveMerchantMappedLocation = async (address: {
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
    // GoogleMapsAddressSelector persists the complete, validated merchant address
    // atomically through confirm_merchant_mapped_address. Reload only after success;
    // never patch address text independently from its coordinates/city.
    setBusyAction("merchant-map-location");
    try {
      await loadAll(true);
      toast.success("Endereço físico e ponto da loja atualizados.");
    } finally {
      setBusyAction(null);
    }
  };
'''
s = s[:start] + new_callback + s[end:]
merchant.write_text(s, encoding="utf-8")
