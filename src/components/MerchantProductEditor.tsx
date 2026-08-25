import { ImagePlus, Loader2, Pencil, Plus, Store, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePromptDialog } from "@/components/ui/prompt-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type MerchantProduct = {
  id: string;
  merchant_id: string;
  menu_category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
};

type MenuCategory = {
  id: string;
  name: string;
};

type OptionGroup = {
  id: string;
  product_id: string;
  name: string;
  description: string | null;
  min_selections: number;
  max_selections: number;
  sort_order: number;
  is_active: boolean;
};

type ProductOption = {
  id: string;
  option_group_id: string;
  name: string;
  description: string | null;
  price_delta: number;
  sort_order: number;
  is_available: boolean;
};

type Props = {
  product: MerchantProduct;
  merchantId: string;
  categories: MenuCategory[];
  onChanged: () => void | Promise<void>;
};

const from = (table: string) => (supabase.from as any)(table);
const money = (value: number) =>
  `R$ ${Number(value || 0)
    .toFixed(2)
    .replace(".", ",")}`;

export function MerchantProductEditor({ product, merchantId, categories, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [draft, setDraft] = useState({
    name: product.name,
    description: product.description ?? "",
    price: String(product.price),
    categoryId: product.menu_category_id ?? "",
  });
  const [groupDraft, setGroupDraft] = useState({ name: "", min: "0", max: "1" });
  const { confirm, confirmDialog } = useConfirmDialog();
  const { prompt, promptDialog } = usePromptDialog();

  useEffect(() => {
    setDraft({
      name: product.name,
      description: product.description ?? "",
      price: String(product.price),
      categoryId: product.menu_category_id ?? "",
    });
  }, [product]);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    const groupRes = await from("product_option_groups")
      .select("*")
      .eq("product_id", product.id)
      .order("sort_order")
      .order("name");

    if (groupRes.error) {
      console.error("Erro ao carregar grupos de adicionais:", groupRes.error);
      toast.error("Não foi possível carregar os adicionais deste produto.");
      setGroups([]);
      setOptions([]);
      setLoadingOptions(false);
      return;
    }

    const groupRows = (groupRes.data ?? []) as OptionGroup[];
    setGroups(groupRows);
    if (groupRows.length === 0) {
      setOptions([]);
      setLoadingOptions(false);
      return;
    }

    const optionRes = await from("product_options")
      .select("*")
      .in(
        "option_group_id",
        groupRows.map((group) => group.id),
      )
      .order("sort_order")
      .order("name");

    if (optionRes.error) {
      console.error("Erro ao carregar opções:", optionRes.error);
      toast.error("Não foi possível carregar as opções deste produto.");
      setOptions([]);
    } else {
      setOptions((optionRes.data ?? []) as ProductOption[]);
    }
    setLoadingOptions(false);
  }, [product.id]);

  useEffect(() => {
    if (open) void loadOptions();
  }, [open, loadOptions]);

  const optionsByGroup = useMemo(() => {
    const grouped = new Map<string, ProductOption[]>();
    for (const option of options) {
      const current = grouped.get(option.option_group_id) ?? [];
      current.push(option);
      grouped.set(option.option_group_id, current);
    }
    return grouped;
  }, [options]);

  const saveProduct = async () => {
    const name = draft.name.trim();
    const price = Number(draft.price);
    if (!name) return toast.error("Informe o nome do produto.");
    if (!Number.isFinite(price) || price < 0) return toast.error("Informe um preço válido.");

    setBusy("product");
    const { error } = await from("products")
      .update({
        name,
        description: draft.description.trim() || null,
        price,
        menu_category_id: draft.categoryId || null,
      })
      .eq("id", product.id)
      .eq("merchant_id", merchantId);
    setBusy(null);

    if (error) return toast.error(error.message || "Não foi possível salvar o produto.");
    toast.success("Produto atualizado.");
    await onChanged();
  };

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Selecione uma imagem válida.");
    if (file.size > 10 * 1024 * 1024) return toast.error("A imagem pode ter no máximo 10 MB.");

    setBusy("image");
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${merchantId}/${product.id}-${Date.now()}.${extension}`;
      const upload = await supabase.storage.from("product-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upload.error) throw upload.error;

      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      const update = await from("products")
        .update({ image_url: data.publicUrl })
        .eq("id", product.id)
        .eq("merchant_id", merchantId);
      if (update.error) throw update.error;
      toast.success("Imagem atualizada.");
      await onChanged();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível enviar a imagem.");
    } finally {
      setBusy(null);
    }
  };

  const createGroup = async () => {
    const name = groupDraft.name.trim();
    const min = Number(groupDraft.min);
    const max = Number(groupDraft.max);
    if (!name) return toast.error("Informe o nome do grupo.");
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || min > max) {
      return toast.error("Revise os limites mínimo e máximo do grupo.");
    }

    setBusy("group:create");
    const { error } = await from("product_option_groups").insert({
      product_id: product.id,
      name,
      min_selections: min,
      max_selections: max,
      sort_order: groups.length,
      is_active: true,
    });
    setBusy(null);
    if (error) return toast.error(error.message || "Não foi possível criar o grupo.");
    setGroupDraft({ name: "", min: "0", max: "1" });
    toast.success("Grupo de adicionais criado.");
    await loadOptions();
  };

  const editGroup = async (group: OptionGroup) => {
    const values = await prompt({
      title: "Editar grupo de adicionais",
      fields: [
        { key: "name", label: "Nome do grupo", defaultValue: group.name, required: true },
        {
          key: "min",
          label: "Quantidade mínima",
          type: "number",
          defaultValue: String(group.min_selections),
          required: true,
        },
        {
          key: "max",
          label: "Quantidade máxima",
          type: "number",
          defaultValue: String(group.max_selections),
          required: true,
        },
      ],
    });
    if (!values) return;
    const name = (values["name"] ?? "").trim();
    if (!name) return;
    const min = Number(values["min"]);
    const max = Number(values["max"]);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || min > max) {
      return toast.error("Limites inválidos.");
    }

    setBusy(`group:${group.id}`);
    const { error } = await from("product_option_groups")
      .update({ name, min_selections: min, max_selections: max })
      .eq("id", group.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    await loadOptions();
  };

  const toggleGroup = async (group: OptionGroup) => {
    setBusy(`group:${group.id}`);
    const { error } = await from("product_option_groups")
      .update({ is_active: !group.is_active })
      .eq("id", group.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    await loadOptions();
  };

  const deleteGroup = async (group: OptionGroup) => {
    const ok = await confirm({
      title: "Excluir grupo de adicionais",
      description: `Excluir o grupo "${group.name}" e todas as opções dele? Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    setBusy(`group:${group.id}`);
    const { error } = await from("product_option_groups").delete().eq("id", group.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Grupo excluído.");
    await loadOptions();
  };

  const createOption = async (group: OptionGroup) => {
    const values = await prompt({
      title: "Nova opção",
      description: `Adicionar uma opção ao grupo "${group.name}".`,
      fields: [
        { key: "name", label: "Nome da opção", required: true },
        {
          key: "price",
          label: "Acréscimo em R$ (use 0 para sem acréscimo)",
          type: "number",
          defaultValue: "0",
          required: true,
        },
      ],
    });
    if (!values) return;
    const name = (values["name"] ?? "").trim();
    if (!name) return;
    const price = Number((values["price"] ?? "").replace(",", "."));
    if (!Number.isFinite(price) || price < 0) return toast.error("Informe um acréscimo válido.");

    const groupOptions = optionsByGroup.get(group.id) ?? [];
    setBusy(`option:create:${group.id}`);
    const { error } = await from("product_options").insert({
      option_group_id: group.id,
      name,
      price_delta: price,
      sort_order: groupOptions.length,
      is_available: true,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Opção adicionada.");
    await loadOptions();
  };

  const editOption = async (option: ProductOption) => {
    const values = await prompt({
      title: "Editar opção",
      fields: [
        { key: "name", label: "Nome da opção", defaultValue: option.name, required: true },
        {
          key: "price",
          label: "Acréscimo em R$",
          type: "number",
          defaultValue: String(option.price_delta),
          required: true,
        },
      ],
    });
    if (!values) return;
    const name = (values["name"] ?? "").trim();
    if (!name) return;
    const price = Number((values["price"] ?? "").replace(",", "."));
    if (!Number.isFinite(price) || price < 0) return toast.error("Informe um acréscimo válido.");

    setBusy(`option:${option.id}`);
    const { error } = await from("product_options")
      .update({ name, price_delta: price })
      .eq("id", option.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    await loadOptions();
  };

  const toggleOption = async (option: ProductOption) => {
    setBusy(`option:${option.id}`);
    const { error } = await from("product_options")
      .update({ is_available: !option.is_available })
      .eq("id", option.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    await loadOptions();
  };

  const deleteOption = async (option: ProductOption) => {
    const ok = await confirm({
      title: "Excluir opção",
      description: `Excluir a opção "${option.name}"? Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    setBusy(`option:${option.id}`);
    const { error } = await from("product_options").delete().eq("id", option.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    await loadOptions();
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="flex-1 border-zinc-800 bg-zinc-950"
      >
        <Pencil className="mr-1 h-3.5 w-3.5" /> Editar e adicionais
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[120] flex items-end bg-black/80 backdrop-blur-sm lg:items-center lg:justify-center lg:p-6">
          <div className="max-h-[94dvh] w-full overflow-y-auto rounded-t-3xl border border-zinc-800 bg-zinc-950 p-5 text-white lg:max-w-4xl lg:rounded-3xl lg:p-6">
            <div className="sticky top-0 z-10 -mx-1 mb-5 flex items-center justify-between bg-zinc-950/95 px-1 pb-3 backdrop-blur">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
                  Produto
                </p>
                <h2 className="text-xl font-black">Editar cardápio</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-zinc-900 p-2 text-zinc-300"
                aria-label="Fechar edição do produto"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              <section className="space-y-4">
                <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-black">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-48 w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-48 place-items-center bg-zinc-900">
                      <Store className="h-12 w-12 text-zinc-700" />
                    </div>
                  )}
                  <div className="p-4">
                    <p className="font-black">{draft.name || "Produto"}</p>
                    <p className="mt-1 line-clamp-3 text-xs text-zinc-500">
                      {draft.description || "Sem descrição"}
                    </p>
                    <p className="mt-3 text-lg font-black text-primary">
                      {money(Number(draft.price) || 0)}
                    </p>
                  </div>
                </div>

                <label className="block rounded-2xl border border-dashed border-zinc-800 bg-black p-4 text-center text-xs font-bold text-zinc-400">
                  <ImagePlus className="mx-auto mb-2 h-5 w-5 text-primary" />
                  {busy === "image" ? "Enviando imagem..." : "Trocar imagem"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy === "image"}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </section>

              <section className="space-y-3 rounded-2xl border border-zinc-900 bg-black p-4">
                <h3 className="font-black">Dados do produto</h3>
                <label className="block text-xs font-bold text-zinc-500">
                  Nome
                  <input
                    value={draft.name}
                    maxLength={120}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-white outline-none focus:border-primary"
                  />
                </label>
                <label className="block text-xs font-bold text-zinc-500">
                  Descrição
                  <textarea
                    value={draft.description}
                    maxLength={1000}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, description: event.target.value }))
                    }
                    className="mt-1 min-h-24 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-white outline-none focus:border-primary"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-bold text-zinc-500">
                    Preço
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.price}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, price: event.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-white outline-none focus:border-primary"
                    />
                  </label>
                  <label className="block text-xs font-bold text-zinc-500">
                    Categoria
                    <select
                      value={draft.categoryId}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, categoryId: event.target.value }))
                      }
                      className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-white outline-none focus:border-primary"
                    >
                      <option value="">Sem categoria</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <Button
                  type="button"
                  onClick={saveProduct}
                  disabled={busy === "product"}
                  className="w-full"
                >
                  {busy === "product" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Salvar produto
                </Button>
              </section>
            </div>

            <section className="mt-6 rounded-2xl border border-zinc-900 bg-black p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-black">Adicionais e opções</h3>
                  <p className="text-xs text-zinc-500">
                    Configure escolhas obrigatórias, extras e acréscimos de preço.
                  </p>
                </div>
              </div>

              {loadingOptions ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Carregando adicionais...
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {groups.map((group) => (
                    <div
                      key={group.id}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold">{group.name}</p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                                group.is_active
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-zinc-800 text-zinc-500"
                              }`}
                            >
                              {group.is_active ? "Ativo" : "Pausado"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            Mín. {group.min_selections} · Máx. {group.max_selections}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void createOption(group)}
                            disabled={busy !== null}
                            className="border-zinc-800 bg-black"
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" /> Opção
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void editGroup(group)}
                            disabled={busy !== null}
                            className="border-zinc-800 bg-black"
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void toggleGroup(group)}
                            disabled={busy !== null}
                            className="border-zinc-800 bg-black"
                          >
                            {group.is_active ? "Pausar" : "Ativar"}
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => void deleteGroup(group)}
                            disabled={busy !== null}
                            className="text-red-400"
                            aria-label={`Excluir grupo ${group.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {(optionsByGroup.get(group.id) ?? []).map((option) => (
                          <div
                            key={option.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-900 bg-black px-3 py-2.5"
                          >
                            <div>
                              <p
                                className={
                                  option.is_available
                                    ? "text-sm font-semibold"
                                    : "text-sm font-semibold text-zinc-600"
                                }
                              >
                                {option.name}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {option.price_delta > 0
                                  ? `+ ${money(option.price_delta)}`
                                  : "Sem acréscimo"}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void editOption(option)}
                                disabled={busy !== null}
                                className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-bold text-zinc-300 disabled:opacity-50"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => void toggleOption(option)}
                                disabled={busy !== null}
                                className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-bold text-zinc-300 disabled:opacity-50"
                              >
                                {option.is_available ? "Pausar" : "Ativar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteOption(option)}
                                disabled={busy !== null}
                                className="rounded-lg bg-red-500/10 p-1.5 text-red-400 disabled:opacity-50"
                                aria-label={`Excluir opção ${option.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {(optionsByGroup.get(group.id) ?? []).length === 0 ? (
                          <p className="rounded-xl border border-dashed border-zinc-900 p-3 text-xs text-zinc-600">
                            Nenhuma opção cadastrada neste grupo.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}

                  {groups.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-zinc-800 p-5 text-center text-sm text-zinc-500">
                      Este produto ainda não possui adicionais.
                    </p>
                  ) : null}

                  <div className="grid gap-3 rounded-2xl border border-primary/15 bg-primary/5 p-4 sm:grid-cols-[1fr_90px_90px_auto] sm:items-end">
                    <label className="text-xs font-bold text-zinc-500">
                      Novo grupo
                      <input
                        value={groupDraft.name}
                        onChange={(event) =>
                          setGroupDraft((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="Ex.: Escolha o molho"
                        className="mt-1 w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-primary"
                      />
                    </label>
                    <label className="text-xs font-bold text-zinc-500">
                      Mínimo
                      <input
                        type="number"
                        min="0"
                        value={groupDraft.min}
                        onChange={(event) =>
                          setGroupDraft((current) => ({ ...current, min: event.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-primary"
                      />
                    </label>
                    <label className="text-xs font-bold text-zinc-500">
                      Máximo
                      <input
                        type="number"
                        min="1"
                        value={groupDraft.max}
                        onChange={(event) =>
                          setGroupDraft((current) => ({ ...current, max: event.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-primary"
                      />
                    </label>
                    <Button
                      type="button"
                      onClick={createGroup}
                      disabled={busy === "group:create" || !groupDraft.name.trim()}
                    >
                      {busy === "group:create" ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-1 h-4 w-4" />
                      )}
                      Criar
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}
      {confirmDialog}
      {promptDialog}
    </>
  );
}
