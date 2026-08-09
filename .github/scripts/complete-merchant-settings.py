from pathlib import Path

path = Path("src/routes/merchant.tsx")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f"expected merchant.tsx snippet not found:\n{old[:240]}")
    text = text.replace(old, new, 1)

replace_once(
'''  const [settingsDraft, setSettingsDraft] = useState({
    deliveryFee: "",
    minimumOrder: "",
    minMinutes: "",
    maxMinutes: "",
    temporarilyClosed: false,
  });''',
'''  const [settingsDraft, setSettingsDraft] = useState({
    name: "",
    description: "",
    contactPhone: "",
    contactEmail: "",
    addressLine: "",
    neighborhood: "",
    deliveryFee: "",
    minimumOrder: "",
    minMinutes: "",
    maxMinutes: "",
    temporarilyClosed: false,
  });''',
)

replace_once(
'''        setSettingsDraft({
          deliveryFee: String(merchantRes.data.delivery_fee ?? 0),
          minimumOrder: String(merchantRes.data.minimum_order ?? 0),
          minMinutes: String(merchantRes.data.delivery_min_minutes ?? ""),
          maxMinutes: String(merchantRes.data.delivery_max_minutes ?? ""),
          temporarilyClosed: Boolean(merchantRes.data.temporarily_closed),
        });''',
'''        setSettingsDraft({
          name: String(merchantRes.data.name ?? ""),
          description: String(merchantRes.data.description ?? ""),
          contactPhone: String(merchantRes.data.contact_phone ?? ""),
          contactEmail: String(merchantRes.data.contact_email ?? ""),
          addressLine: String(merchantRes.data.address_line ?? ""),
          neighborhood: String(merchantRes.data.neighborhood ?? ""),
          deliveryFee: String(merchantRes.data.delivery_fee ?? 0),
          minimumOrder: String(merchantRes.data.minimum_order ?? 0),
          minMinutes: String(merchantRes.data.delivery_min_minutes ?? ""),
          maxMinutes: String(merchantRes.data.delivery_max_minutes ?? ""),
          temporarilyClosed: Boolean(merchantRes.data.temporarily_closed),
        });''',
)

replace_once(
'''  const saveSettings = async () => {
    if (!merchant?.id) return;
    setBusyAction("settings");
    const { error } = await from("merchants")
      .update({
        delivery_fee: Number(settingsDraft.deliveryFee || 0),
        minimum_order: Number(settingsDraft.minimumOrder || 0),
        delivery_min_minutes: settingsDraft.minMinutes ? Number(settingsDraft.minMinutes) : null,
        delivery_max_minutes: settingsDraft.maxMinutes ? Number(settingsDraft.maxMinutes) : null,
        temporarily_closed: settingsDraft.temporarilyClosed,
      })
      .eq("id", merchant.id);
    setBusyAction(null);
    if (error) return toast.error(error.message);
    toast.success("Configurações salvas.");
    await loadAll(true);
  };''',
'''  const captureMerchantLocation = async () => {
    if (!merchant?.id) return;
    if (!navigator.geolocation) {
      toast.error("Este dispositivo não oferece localização pelo navegador.");
      return;
    }

    setBusyAction("merchant-location");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });
      const { error } = await from("merchants")
        .update({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        .eq("id", merchant.id);
      if (error) throw error;
      toast.success("Localização da loja atualizada.");
      await loadAll(true);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível obter a localização da loja.");
    } finally {
      setBusyAction(null);
    }
  };

  const uploadMerchantAsset = async (kind: "logo" | "cover", file: File) => {
    if (!merchant?.id) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem válido.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("A imagem pode ter no máximo 10 MB.");
      return;
    }

    setBusyAction(`merchant-asset:${kind}`);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const storagePath = `${merchant.id}/${kind}-${Date.now()}.${extension}`;
      const upload = await supabase.storage
        .from("merchant-assets")
        .upload(storagePath, file, { upsert: false, contentType: file.type });
      if (upload.error) throw upload.error;
      const publicUrl = supabase.storage.from("merchant-assets").getPublicUrl(storagePath).data.publicUrl;
      const field = kind === "logo" ? "logo_url" : "cover_url";
      const { error } = await from("merchants").update({ [field]: publicUrl }).eq("id", merchant.id);
      if (error) throw error;
      toast.success(kind === "logo" ? "Logo atualizada." : "Capa atualizada.");
      await loadAll(true);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível enviar a imagem.");
    } finally {
      setBusyAction(null);
    }
  };

  const saveSettings = async () => {
    if (!merchant?.id) return;
    if (!settingsDraft.name.trim() || !settingsDraft.addressLine.trim()) {
      toast.error("Informe o nome e o endereço do estabelecimento.");
      return;
    }

    const deliveryFee = Number(settingsDraft.deliveryFee || 0);
    const minimumOrder = Number(settingsDraft.minimumOrder || 0);
    const minMinutes = settingsDraft.minMinutes ? Number(settingsDraft.minMinutes) : null;
    const maxMinutes = settingsDraft.maxMinutes ? Number(settingsDraft.maxMinutes) : null;
    if (
      !Number.isFinite(deliveryFee) ||
      deliveryFee < 0 ||
      !Number.isFinite(minimumOrder) ||
      minimumOrder < 0 ||
      (minMinutes !== null && (!Number.isFinite(minMinutes) || minMinutes < 1)) ||
      (maxMinutes !== null && (!Number.isFinite(maxMinutes) || maxMinutes < 1)) ||
      (minMinutes !== null && maxMinutes !== null && minMinutes > maxMinutes)
    ) {
      toast.error("Revise os valores e prazos de entrega.");
      return;
    }

    setBusyAction("settings");
    const { error } = await from("merchants")
      .update({
        name: settingsDraft.name.trim(),
        description: settingsDraft.description.trim() || null,
        contact_phone: settingsDraft.contactPhone.trim() || null,
        contact_email: settingsDraft.contactEmail.trim() || null,
        address_line: settingsDraft.addressLine.trim(),
        neighborhood: settingsDraft.neighborhood.trim() || null,
        delivery_fee: deliveryFee,
        minimum_order: minimumOrder,
        delivery_min_minutes: minMinutes,
        delivery_max_minutes: maxMinutes,
        temporarily_closed: settingsDraft.temporarilyClosed,
      })
      .eq("id", merchant.id);
    setBusyAction(null);
    if (error) return toast.error(error.message);
    toast.success("Configurações salvas.");
    await loadAll(true);
  };''',
)

