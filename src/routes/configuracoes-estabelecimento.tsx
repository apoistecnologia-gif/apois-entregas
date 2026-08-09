import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Clock3, Loader2, Save, Store } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const from = (table: string) => (supabase.from as any)(table);

const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type MerchantSettings = {
  id: string;
  name: string;
  description: string | null;
  delivery_fee: number;
  delivery_min_minutes: number | null;
  delivery_max_minutes: number | null;
  status: string;
  is_active: boolean;
};

type MerchantHour = {
  id?: string;
  merchant_id: string;
  weekday: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
};

export const Route = createFileRoute("/configuracoes-estabelecimento")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
    return { session };
  },
  component: MerchantSettingsPage,
  head: () => ({ meta: [{ title: "Configurações do estabelecimento | APOIS ENTREGA" }] }),
});

function MerchantSettingsPage() {
  const navigate = useNavigate();
  const [merchant, setMerchant] = useState<MerchantSettings | null>(null);
  const [hours, setHours] = useState<MerchantHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    name: "",
    description: "",
    deliveryFee: "0",
    deliveryMin: "",
    deliveryMax: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      setLoadError("Não foi possível identificar sua sessão.");
      setLoading(false);
      return;
    }

    const membership = await from("merchant_members")
      .select("merchant_id,role,is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (membership.error || !membership.data?.merchant_id) {
      setLoadError("Sua conta não possui um estabelecimento ativo vinculado.");
      setLoading(false);
      return;
    }

    const merchantId = membership.data.merchant_id as string;
    const [merchantRes, hoursRes] = await Promise.all([
      from("merchants")
        .select(
          "id,name,description,delivery_fee,delivery_min_minutes,delivery_max_minutes,status,is_active",
        )
        .eq("id", merchantId)
        .maybeSingle(),
      from("merchant_hours").select("*").eq("merchant_id", merchantId).order("weekday"),
    ]);

    if (merchantRes.error || !merchantRes.data) {
      console.error("Erro ao carregar estabelecimento:", merchantRes.error);
      setLoadError("Não foi possível carregar os dados do estabelecimento.");
      setLoading(false);
      return;
    }

    const merchantRow = merchantRes.data as MerchantSettings;
    setMerchant(merchantRow);
    setProfileDraft({
      name: merchantRow.name ?? "",
      description: merchantRow.description ?? "",
      deliveryFee: String(Number(merchantRow.delivery_fee ?? 0)),
      deliveryMin:
        merchantRow.delivery_min_minutes === null || merchantRow.delivery_min_minutes === undefined
          ? ""
          : String(merchantRow.delivery_min_minutes),
      deliveryMax:
        merchantRow.delivery_max_minutes === null || merchantRow.delivery_max_minutes === undefined
          ? ""
          : String(merchantRow.delivery_max_minutes),
    });

    const existing = new Map<number, MerchantHour>(
      ((hoursRes.data ?? []) as MerchantHour[]).map((row) => [row.weekday, row]),
    );
    setHours(
      dayNames.map((_, weekday) =>
        existing.get(weekday) ?? {
          merchant_id: merchantId,
          weekday,
          opens_at: "09:00:00",
          closes_at: "22:00:00",
          is_closed: false,
        },
      ),
    );

    if (hoursRes.error) {
      console.error("Erro ao carregar horários:", hoursRes.error);
      toast.warning("Os dados do estabelecimento foram carregados, mas os horários precisam ser revisados.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveProfile = async () => {
    if (!merchant || savingProfile) return;
    const name = profileDraft.name.trim();
    const deliveryFee = Number(profileDraft.deliveryFee.replace(",", "."));
    const deliveryMin = profileDraft.deliveryMin ? Number(profileDraft.deliveryMin) : null;
    const deliveryMax = profileDraft.deliveryMax ? Number(profileDraft.deliveryMax) : null;

    if (name.length < 2 || name.length > 120) {
      toast.error("Informe um nome válido para o estabelecimento.");
      return;
    }
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      toast.error("Informe uma taxa de entrega válida.");
      return;
    }
    if (
      (deliveryMin !== null && (!Number.isInteger(deliveryMin) || deliveryMin < 1)) ||
      (deliveryMax !== null && (!Number.isInteger(deliveryMax) || deliveryMax < 1)) ||
      (deliveryMin !== null && deliveryMax !== null && deliveryMin > deliveryMax)
    ) {
      toast.error("Revise o prazo mínimo e máximo de entrega.");
      return;
    }

    setSavingProfile(true);
    const { error } = await from("merchants")
      .update({
        name,
        description: profileDraft.description.trim() || null,
        delivery_fee: deliveryFee,
        delivery_min_minutes: deliveryMin,
        delivery_max_minutes: deliveryMax,
        updated_at: new Date().toISOString(),
      })
      .eq("id", merchant.id);
    setSavingProfile(false);

    if (error) {
      console.error("Erro ao salvar estabelecimento:", error);
      toast.error(error.message || "Não foi possível salvar os dados.");
      return;
    }
    toast.success("Dados do estabelecimento atualizados.");
    await load();
  };

  const updateHour = (weekday: number, patch: Partial<MerchantHour>) => {
    setHours((current) =>
      current.map((row) => (row.weekday === weekday ? { ...row, ...patch } : row)),
    );
  };

  const saveHours = async () => {
    if (!merchant || savingHours) return;

    for (const row of hours) {
      if (!row.is_closed) {
        const opens = row.opens_at?.slice(0, 5) ?? "";
        const closes = row.closes_at?.slice(0, 5) ?? "";
        if (!/^\d{2}:\d{2}$/.test(opens) || !/^\d{2}:\d{2}$/.test(closes)) {
          toast.error(`Revise o horário de ${dayNames[row.weekday]}.`);
          return;
        }
      }
    }

    setSavingHours(true);
    try {
      for (const row of hours) {
        const payload = {
          merchant_id: merchant.id,
          weekday: row.weekday,
          opens_at: row.is_closed ? null : `${row.opens_at?.slice(0, 5) ?? "09:00"}:00`,
          closes_at: row.is_closed ? null : `${row.closes_at?.slice(0, 5) ?? "22:00"}:00`,
          is_closed: row.is_closed,
        };

        const result = row.id
          ? await from("merchant_hours").update(payload).eq("id", row.id)
          : await from("merchant_hours").insert(payload);
        if (result.error) throw result.error;
      }
      toast.success("Horários de funcionamento atualizados.");
      await load();
    } catch (error: any) {
      console.error("Erro ao salvar horários:", error);
      toast.error(error?.message || "Não foi possível salvar os horários.");
    } finally {
      setSavingHours(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!merchant || loadError) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-black p-6 text-center text-white">
        <Store className="h-10 w-10 text-zinc-700" />
        <h1 className="mt-4 text-xl font-black">Configurações indisponíveis</h1>
        <p className="mt-2 max-w-sm text-sm text-zinc-500">{loadError || "Estabelecimento não encontrado."}</p>
        <button
          type="button"
          onClick={() => navigate({ to: "/merchant" })}
          className="mt-5 rounded-xl bg-primary px-6 py-3 font-black text-black"
        >
          Voltar ao painel
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center gap-3 border-b border-zinc-900 bg-black/95 p-4 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => navigate({ to: "/merchant" })}
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar ao painel"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">APOIS ESTABELECIMENTO</p>
          <h1 className="truncate text-lg font-black">Configurações</h1>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${
            merchant.is_active && merchant.status === "approved"
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-amber-500/10 text-amber-300"
          }`}
        >
          {merchant.status}
        </span>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-4 pb-10 lg:p-6">
        <section className="space-y-4 rounded-3xl border border-zinc-900 bg-zinc-950 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-black">Dados do estabelecimento</h2>
              <p className="text-xs text-zinc-500">Informações exibidas ao cliente e usadas no cálculo do pedido.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-bold text-zinc-500 md:col-span-2">
              Nome
              <input
                value={profileDraft.name}
                maxLength={120}
                onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-primary"
              />
            </label>
            <label className="text-xs font-bold text-zinc-500 md:col-span-2">
              Descrição
              <textarea
                value={profileDraft.description}
                maxLength={1000}
                onChange={(event) =>
                  setProfileDraft((current) => ({ ...current, description: event.target.value }))
                }
                className="mt-1 min-h-28 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-primary"
              />
            </label>
            <label className="text-xs font-bold text-zinc-500">
              Taxa de entrega (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={profileDraft.deliveryFee}
                onChange={(event) =>
                  setProfileDraft((current) => ({ ...current, deliveryFee: event.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-primary"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-zinc-500">
                Prazo mín. (min)
                <input
                  type="number"
                  min="1"
                  value={profileDraft.deliveryMin}
                  onChange={(event) =>
                    setProfileDraft((current) => ({ ...current, deliveryMin: event.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm text-white outline-none focus:border-primary"
                />
              </label>
              <label className="text-xs font-bold text-zinc-500">
                Prazo máx. (min)
                <input
                  type="number"
                  min="1"
                  value={profileDraft.deliveryMax}
                  onChange={(event) =>
                    setProfileDraft((current) => ({ ...current, deliveryMax: event.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-800 bg-black px-3 py-3 text-sm text-white outline-none focus:border-primary"
                />
              </label>
            </div>
          </div>

          <button
            type="button"
            disabled={savingProfile}
            onClick={() => void saveProfile()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 font-black text-black disabled:opacity-50"
          >
            {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingProfile ? "Salvando..." : "Salvar dados"}
          </button>
        </section>

        <section className="space-y-4 rounded-3xl border border-zinc-900 bg-zinc-950 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-black">Horário de funcionamento</h2>
              <p className="text-xs text-zinc-500">Pedidos novos ficam bloqueados quando o estabelecimento estiver fechado.</p>
            </div>
          </div>

          <div className="space-y-3">
            {hours.map((row) => (
              <div
                key={row.weekday}
                className="grid gap-3 rounded-2xl border border-zinc-900 bg-black p-3 sm:grid-cols-[130px_110px_1fr_1fr] sm:items-center"
              >
                <p className="text-sm font-black">{dayNames[row.weekday]}</p>
                <label className="flex items-center gap-2 text-xs font-bold text-zinc-500">
                  <input
                    type="checkbox"
                    checked={row.is_closed}
                    onChange={(event) => updateHour(row.weekday, { is_closed: event.target.checked })}
                    className="h-4 w-4 accent-yellow-400"
                  />
                  Fechado
                </label>
                <label className="text-[10px] font-black uppercase text-zinc-600">
                  Abre
                  <input
                    type="time"
                    disabled={row.is_closed}
                    value={row.opens_at?.slice(0, 5) ?? "09:00"}
                    onChange={(event) => updateHour(row.weekday, { opens_at: `${event.target.value}:00` })}
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none disabled:opacity-40"
                  />
                </label>
                <label className="text-[10px] font-black uppercase text-zinc-600">
                  Fecha
                  <input
                    type="time"
                    disabled={row.is_closed}
                    value={row.closes_at?.slice(0, 5) ?? "22:00"}
                    onChange={(event) => updateHour(row.weekday, { closes_at: `${event.target.value}:00` })}
                    className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none disabled:opacity-40"
                  />
                </label>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={savingHours}
            onClick={() => void saveHours()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 font-black text-black disabled:opacity-50"
          >
            {savingHours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingHours ? "Salvando horários..." : "Salvar horários"}
          </button>
        </section>
      </main>
    </div>
  );
}
