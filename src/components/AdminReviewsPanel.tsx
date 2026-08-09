import { Loader2, MessageSquareText, RefreshCw, Search, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard } from "@/components/WorkspaceShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Review = {
  id: string;
  order_id: string;
  customer_user_id: string;
  merchant_id: string;
  courier_id: string | null;
  merchant_rating: number | null;
  courier_rating: number | null;
  comment: string | null;
  created_at: string;
  merchants?: { name?: string | null } | null;
  orders?: { order_number?: number | string | null } | null;
};

type Courier = { id: string; user_id: string };
type Profile = { id: string; full_name: string | null };

const from = (table: string) => (supabase.from as any)(table);
const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

function average(values: Array<number | null>) {
  const valid = values.filter((value): value is number => Number.isFinite(value));
  if (valid.length === 0) return "—";
  return (valid.reduce((sum, value) => sum + value, 0) / valid.length)
    .toFixed(2)
    .replace(".", ",");
}

function Rating({ value }: { value: number | null }) {
  if (!value) return <span className="text-zinc-700">—</span>;
  return (
    <span className="inline-flex items-center gap-1 font-black text-primary">
      <Star className="h-3.5 w-3.5 fill-current" />
      {value}
    </span>
  );
}

export function AdminReviewsPanel() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "critical" | "commented">("all");

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const [reviewsRes, couriersRes, profilesRes] = await Promise.all([
        from("reviews")
          .select("*, merchants(name), orders(order_number)")
          .order("created_at", { ascending: false })
          .limit(500),
        from("couriers").select("id,user_id"),
        from("profiles").select("id,full_name"),
      ]);
      const firstError = [reviewsRes, couriersRes, profilesRes].find((result) => result.error)?.error;
      if (firstError) throw firstError;
      setReviews((reviewsRes.data ?? []) as Review[]);
      setCouriers((couriersRes.data ?? []) as Courier[]);
      setProfiles((profilesRes.data ?? []) as Profile[]);
    } catch (error: any) {
      console.error("admin reviews load failed", error);
      toast.error(error?.message || "Não foi possível carregar as avaliações.");
      if (!quiet) setReviews([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const courierById = useMemo(() => new Map(couriers.map((row) => [row.id, row])), [couriers]);
  const profileById = useMemo(() => new Map(profiles.map((row) => [row.id, row])), [profiles]);
  const customerById = profileById;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return reviews.filter((review) => {
      const courier = review.courier_id ? courierById.get(review.courier_id) : null;
      const courierName = courier ? profileById.get(courier.user_id)?.full_name ?? "" : "";
      const customerName = customerById.get(review.customer_user_id)?.full_name ?? "";
      const searchable = [
        review.merchants?.name,
        review.orders?.order_number,
        review.comment,
        courierName,
        customerName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (normalized && !searchable.includes(normalized)) return false;
      if (filter === "critical") {
        const ratings = [review.merchant_rating, review.courier_rating].filter(
          (value): value is number => typeof value === "number",
        );
        return ratings.some((value) => value <= 2);
      }
      if (filter === "commented") return Boolean(review.comment?.trim());
      return true;
    });
  }, [courierById, customerById, filter, profileById, query, reviews]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-3xl border border-zinc-900 bg-zinc-950 py-20 text-sm text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        Carregando avaliações...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Qualidade</p>
          <h2 className="mt-1 text-xl font-black">Avaliações da plataforma</h2>
          <p className="mt-1 text-xs text-zinc-500">Visão administrativa de notas e comentários vinculados a pedidos concluídos.</p>
        </div>
        <Button type="button" variant="outline" disabled={refreshing} onClick={() => void load(true)} className="border-zinc-800 bg-zinc-950">
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Avaliações" value={reviews.length} />
        <MetricCard label="Média estabelecimentos" value={average(reviews.map((review) => review.merchant_rating))} />
        <MetricCard label="Média entregadores" value={average(reviews.map((review) => review.courier_rating))} />
        <MetricCard label="Com comentários" value={reviews.filter((review) => Boolean(review.comment?.trim())).length} />
      </div>

      <section className="rounded-3xl border border-zinc-900 bg-zinc-950 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar avaliações</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por pedido, cliente, estabelecimento, entregador ou comentário"
              className="w-full rounded-xl border border-zinc-800 bg-black py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-primary"
            />
          </label>
          <div className="flex flex-wrap gap-2" aria-label="Filtros de avaliação">
            {[
              ["all", "Todas"],
              ["critical", "Notas 1–2"],
              ["commented", "Com comentário"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id as typeof filter)}
                className={`rounded-xl border px-3 py-2 text-xs font-black ${filter === id ? "border-primary bg-primary/10 text-primary" : "border-zinc-800 text-zinc-500"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {filtered.length === 0 ? (
        <EmptyState title="Nenhuma avaliação encontrada" description="Ajuste os filtros ou aguarde novos pedidos avaliados." />
      ) : (
        <div className="space-y-3">
          {filtered.map((review) => {
            const courier = review.courier_id ? courierById.get(review.courier_id) : null;
            const courierName = courier ? profileById.get(courier.user_id)?.full_name ?? null : null;
            const customerName = customerById.get(review.customer_user_id)?.full_name ?? null;
            const critical = [review.merchant_rating, review.courier_rating].some(
              (value) => typeof value === "number" && value <= 2,
            );
            return (
              <article key={review.id} className={`rounded-2xl border p-4 ${critical ? "border-red-500/20 bg-red-500/[0.04]" : "border-zinc-900 bg-zinc-950"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black">Pedido #{review.orders?.order_number ?? review.order_id.slice(0, 8)}</p>
                    <p className="mt-1 text-xs text-zinc-500">{review.merchants?.name ?? "Estabelecimento"} · {dateTime(review.created_at)}</p>
                  </div>
                  {critical ? <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-[10px] font-black uppercase text-red-300">Atenção</span> : null}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-black p-3">
                    <p className="text-[10px] font-black uppercase text-zinc-600">Estabelecimento</p>
                    <p className="mt-1"><Rating value={review.merchant_rating} /></p>
                  </div>
                  <div className="rounded-xl bg-black p-3">
                    <p className="text-[10px] font-black uppercase text-zinc-600">Entregador</p>
                    <p className="mt-1"><Rating value={review.courier_rating} /></p>
                    <p className="mt-1 truncate text-[10px] text-zinc-600">{courierName ?? "Não atribuído"}</p>
                  </div>
                  <div className="rounded-xl bg-black p-3 sm:col-span-2">
                    <p className="text-[10px] font-black uppercase text-zinc-600">Cliente</p>
                    <p className="mt-1 text-sm font-bold">{customerName ?? `#${review.customer_user_id.slice(0, 8)}`}</p>
                  </div>
                </div>
                {review.comment?.trim() ? (
                  <div className="mt-3 flex gap-2 rounded-xl bg-black p-3 text-sm text-zinc-300">
                    <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="leading-relaxed">{review.comment}</p>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