replace_once(
'''      {activeTab === "settings" && (
        <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
          <section className="space-y-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
            <h2 className="font-black">Entrega e pedido mínimo</h2>''',
'''      {activeTab === "settings" && (
        <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
          <section className="space-y-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
            <h2 className="font-black">Dados do estabelecimento</h2>
            <Field
              value={settingsDraft.name}
              onChange={(value) => setSettingsDraft((d) => ({ ...d, name: value }))}
              placeholder="Nome do estabelecimento"
              required
            />
            <textarea
              value={settingsDraft.description}
              onChange={(event) =>
                setSettingsDraft((d) => ({ ...d, description: event.target.value }))
              }
              placeholder="Descrição"
              className="min-h-24 w-full rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                value={settingsDraft.contactPhone}
                onChange={(value) => setSettingsDraft((d) => ({ ...d, contactPhone: value }))}
                placeholder="Telefone"
              />
              <Field
                value={settingsDraft.contactEmail}
                onChange={(value) => setSettingsDraft((d) => ({ ...d, contactEmail: value }))}
                placeholder="E-mail"
                type="email"
              />
            </div>
            <Field
              value={settingsDraft.addressLine}
              onChange={(value) => setSettingsDraft((d) => ({ ...d, addressLine: value }))}
              placeholder="Endereço"
              required
            />
            <Field
              value={settingsDraft.neighborhood}
              onChange={(value) => setSettingsDraft((d) => ({ ...d, neighborhood: value }))}
              placeholder="Bairro"
            />
            <p className="text-xs text-zinc-500">
              Cidade operacional: <strong className="text-zinc-300">{merchant.city} - {merchant.state}</strong>. A troca de cidade é controlada pelo administrador para preservar zonas e taxas.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="cursor-pointer rounded-xl border border-zinc-800 bg-black p-3 text-center text-xs font-bold text-zinc-300 hover:border-primary/50">
                {busyAction === "merchant-asset:logo" ? "Enviando logo..." : "Atualizar logo"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={busyAction === "merchant-asset:logo"}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadMerchantAsset("logo", file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <label className="cursor-pointer rounded-xl border border-zinc-800 bg-black p-3 text-center text-xs font-bold text-zinc-300 hover:border-primary/50">
                {busyAction === "merchant-asset:cover" ? "Enviando capa..." : "Atualizar capa"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={busyAction === "merchant-asset:cover"}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadMerchantAsset("cover", file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
            <h2 className="font-black">Localização da loja</h2>
            <p className="text-sm text-zinc-500">
              A posição correta é usada para validar raio de entrega, distância e acompanhamento operacional.
            </p>
            <div className="rounded-xl border border-zinc-900 bg-black p-4 text-sm">
              {merchant.latitude != null && merchant.longitude != null ? (
                <>
                  <p className="font-bold text-emerald-400">Localização configurada</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {Number(merchant.latitude).toFixed(6)}, {Number(merchant.longitude).toFixed(6)}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-amber-400">Localização ainda não configurada</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Sem coordenadas, a plataforma não consegue aplicar corretamente o raio padrão da cidade.
                  </p>
                </>
              )}
            </div>
            <Button
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
          </section>

          <section className="space-y-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
            <h2 className="font-black">Entrega e pedido mínimo</h2>''',
)

path.write_text(text, encoding="utf-8")
