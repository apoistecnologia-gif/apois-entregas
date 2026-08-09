import { Copy, Loader2, Tag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard } from "@/components/WorkspaceShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Coupon = {
  id: string;
  merchant_id: string | null;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number | string;
  minimum_order: number | string;
  max_discount: number | string | null;
  usage_limit: number | null;
  usage_limit_per_user: number | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

type Redemption = { coupon_id: string };

const from = (table: string) => (supabase.from as any)(table);
const money = (value: unknown) =>
  `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;
const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "Sem limite";
const toLocalDateTimeInput = (date: Date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

export function MerchantCouponsPanel({ merchantId }: { merchantId: string }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      code: "",
      discountType: "percent",
      discountValue: "",
      minimumOrder: "0",
      maxDiscount: "",
      usageLimit: "",
      usageLimitPerUser: "1",
      startsAt: toLocalDateTimeInput(now),
      endsAt: toLocalDateTimeInput(end),
    };
  });

  const load = async () => {
    setLoading(true);
    const couponsResult = await from("coupons")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false });
    if (couponsResult.error) {
      toast.error("Não foi possível carregar os cupons.");
      setCoupons([]);
      setRedemptions([]);
      setLoading(false);
      return;
    }
    const nextCoupons = (couponsResult.data ?? []) as Coupon[];
    setCoupons(nextCoupons);
    if (nextCoupons.length === 0) {
      setRedemptions([]);
      setLoading(false);
      return;
    }
    const redemptionResult = await from("coupon_redemptions")
      .select("coupon_id")
      .in(
        "coupon_id",
        nextCoupons.map((coupon) => coupon.id),
      );
    if (redemptionResult.error) {
      console.warn("Não foi possível carregar os usos dos cupons:", redemptionResult.error.code);
      setRedemptions([]);
    } else {
      setRedemptions((redemptionResult.data ?? []) as Redemption[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [merchantId]);

  const usageByCoupon = useMemo(() => {
    const map = new Map<string, number>();
    for (const redemption of redemptions)
      map.set(redemption.coupon_id, (map.get(redemption.coupon_id) ?? 0) + 1);
    return map;
  }, [redemptions]);

  const activeCount = coupons.filter((coupon) => coupon.is_active).length;
  const totalUses = redemptions.length;

  const createCoupon = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const code = draft.code.trim().toUpperCase().replace(/\s+/g, "-");
    const discountValue = Number(draft.discountValue);
    const minimumOrder = Number(draft.minimumOrder || 0);
    const maxDiscount = draft.maxDiscount.trim() ? Number(draft.maxDiscount) : null;
    const usageLimit = draft.usageLimit.trim() ? Number(draft.usageLimit) : null;
    const usageLimitPerUser = draft.usageLimitPerUser.trim()
      ? Number(draft.usageLimitPerUser)
      : null;
    const startsAt = draft.startsAt ? new Date(draft.startsAt) : null;
    const endsAt = draft.endsAt ? new Date(draft.endsAt) : null;

    if (!code) return toast.error("Informe o código do cupom.");
    if (code.length > 80) return toast.error("O código do cupom é muito longo.");
    if (!Number.isFinite(discountValue) || discountValue <= 0)
      return toast.error("Informe um desconto maior que zero.");
    if (draft.discountType === "percent" && discountValue > 100)
      return toast.error("O desconto percentual não pode ultrapassar 100%.");
    if (!Number.isFinite(minimumOrder) || minimumOrder < 0)
      return toast.error("Pedido mínimo inválido.");
    if (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount < 0))
      return toast.error("Desconto máximo inválido.");
    if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit <= 0))
      return toast.error("O limite total precisa ser um inteiro maior que zero.");
    if (
      usageLimitPerUser !== null &&
      (!Number.isInteger(usageLimitPerUser) || usageLimitPerUser <= 0)
    )
      return toast.error("O limite por cliente precisa ser um inteiro maior que zero.");
    if (startsAt && Number.isNaN(startsAt.getTime())) return toast.error("Data inicial inválida.");
    if (endsAt && Number.isNaN(endsAt.getTime())) return toast.error("Data final inválida.");
    if (startsAt && endsAt && endsAt <= startsAt)
      return toast.error("A data final precisa ser posterior ao início.");

    setBusy("create");
    const { error } = await from("coupons").insert({
      merchant_id: merchantId,
      code,
      discount_type: draft.discountType,
      discount_value: discountValue,
      minimum_order: minimumOrder,
      max_discount: draft.discountType === "percent" ? maxDiscount : null,
      usage_limit: usageLimit,
      usage_limit_per_user: usageLimitPerUser,
      is_active: true,
      starts_at: startsAt?.toISOString() ?? null,
      ends_at: endsAt?.toISOString() ?? null,
    });
    setBusy(null);
    if (error) {
      toast.error(
        error.code === "23505"
          ? "Este código já está cadastrado para o estabelecimento."
          : error.message || "Não foi possível criar o cupom.",
      );
      return;
    }
    toast.success("Cupom criado.");
    setDraft((current) => ({ ...current, code: "", discountValue: "" }));
    await load();
  };

  const toggleCoupon = async (coupon: Coupon) => {
    setBusy(`toggle:${coupon.id}`);
    const { error } = await from("coupons")
      .update({ is_active: !coupon.is_active })
      .eq("id", coupon.id)
      .eq("merchant_id", merchantId);
    setBusy(null);
    if (error) return toast.error(error.message || "Não foi possível alterar o cupom.");
    await load();
  };

  const deleteCoupon = async (coupon: Coupon) => {
    const uses = usageByCoupon.get(coupon.id) ?? 0;
    if (uses > 0) {
      toast.error("Cupons já utilizados devem ser pausados para preservar o histórico.");
      return;
    }
    if (!window.confirm(`Excluir o cupom ${coupon.code}?`)) return;
    setBusy(`delete:${coupon.id}`);
    const { error } = await from("coupons")
      .delete()
      .eq("id", coupon.id)
      .eq("merchant_id", merchantId);
    setBusy(null);
    if (error) return toast.error(error.message || "Não foi possível excluir o cupom.");
    toast.success("Cupom excluído.");
    await load();
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Código copiado.");
    } catch {
      toast.error("Não foi possível copiar o código.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Cupons cadastrados" value={coupons.length} />
        <MetricCard label="Ativos" value={activeCount} />
        <MetricCard label="Usos registrados" value={totalUses} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form
          onSubmit={createCoupon}
          className="space-y-4 rounded-2xl border border-zinc-900 bg-zinc-950 p-5"
        >
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-primary">Novo cupom</p>
            <h2 className="mt-1 font-black">Criar código promocional</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Limites e validade são validados novamente no servidor durante o checkout.
            </p>
          </div>

          <Field label="Código">
            <input
              value={draft.code}
              maxLength={80}
              onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })}
              className="control uppercase"
              placeholder="EX.: BEMVINDO10"
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
                inputMode="decimal"
                onChange={(event) => setDraft({ ...draft, discountValue: event.target.value })}
                className="control"
                placeholder="0"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pedido mínimo">
              <input
                value={draft.minimumOrder}
                inputMode="decimal"
                onChange={(event) => setDraft({ ...draft, minimumOrder: event.target.value })}
                className="control"
              />
            </Field>
            <Field label="Desconto máximo">
              <input
                value={draft.maxDiscount}
                inputMode="decimal"
                disabled={draft.discountType !== "percent"}
                onChange={(event) => setDraft({ ...draft, maxDiscount: event.target.value })}
                className="control disabled:opacity-40"
                placeholder="Opcional"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Limite total">
              <input
                value={draft.usageLimit}
                inputMode="numeric"
                onChange={(event) => setDraft({ ...draft, usageLimit: event.target.value })}
                className="control"
                placeholder="Sem limite"
              />
            </Field>
            <Field label="Por cliente">
              <input
                value={draft.usageLimitPerUser}
                inputMode="numeric"
                onChange={(event) => setDraft({ ...draft, usageLimitPerUser: event.target.value })}
                className="control"
                placeholder="Sem limite"
              />
            </Field>
          </div>
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
          <Button disabled={busy === "create"} className="h-12 w-full font-black">
            {busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Criar cupom
          </Button>
        </form>

        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-black">Cupons do estabelecimento</h2>
              <p className="text-xs text-zinc-500">Pause códigos sem apagar o histórico de uso.</p>
            </div>
            <Tag className="h-5 w-5 text-primary" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Carregando cupons...
            </div>
          ) : coupons.length === 0 ? (
            <EmptyState title="Nenhum cupom cadastrado" description="Crie seu primeiro código promocional ao lado." />
          ) : (
            <div className="space-y-3">
              {coupons.map((coupon) => {
                const uses = usageByCoupon.get(coupon.id) ?? 0;
                const expired = coupon.ends_at ? new Date(coupon.ends_at) <= new Date() : false;
                return (
                  <article key={coupon.id} className="rounded-2xl border border-zinc-900 bg-black p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-black text-primary">{coupon.code}</p>
                          <button
                            type="button"
                            onClick={() => void copyCode(coupon.code)}
                            className="rounded-lg bg-zinc-900 p-1.5 text-zinc-500"
                            aria-label={`Copiar cupom ${coupon.code}`}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">
                          {coupon.discount_type === "percent"
                            ? `${Number(coupon.discount_value).toLocaleString("pt-BR")}% de desconto`
                            : `${money(coupon.discount_value)} de desconto`}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${coupon.is_active && !expired ? "bg-emerald-500/10 text-emerald-300" : "bg-zinc-800 text-zinc-500"}`}
                      >
                        {expired ? "Expirado" : coupon.is_active ? "Ativo" : "Pausado"}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-[10px] text-zinc-500 sm:grid-cols-2">
                      <span>Pedido mínimo: {money(coupon.minimum_order)}</span>
                      <span>
                        Uso: {uses}
                        {coupon.usage_limit ? `/${coupon.usage_limit}` : ""}
                      </span>
                      <span>Por cliente: {coupon.usage_limit_per_user ?? "sem limite"}</span>
                      <span>
                        Máximo: {coupon.max_discount === null ? "sem teto" : money(coupon.max_discount)}
                      </span>
                      <span>Início: {dateTime(coupon.starts_at)}</span>
                      <span>Fim: {dateTime(coupon.ends_at)}</span>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy === `toggle:${coupon.id}`}
                        onClick={() => void toggleCoupon(coupon)}
                        className="flex-1"
                      >
                        {busy === `toggle:${coupon.id}` ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        {coupon.is_active ? "Pausar" : "Ativar"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={uses > 0 || busy === `delete:${coupon.id}`}
                        onClick={() => void deleteCoupon(coupon)}
                        aria-label={`Excluir cupom ${coupon.code}`}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
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
