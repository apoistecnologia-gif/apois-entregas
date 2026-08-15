from pathlib import Path

path = Path("src/routes/merchant.tsx")
text = path.read_text()

text = text.replace(
    'import { MerchantAsaasOnboarding } from "@/components/MerchantAsaasOnboarding";\n',
    "",
    1,
)
text = text.replace("          <MerchantAsaasOnboarding merchant={merchant} />\n", "", 1)

upload_doc = '''  const uploadDocument = async (documentType: string, file: File) => {
    if (!merchant?.id || !user?.id) return;
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
    if (!allowedTypes.has(file.type)) {
      toast.error("Envie uma imagem JPG, PNG, WEBP ou um arquivo PDF.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("O documento deve ter no máximo 15 MB.");
      return;
    }

    setBusyAction(`doc:${documentType}`);
    let uploadedPath: string | null = null;
    let metadataCommitted = false;
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
      const storagePath = `${merchant.id}/${documentType}-${Date.now()}.${extension}`;
      const upload = await supabase.storage
        .from("merchant-documents")
        .upload(storagePath, file, { upsert: false, contentType: file.type });
      if (upload.error) throw upload.error;
      uploadedPath = storagePath;

      const existing = documents.find((doc) => doc.document_type === documentType);
      const previousStoragePath = existing?.storage_path ?? null;
      const write = existing
        ? await from("merchant_documents")
            .update({ storage_path: storagePath, status: "pending" })
            .eq("id", existing.id)
        : await from("merchant_documents").insert({
            merchant_id: merchant.id,
            document_type: documentType,
            storage_path: storagePath,
            status: "pending",
          });
      if (write.error) throw write.error;
      metadataCommitted = true;

      if (previousStoragePath && previousStoragePath !== storagePath) {
        const { error: cleanupError } = await supabase.storage
          .from("merchant-documents")
          .remove([previousStoragePath]);
        if (cleanupError) {
          console.warn("merchant old document cleanup pending", cleanupError.message);
        }
      }

      toast.success("Documento enviado.");
      await loadAll(true);
    } catch (error: any) {
      if (uploadedPath && !metadataCommitted) {
        await supabase.storage
          .from("merchant-documents")
          .remove([uploadedPath])
          .catch(() => undefined);
      }
      toast.error(error?.message || "Falha ao enviar documento.");
    } finally {
      setBusyAction(null);
    }
  };'''

upload_asset = '''  const uploadMerchantAsset = async (kind: "logo" | "cover", file: File) => {
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
    let uploadedPath: string | null = null;
    let metadataCommitted = false;
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const storagePath = `${merchant.id}/${kind}-${Date.now()}.${extension}`;
      const upload = await supabase.storage
        .from("merchant-assets")
        .upload(storagePath, file, { upsert: false, contentType: file.type });
      if (upload.error) throw upload.error;
      uploadedPath = storagePath;

      const publicUrl = supabase.storage.from("merchant-assets").getPublicUrl(storagePath)
        .data.publicUrl;
      const field = kind === "logo" ? "logo_url" : "cover_url";
      const previousUrl = kind === "logo" ? merchant.logo_url : merchant.cover_url;
      const { error } = await from("merchants")
        .update({ [field]: publicUrl })
        .eq("id", merchant.id);
      if (error) throw error;
      metadataCommitted = true;

      if (previousUrl && previousUrl !== publicUrl) {
        try {
          const parsed = new URL(previousUrl);
          const marker = "/merchant-assets/";
          const markerIndex = parsed.pathname.indexOf(marker);
          if (markerIndex >= 0) {
            const previousStoragePath = decodeURIComponent(
              parsed.pathname.slice(markerIndex + marker.length),
            );
            if (previousStoragePath && previousStoragePath !== storagePath) {
              const { error: cleanupError } = await supabase.storage
                .from("merchant-assets")
                .remove([previousStoragePath]);
              if (cleanupError) {
                console.warn("merchant old asset cleanup pending", cleanupError.message);
              }
            }
          }
        } catch (cleanupError) {
          console.warn("merchant old asset URL could not be parsed", cleanupError);
        }
      }

      toast.success(kind === "logo" ? "Logo atualizada." : "Capa atualizada.");
      await loadAll(true);
    } catch (error: any) {
      if (uploadedPath && !metadataCommitted) {
        await supabase.storage
          .from("merchant-assets")
          .remove([uploadedPath])
          .catch(() => undefined);
      }
      toast.error(error?.message || "Não foi possível enviar a imagem.");
    } finally {
      setBusyAction(null);
    }
  };'''

request_payout = '''  const requestPayout = async () => {
    if (!wallet || !payoutAccount)
      return toast.error("Cadastre a chave PIX antes de solicitar saque.");
    const amount = Number(payoutDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      return toast.error("Informe um valor de saque válido.");
    const attemptKey = getPayoutAttemptKey("merchant", wallet.id, amount);
    setBusyAction("payout");
    try {
      const { data: payoutId, error } = await rpc("request_payout", {
        _wallet_id: wallet.id,
        _amount: amount,
        _idempotency_key: attemptKey,
      });
      if (error || !payoutId) {
        throw new Error(error?.message || "Não foi possível solicitar o saque.");
      }

      const { data: transferData, error: transferError } = await supabase.functions.invoke(
        "openpix-payout",
        { body: { payoutId } },
      );
      if (transferError || transferData?.error) {
        toast.warning(
          "O saque foi reservado com segurança e será reenviado automaticamente ao provedor PIX.",
        );
        if (merchant?.id) await loadOperations(merchant.id);
        return;
      }

      clearPayoutAttemptKey("merchant", wallet.id, attemptKey);
      setPayoutDraft((current) => ({ ...current, amount: "" }));
      toast.success(
        transferData?.status === "paid"
          ? "Saque enviado por PIX com sucesso."
          : "Saque enviado ao provedor PIX e em processamento.",
      );
      if (merchant?.id) await loadOperations(merchant.id);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível solicitar o saque.");
    } finally {
      setBusyAction(null);
    }
  };'''

start = text.index('  const uploadDocument = async (documentType: string, file: File) => {')
end = text.index("\n\n  const resubmitApplication = async () => {", start)
text = text[:start] + upload_doc + text[end:]

start = text.index('  const uploadMerchantAsset = async (kind: "logo" | "cover", file: File) => {')
end = text.index("\n\n  const saveSettings = async () => {", start)
text = text[:start] + upload_asset + text[end:]

start = text.index("  const requestPayout = async () => {")
end = text.index("\n\n  const pendingOrders = useMemo(", start)
text = text[:start] + request_payout + text[end:]

path.write_text(text)
