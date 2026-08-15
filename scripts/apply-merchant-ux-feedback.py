from pathlib import Path

path = Path("src/routes/merchant.tsx")
text = path.read_text(encoding="utf-8")
changed = text

old = '''    if (ordersRes.error) toast.error("Não foi possível carregar os pedidos do estabelecimento.");
    setOrders(ordersRes.data ?? []);
    setMenuCategories(categoriesRes.data ?? []);
    setProducts(productsRes.data ?? []);
    setHours(hoursRes.data ?? []);
    setReviews(reviewsRes.data ?? []);
    setSpecialHours(specialHoursRes.data ?? []);
'''
new = '''    const operationErrors = [
      [ordersRes.error, "pedidos"],
      [categoriesRes.error, "categorias do cardápio"],
      [productsRes.error, "produtos"],
      [hoursRes.error, "horários"],
      [walletRes.error, "carteira"],
      [reviewsRes.error, "avaliações"],
      [specialHoursRes.error, "horários especiais"],
    ].filter(([error]) => Boolean(error));
    if (operationErrors.length > 0) {
      const [, area] = operationErrors[0];
      toast.error(`Não foi possível carregar ${area} do estabelecimento.`);
    }
    setOrders(ordersRes.data ?? []);
    setMenuCategories(categoriesRes.data ?? []);
    setProducts(productsRes.data ?? []);
    setHours(hoursRes.data ?? []);
    setReviews(reviewsRes.data ?? []);
    setSpecialHours(specialHoursRes.data ?? []);
'''
if old in changed:
    changed = changed.replace(old, new, 1)

old = '''  const toggleProduct = async (product: any) => {
    if (!merchant?.id) return;
    const { error } = await from("products")
      .update({ is_available: !product.is_available })
      .eq("id", product.id);
    if (error) return toast.error(error.message);
    await loadOperations(merchant.id);
  };
'''
new = '''  const toggleProduct = async (product: any) => {
    if (!merchant?.id) return;
    setBusyAction(`product:${product.id}`);
    const { error } = await from("products")
      .update({ is_available: !product.is_available })
      .eq("id", product.id);
    setBusyAction(null);
    if (error) return toast.error(error.message || "Não foi possível atualizar o produto.");
    toast.success(product.is_available ? "Produto pausado." : "Produto ativado.");
    await loadOperations(merchant.id);
  };
'''
if old in changed:
    changed = changed.replace(old, new, 1)

old = '''  const saveHours = async (weekday: number, patch: Record<string, unknown>) => {
    if (!merchant?.id) return;
    const current = hours.find((row) => Number(row.weekday) === weekday);
    const row = {
      merchant_id: merchant.id,
      weekday,
      opens_at: current?.opens_at ?? "08:00:00",
      closes_at: current?.closes_at ?? "22:00:00",
      second_opens_at: current?.second_opens_at ?? null,
      second_closes_at: current?.second_closes_at ?? null,
      is_closed: current?.is_closed ?? false,
      ...patch,
    };
    const { error } = await from("merchant_hours").upsert(row, {
      onConflict: "merchant_id,weekday",
    });
    if (error) return toast.error(error.message);
    await loadOperations(merchant.id);
  };
'''
new = '''  const saveHours = async (weekday: number, patch: Record<string, unknown>) => {
    if (!merchant?.id) return;
    const current = hours.find((row) => Number(row.weekday) === weekday);
    const row = {
      merchant_id: merchant.id,
      weekday,
      opens_at: current?.opens_at ?? "08:00:00",
      closes_at: current?.closes_at ?? "22:00:00",
      second_opens_at: current?.second_opens_at ?? null,
      second_closes_at: current?.second_closes_at ?? null,
      is_closed: current?.is_closed ?? false,
      ...patch,
    };
    setBusyAction(`hours:${weekday}`);
    const { error } = await from("merchant_hours").upsert(row, {
      onConflict: "merchant_id,weekday",
    });
    setBusyAction(null);
    if (error) return toast.error(error.message || "Não foi possível salvar o horário.");
    toast.success(`${week[weekday]} atualizado.`);
    await loadOperations(merchant.id);
  };
'''
if old in changed:
    changed = changed.replace(old, new, 1)

old = '''                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void toggleProduct(product)}
                      className="flex-1 border-zinc-800 bg-zinc-950"
                    >
                      {product.is_available ? "Pausar" : "Ativar"}
                    </Button>
'''
new = '''                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyAction === `product:${product.id}`}
                      onClick={() => void toggleProduct(product)}
                      className="flex-1 border-zinc-800 bg-zinc-950"
                    >
                      {busyAction === `product:${product.id}` ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : null}
                      {product.is_available ? "Pausar" : "Ativar"}
                    </Button>
'''
if old in changed:
    changed = changed.replace(old, new, 1)

if changed == text:
    raise SystemExit("merchant UX feedback patch did not match current source")

path.write_text(changed, encoding="utf-8")
print("APOIS_MERCHANT_UX_FEEDBACK_PATCH_APPLIED")