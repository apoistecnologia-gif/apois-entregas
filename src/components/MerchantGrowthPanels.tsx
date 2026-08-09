import { BadgePercent, Loader2, Star, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard } from "@/components/WorkspaceShell";
import { toast } from "sonner";

type Promotion = {
  id: string;
  merchant_id: string;
  name: string;
  description: string | null;
  discount_type: "percent" | "fixed" | string;
  discount_value: number;
  minimum_order: number;
  product_id: string | null;
  menu_category_id: string | null;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
  usage_limit: number | null;
};

type ProductRef = { id: string; name: string };
type CategoryRef = { id: string; name: string };

type MerchantOrder = {
  id: string;
  customer_user_id?: string | null;
  order_number?: number | string | null;
  total?: number | string | null;
  status?: string | null;
  created_at?: string | null;
};

type MerchantReview = {
  id: string;
  order_id?: string | null;
  merchant_rating?: number | null;
  comment?: string | null;
  created_at?: string | null;
};

const money = (value: unknown) =>
  `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;

const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

const toLocalDateTimeInput = (date: Date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

export function MerchantPromotionsPanel({
  merchantId,
  products,
  categories,
}: {
  merchantId: string;
  products: ProductRef[];
  categories: CategoryRef[];
}) {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => {
    const now = new Date();
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return {
      name: "",
      description: "",
      discountType: "percent",
      discountValue: "",
      minimumOrder: "0",
      target: "all",
      startsAt: toLocalDateTimeInput(now),
      endsAt: toLocalDateTimeInput(end),
      usageLimit: "",
    };
  });

  const loadPromotions = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from as any)("promotions")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Não foi possível carregar as promoções.");
      setPromotions([]);
    } else {
      setPromotions((data ?? []) as Promotion[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadPromotions();
  }, [merchantId]);

  const createPromotion = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(draft.discountValue);
    const minimumOrder = Number(draft.minimumOrder || 0);
    const usageLimit = draft.usageLimit.trim() ? Number(draft.usageLimit) : null;
    const startsAt = new Date(draft.startsAt);
    const endsAt = new Date(draft.endsAt);

    if (!draft.name.trim()) return toast.error("Informe o nome da promoção.");
    if (!Number.isFinite(value) || value <= 0)
      return toast.error("Informe um desconto maior que zero.");
    if (draft.discountType === "percent" && value > 100)
      return toast.error("O desconto percentual não pode ultrapassar 100%.");
    if (!Number.isFinite(minimumOrder) || minimumOrder < 0)
      return toast.error("Pedido mínimo inválido.");
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)
      return toast.error("O período da promoção é inválido.");
    if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit <= 0))
      return toast.error("O limite de usos precisa ser um inteiro maior que zero.");

    const productId = draft.target.startsWith("product:") ? draft.target.slice(8) : null;
    const categoryId = draft.target.startsWith("category:") ? draft.target.slice(9) : null;

    setBusy("create");
    const { error } = await (supabase.from as any)("promotions").insert({
      merchant_id: merchantId,
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      discount_type: draft.discountType,
      discount_value: value,
      minimum_order: minimumOrder,
      product_id: productId,
      menu_category_id: categoryId,
      is_active: true,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      usage_limit: usageLimit,
    });
    setBusy(null);
    if (error) return toast.error(error.message || "Não foi possível criar a promoção.");
    toast.success("Promoção criada.");
    setDraft((current) => ({ ...current, name: "", description: "", discountValue: "" }));
    await loadPromotions();
  };

  const togglePromotion = async (promotion: Promotion) => {
    setBusy(`toggle:${promotion.id}`);
    const { error } = await (supabase.from as any)("promotions")
      .update({ is_active: !promotion.is_active })
      .eq("id", promotion.id)
      .eq("merchant_id", merchantId);
    setBusy(null);
    if (error) return toast.error(error.message || "Não foi possível alterar a promoção.");
    await loadPromotions();
  };

  const deletePromotion = async (promotion: Promotion) => {
    if (!window.confirm(`Excluir a promoção “${promotion.name}”?`)) return;
    setBusy(`delete:${promotion.id}`);
    const { error } = await (supabase.from as any)("promotions")
      .delete()
      .eq("id", promotion.id)
      .eq("merchant_id", merchantId);
    setBusy(null);
    if (error) return toast.error(error.message || "Não foi possível excluir a promoção.");
    toast.success("Promoção excluída.");
    await loadPromotions();
  };

  const targetLabel = (promotion: Promotion) => {
    if (promotion.product_id)
      return (
        products.find((item) => item.id === promotion.product_id)?.name ?? "Produto específico"
      );
    if (promotion.menu_category_id)
      return (
        categories.find((item) => item.id === promotion.menu_category_id)?.name ??
        "Categoria específica"
      );
    return "Todo o cardápio";
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <form
        onSubmit={createPromotion}
        className="space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-5"
      >
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-primary">Nova promoção</p>
          <h2 className="mt-1 font-black">Criar oferta comercial</h2>
          <p className="mt-1 text-xs text-zinc-500">
            O período, o alvo e o desconto ficam persistidos no backend.
          </p>
        </div>
        <Field label="Nome">
          <input
            value={draft.name}
            maxLength={120}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            className="control"
            placeholder="Ex.: Semana do hambúrguer"
          />
        </Field>
        <Field label="Descrição">
          <textarea
            value={draft.description}
            maxLength={500}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            className="control min-h-20 resize-y"
            placeholder="Opcional"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <select
              value={draft.discountType}
              onChange={(event) => setDraft({ ...draft, discountType: event.target.value })}
              className="control"
            >
              <option value="percent">Percentual</option>
              <option value="fixed">Valor fixo</option>
            </select>
          </Field>
          <Field label={draft.discountType === "percent" ? "Desconto (%)" : "Desconto (R$)"}>
            <input
              value={draft.discountValue}
              onChange={(event) => setDraft({ ...draft, discountValue: event.target.value })}
              inputMode="decimal"
              className="control"
              placeholder="0"
            />
          </Field>
        </div>
        <Field label="Aplicar em">
          <select
            value={draft.target}
            onChange={(event) => setDraft({ ...draft, target: event.target.value })}
            className="control"
          >
            <option value="all">Todo o cardápio</option>
            {categories.map((category) => (
              <option key={category.id} value={`category:${category.id}`}>
                Categoria · {category.name}
              </option>
            ))}
            {products.map((product) => (
              <option key={product.id} value={`product:${product.id}`}>
                Produto · {product.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início">
            <input
              type="datetime-local"
              value={draft.startsAt}
              onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
              className="control"
            />
          </Field>
          <Field label="Fim">
            <input
              type="datetime-local"
              value={draft.endsAt}
              onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })}
              className="control"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pedido mínimo">
            <input
              value={draft.minimumOrder}
              onChange={(event) => setDraft({ ...draft, minimumOrder: event.target.value })}
              inputMode="decimal"
              className="control"
            />
          </Field>
          <Field label="Limite de usos">
            <input
              value={draft.usageLimit}
              onChange={(event) => setDraft({ ...draft, usageLimit: event.target.value })}
              inputMode="numeric"
              className="control"
              placeholder="Sem limite"
            />
          </Field>
        </div>
        <Button disabled={busy === "create"} className="h-12 w-full font-black">
          {busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Criar promoção
        </Button>
      </form>

      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Promoções</h2>
            <p className="text-xs text-zinc-500">Ative ou pause ofertas sem apagar o histórico.</p>
          </div>
          <BadgePercent className="h-5 w-5 text-primary" />
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Carregando promoções...
          </div>
        ) : promotions.length === 0 ? (
          <EmptyState
            title="Nenhuma promoção cadastrada"
            description="Crie a primeira oferta ao lado."
          />
        ) : (
          <div className="space-y-3">
            {promotions.map((promotion) => (
              <article
                key={promotion.id}
                className="rounded-2xl border border-zinc-900 bg-black p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-white">{promotion.name}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${promotion.is_active ? "bg-emerald-500/10 text-emerald-300" : "bg-zinc-800 text-zinc-500"}`}
                      >
                        {promotion.is_active ? "Ativa" : "Pausada"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{targetLabel(promotion)}</p>
                  </div>
                  <p className="shrink-0 text-lg font-black text-primary">
                    {promotion.discount_type === "percent"
                      ? `${Number(promotion.discount_value).toLocaleString("pt-BR")}%`
                      : money(promotion.discount_value)}
                  </p>
                </div>
                {promotion.description ? (
                  <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                    {promotion.description}
                  </p>
                ) : null}
                <div className="mt-3 grid gap-2 text-[10px] text-zinc-500 sm:grid-cols-2">
                  <span>Início: {dateTime(promotion.starts_at)}</span>
                  <span>Fim: {dateTime(promotion.ends_at)}</span>
                  <span>Pedido mínimo: {money(promotion.minimum_order)}</span>
                  <span>Limite: {promotion.usage_limit ?? "sem limite"}</span>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy === `toggle:${promotion.id}`}
                    onClick={() => void togglePromotion(promotion)}
                    className="flex-1"
                  >
                    {busy === `toggle:${promotion.id}` ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {promotion.is_active ? "Pausar" : "Ativar"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy === `delete:${promotion.id}`}
                    onClick={() => void deletePromotion(promotion)}
                    aria-label={`Excluir promoção ${promotion.name}`}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function MerchantCustomersPanel({ orders }: { orders: MerchantOrder[] }) {
  const customers = useMemo(() => {
    const grouped = new Map<
      string,
      { id: string; orders: number; validOrders: number; total: number; lastAt: string | null }
    >();
    for (const order of orders) {
      const customerId = order.customer_user_id;
      if (!customerId) continue;
      const current = grouped.get(customerId) ?? {
        id: customerId,
        orders: 0,
        validOrders: 0,
        total: 0,
        lastAt: null,
      };
      current.orders += 1;
      if (!new Set(["cancelled", "refunded"]).has(String(order.status ?? ""))) {
        current.validOrders += 1;
        current.total += Number(order.total ?? 0);
      }
      if (!current.lastAt || new Date(order.created_at ?? 0) > new Date(current.lastAt))
        current.lastAt = order.created_at ?? current.lastAt;
      grouped.set(customerId, current);
    }
    return [...grouped.values()].sort(
      (a, b) => new Date(b.lastAt ?? 0).getTime() - new Date(a.lastAt ?? 0).getTime(),
    );
  }, [orders]);

  const totalRevenue = customers.reduce((sum, customer) => sum + customer.total, 0);
  const totalValidOrders = customers.reduce((sum, customer) => sum + customer.validOrders, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Clientes no histórico" value={customers.length} />
        <MetricCard label="Pedidos válidos" value={totalValidOrders} />
        <MetricCard
          label="Ticket médio"
          value={money(totalValidOrders ? totalRevenue / totalValidOrders : 0)}
        />
      </div>
      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Clientes do estabelecimento</h2>
            <p className="text-xs text-zinc-500">
              Exibe somente métricas operacionais derivadas dos pedidos deste estabelecimento.
            </p>
          </div>
          <Users className="h-5 w-5 text-primary" />
        </div>
        {customers.length === 0 ? (
          <EmptyState
            title="Sem clientes no histórico"
            description="Os clientes aparecerão após os primeiros pedidos."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-zinc-600">
                <tr>
                  <th className="pb-3">Cliente</th>
                  <th className="pb-3">Pedidos</th>
                  <th className="pb-3">Volume válido</th>
                  <th className="pb-3">Ticket médio</th>
                  <th className="pb-3">Último pedido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td className="py-3 font-bold text-zinc-200">
                      Cliente #{customer.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="py-3 text-zinc-400">{customer.orders}</td>
                    <td className="py-3 text-zinc-400">{money(customer.total)}</td>
                    <td className="py-3 text-zinc-400">
                      {money(customer.validOrders ? customer.total / customer.validOrders : 0)}
                    </td>
                    <td className="py-3 text-zinc-500">{dateTime(customer.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function MerchantReviewsPanel({
  reviews,
  rating,
  reviewCount,
}: {
  reviews: MerchantReview[];
  rating: number;
  reviewCount: number;
}) {
  const [ratingFilter, setRatingFilter] = useState("all");
  const filtered = useMemo(
    () =>
      ratingFilter === "all"
        ? reviews
        : reviews.filter((review) => Number(review.merchant_rating ?? 0) === Number(ratingFilter)),
    [ratingFilter, reviews],
  );

  const distribution = useMemo(
    () =>
      [5, 4, 3, 2, 1].map((score) => ({
        score,
        count: reviews.filter((review) => Number(review.merchant_rating ?? 0) === score).length,
      })),
    [reviews],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Média atual" value={`${Number(rating || 0).toFixed(1)} ★`} />
        <MetricCard label="Avaliações registradas" value={reviewCount} />
        <MetricCard
          label="5 estrelas recentes"
          value={distribution.find((item) => item.score === 5)?.count ?? 0}
        />
      </div>
      <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-black">Avaliações dos clientes</h2>
            <p className="text-xs text-zinc-500">Comentários vinculados a pedidos concluídos.</p>
          </div>
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" />
            <select
              value={ratingFilter}
              onChange={(event) => setRatingFilter(event.target.value)}
              className="rounded-xl border border-zinc-800 bg-black px-3 py-2 text-xs text-white"
              aria-label="Filtrar avaliações por nota"
            >
              <option value="all">Todas as notas</option>
              {[5, 4, 3, 2, 1].map((score) => (
                <option key={score} value={score}>
                  {score} estrelas
                </option>
              ))}
            </select>
          </div>
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            title="Nenhuma avaliação neste filtro"
            description="As avaliações concluídas aparecerão aqui."
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((review) => (
              <article key={review.id} className="rounded-2xl border border-zinc-900 bg-black p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black text-primary">{review.merchant_rating ?? "—"}/5 ★</p>
                  <p className="text-[10px] text-zinc-600">{dateTime(review.created_at)}</p>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {review.comment?.trim() || "Sem comentário."}
                </p>
                {review.order_id ? (
                  <p className="mt-2 text-[10px] text-zinc-600">
                    Pedido {review.order_id.slice(0, 8).toUpperCase()}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-bold text-zinc-500">
      {label}
      <div className="mt-1.5 [&_.control]:w-full [&_.control]:rounded-xl [&_.control]:border [&_.control]:border-zinc-800 [&_.control]:bg-black [&_.control]:px-3 [&_.control]:py-2.5 [&_.control]:text-sm [&_.control]:text-white [&_.control]:outline-none [&_.control]:focus:border-primary">
        {children}
      </div>
    </label>
  );
}
