import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Settings2, X } from "lucide-react";
import { requireSupabase } from "./supabase";

type Membership = { merchant_id: string; role: string; status: string };
type Product = { id: string; name: string; is_available: boolean };
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

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function CatalogOptionsPortal() {
  const [membership, setMembership] = useState<Membership | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState({ name: "", min: "0", max: "1" });

  const loadIdentity = useCallback(async () => {
    const client = requireSupabase();
    const { data: auth } = await client.auth.getSession();
    const user = auth.session?.user;
    if (!user) {
      setMembership(null);
      return;
    }
    const { data } = await client
      .from("merchant_members")
      .select("merchant_id,role,status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    const member = data as Membership | null;
    setMembership(member);
    if (!member || !["owner", "manager"].includes(member.role)) return;
    const { data: rows } = await client
      .from("products")
      .select("id,name,is_available")
      .eq("merchant_id", member.merchant_id)
      .order("sort_order");
    const productRows = (rows ?? []) as Product[];
    setProducts(productRows);
    setProductId((current) => current || productRows[0]?.id || "");
  }, []);

  useEffect(() => {
    void loadIdentity();
    const client = requireSupabase();
    const { data: listener } = client.auth.onAuthStateChange(() => void loadIdentity());
    return () => listener.subscription.unsubscribe();
  }, [loadIdentity]);

  const loadOptions = useCallback(async () => {
    if (!productId) {
      setGroups([]);
      setOptions([]);
      return;
    }
    setLoading(true);
    setMessage(null);
    const client = requireSupabase();
    const { data: groupRows, error: groupError } = await client
      .from("product_option_groups")
      .select("id,product_id,name,description,min_selections,max_selections,sort_order,is_active")
      .eq("product_id", productId)
      .order("sort_order");
    if (groupError) {
      setMessage("Não foi possível carregar os grupos de adicionais.");
      setLoading(false);
      return;
    }
    const normalizedGroups = (groupRows ?? []) as OptionGroup[];
    setGroups(normalizedGroups);
    const ids = normalizedGroups.map((group) => group.id);
    if (ids.length === 0) {
      setOptions([]);
      setLoading(false);
      return;
    }
    const { data: optionRows, error: optionError } = await client
      .from("product_options")
      .select("id,option_group_id,name,description,price_delta,sort_order,is_available")
      .in("option_group_id", ids)
      .order("sort_order");
    if (optionError) setMessage("Não foi possível carregar os adicionais.");
    setOptions(
      ((optionRows ?? []) as ProductOption[]).map((option) => ({
        ...option,
        price_delta: Number(option.price_delta),
      })),
    );
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    if (open) void loadOptions();
  }, [loadOptions, open]);

  if (!membership || !["owner", "manager"].includes(membership.role)) return null;

  const createGroup = async (event: FormEvent) => {
    event.preventDefault();
    const min = Number(groupForm.min);
    const max = Number(groupForm.max);
    if (!productId || !groupForm.name.trim() || !Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || min > max) {
      setMessage("Revise o nome e os limites de seleção do grupo.");
      return;
    }
    const { error } = await requireSupabase().from("product_option_groups").insert({
      product_id: productId,
      name: groupForm.name.trim(),
      min_selections: min,
      max_selections: max,
      sort_order: groups.length,
      is_active: true,
    });
    if (error) setMessage(error.message);
    else {
      setGroupForm({ name: "", min: "0", max: "1" });
      await loadOptions();
    }
  };

  const toggleGroup = async (group: OptionGroup) => {
    const { error } = await requireSupabase()
      .from("product_option_groups")
      .update({ is_active: !group.is_active })
      .eq("id", group.id);
    if (error) setMessage(error.message);
    await loadOptions();
  };

  const editGroup = async (group: OptionGroup) => {
    const name = window.prompt("Nome do grupo:", group.name)?.trim();
    if (!name) return;
    const minText = window.prompt("Seleções mínimas:", String(group.min_selections));
    const maxText = window.prompt("Seleções máximas:", String(group.max_selections));
    if (minText === null || maxText === null) return;
    const min = Number(minText);
    const max = Number(maxText);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || min > max) {
      setMessage("Limites de seleção inválidos.");
      return;
    }
    const { error } = await requireSupabase()
      .from("product_option_groups")
      .update({ name, min_selections: min, max_selections: max })
      .eq("id", group.id);
    if (error) setMessage(error.message);
    await loadOptions();
  };

  const addOption = async (group: OptionGroup) => {
    const name = window.prompt(`Nome do adicional em “${group.name}”:`)?.trim();
    if (!name) return;
    const priceText = window.prompt("Acréscimo de preço (0 para grátis):", "0,00");
    if (priceText === null) return;
    const price = Number(priceText.replace(",", "."));
    if (!Number.isFinite(price) || price < 0) {
      setMessage("Preço inválido.");
      return;
    }
    const groupOptions = options.filter((option) => option.option_group_id === group.id);
    const { error } = await requireSupabase().from("product_options").insert({
      option_group_id: group.id,
      name,
      price_delta: price,
      sort_order: groupOptions.length,
      is_available: true,
    });
    if (error) setMessage(error.message);
    await loadOptions();
  };

  const editOption = async (option: ProductOption) => {
    const name = window.prompt("Nome do adicional:", option.name)?.trim();
    if (!name) return;
    const priceText = window.prompt("Acréscimo de preço:", option.price_delta.toFixed(2).replace(".", ","));
    if (priceText === null) return;
    const price = Number(priceText.replace(",", "."));
    if (!Number.isFinite(price) || price < 0) {
      setMessage("Preço inválido.");
      return;
    }
    const { error } = await requireSupabase()
      .from("product_options")
      .update({ name, price_delta: price })
      .eq("id", option.id);
    if (error) setMessage(error.message);
    await loadOptions();
  };

  const toggleOption = async (option: ProductOption) => {
    const { error } = await requireSupabase()
      .from("product_options")
      .update({ is_available: !option.is_available })
      .eq("id", option.id);
    if (error) setMessage(error.message);
    await loadOptions();
  };

  return (
    <>
      <button
        type="button"
        className="primary"
        onClick={() => setOpen(true)}
        style={{ position: "fixed", right: 22, bottom: 22, zIndex: 70, boxShadow: "0 12px 35px rgba(0,0,0,.45)" }}
      >
        <Settings2 size={16} /> Gerenciar adicionais
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Gerenciar adicionais"
          style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,.78)", display: "grid", placeItems: "center", padding: 18 }}
        >
          <div className="card section" style={{ width: "min(980px,100%)", maxHeight: "92vh", overflow: "auto" }}>
            <div className="section-title">
              <div>
                <h2>Adicionais e personalizações</h2>
                <p className="muted">Gerencie tamanhos, complementos, extras e regras de seleção.</p>
              </div>
              <button type="button" className="secondary" onClick={() => setOpen(false)} aria-label="Fechar">
                <X size={16} /> Fechar
              </button>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label>Produto</label>
              <select value={productId} onChange={(event) => setProductId(event.target.value)}>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}{product.is_available ? "" : " (indisponível)"}
                  </option>
                ))}
              </select>
            </div>

            {message && <div className="error" style={{ marginBottom: 12 }}>{message}</div>}
            {loading && <p className="muted">Atualizando adicionais...</p>}

            <form className="card section" onSubmit={createGroup} style={{ marginBottom: 14 }}>
              <div className="section-title"><h2>Novo grupo</h2></div>
              <div className="form-grid">
                <div className="field"><label>Nome</label><input required placeholder="Ex.: Complementos" value={groupForm.name} onChange={(event) => setGroupForm({ ...groupForm, name: event.target.value })} /></div>
                <div className="field"><label>Mínimo</label><input type="number" min="0" value={groupForm.min} onChange={(event) => setGroupForm({ ...groupForm, min: event.target.value })} /></div>
                <div className="field"><label>Máximo</label><input type="number" min="1" value={groupForm.max} onChange={(event) => setGroupForm({ ...groupForm, max: event.target.value })} /></div>
              </div>
              <button className="primary" style={{ marginTop: 10 }} disabled={!productId}><Plus size={15} /> Criar grupo</button>
            </form>

            <div className="stack">
              {groups.map((group) => (
                <section className="card section" key={group.id}>
                  <div className="section-title">
                    <div>
                      <h2>{group.name}</h2>
                      <span className="muted">Escolha {group.min_selections}–{group.max_selections}</span>
                    </div>
                    <div className="actions">
                      <button type="button" className="secondary" onClick={() => void editGroup(group)}>Editar regra</button>
                      <button type="button" className={`toggle ${group.is_active ? "on" : ""}`} onClick={() => void toggleGroup(group)}>
                        {group.is_active ? "Ativo" : "Inativo"}
                      </button>
                      <button type="button" className="primary" onClick={() => void addOption(group)}><Plus size={14} /> Opção</button>
                    </div>
                  </div>

                  <div className="list">
                    {options.filter((option) => option.option_group_id === group.id).map((option) => (
                      <div className="list-item" key={option.id}>
                        <div><b>{option.name}</b><div className="muted">+ {money(option.price_delta)}</div></div>
                        <div className="actions">
                          <button type="button" className="secondary" onClick={() => void editOption(option)}>Editar</button>
                          <button type="button" className={`toggle ${option.is_available ? "on" : ""}`} onClick={() => void toggleOption(option)}>
                            {option.is_available ? "Disponível" : "Indisponível"}
                          </button>
                        </div>
                      </div>
                    ))}
                    {options.filter((option) => option.option_group_id === group.id).length === 0 && <div className="empty">Nenhuma opção neste grupo.</div>}
                  </div>
                </section>
              ))}
              {groups.length === 0 && !loading && <div className="empty">Este produto ainda não possui grupos de personalização.</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
