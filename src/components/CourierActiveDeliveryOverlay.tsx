import {
  CheckCircle2,
  Clock3,
  Headphones,
  Loader2,
  MapPin,
  Navigation,
  PackageCheck,
  Route as RouteIcon,
  Store,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getApoisProductMode } from "@/lib/product-routing";

type ActiveJob = {
  id: string;
  order_id: string;
  courier_id: string;
  status: string;
  pickup_address: Record<string, unknown> | null;
  delivery_address: Record<string, unknown> | null;
  estimated_distance_meters: number | string | null;
  estimated_duration_seconds: number | string | null;
  estimated_earnings: number | string | null;
  orders?: {
    order_number?: number | string | null;
    total?: number | string | null;
    status?: string | null;
  } | null;
};

type RpcResult = {
  data: unknown;
  error: { message?: string } | null;
};

type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;

const rpc = supabase.rpc as unknown as RpcCaller;
const activeStatuses = [
  "accepted",
  "arriving_pickup",
  "at_pickup",
  "picked_up",
  "on_the_way",
  "arrived_destination",
];

function money(value: unknown) {
  return `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;
}

function addressText(value: unknown) {
  const address = (value ?? {}) as Record<string, unknown>;
  const first = [address.street, address.address_line, address.name].find(
    (part) => typeof part === "string" && part.trim(),
  );
  const number = typeof address.number === "string" ? address.number : null;
  const neighborhood = typeof address.neighborhood === "string" ? address.neighborhood : null;
  const city = typeof address.city === "string" ? address.city : null;
  const state = typeof address.state === "string" ? address.state : null;
  return {
    title: [first, number].filter(Boolean).join(", ") || "Endereço da entrega",
    detail: [neighborhood, city, state].filter(Boolean).join(" · "),
  };
}

function stageIndex(status: string) {
  if (status === "accepted" || status === "arriving_pickup") return 0;
  if (status === "at_pickup" || status === "picked_up") return 1;
  if (status === "on_the_way" || status === "arrived_destination") return 2;
  return 3;
}

function actionFor(status: string) {
  if (status === "accepted") {
    return { target: "arriving_pickup", label: "IR PARA RETIRADA", icon: Navigation };
  }
  if (status === "arriving_pickup") {
    return { target: "at_pickup", label: "CHEGUEI NA RETIRADA", icon: MapPin };
  }
  if (status === "at_pickup") {
    return { target: "picked_up", label: "PEDIDO COLETADO", icon: PackageCheck };
  }
  if (status === "picked_up") {
    return { target: "on_the_way", label: "INICIAR ENTREGA", icon: RouteIcon };
  }
  if (status === "on_the_way") {
    return { target: "arrived_destination", label: "CHEGUEI AO DESTINO", icon: MapPin };
  }
  return null;
}

export function CourierActiveDeliveryOverlay() {
  const enabled = getApoisProductMode() === "courier";
  const [courierId, setCourierId] = useState<string | null>(null);
  const [job, setJob] = useState<ActiveJob | null>(null);
  const [busy, setBusy] = useState<"transition" | "complete" | "support" | null>(null);
  const [pin, setPin] = useState("");
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportCategory, setSupportCategory] = useState("delivery");
  const [supportDescription, setSupportDescription] = useState("");

  const loadActiveJob = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("delivery_jobs")
      .select("*, orders(order_number,total,status)")
      .eq("courier_id", id)
      .in("status", activeStatuses)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("courier active delivery load failed", error.message);
      return;
    }
    setJob((data as ActiveJob | null) ?? null);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    const resolveCourier = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || disposed) {
        if (!disposed) {
          setCourierId(null);
          setJob(null);
        }
        return;
      }

      const { data } = await supabase
        .from("couriers")
        .select("id,status,is_active")
        .eq("user_id", user.id)
        .maybeSingle();
      if (disposed) return;

      const id = data?.status === "approved" && data.is_active ? data.id : null;
      setCourierId(id);
      if (id) await loadActiveJob(id);
      else setJob(null);
    };

    void resolveCourier();
    const { data: listener } = supabase.auth.onAuthStateChange(() => void resolveCourier());
    return () => {
      disposed = true;
      listener.subscription.unsubscribe();
    };
  }, [enabled, loadActiveJob]);

  useEffect(() => {
    if (!enabled || !courierId) return;
    const refresh = () => void loadActiveJob(courierId);
    const channel = supabase
      .channel(`courier_active_delivery_overlay_${courierId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_jobs",
          filter: `courier_id=eq.${courierId}`,
        },
        refresh,
      )
      .subscribe();
    const poll = window.setInterval(refresh, 4000);

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [courierId, enabled, loadActiveJob]);

  useEffect(() => {
    setPin("");
    setSupportOpen(false);
    setSupportDescription("");
  }, [job?.id]);

  const action = useMemo(() => (job ? actionFor(job.status) : null), [job]);

  if (!enabled || !courierId || !job) return null;

  const pickup = addressText(job.pickup_address);
  const delivery = addressText(job.delivery_address);
  const currentStage = stageIndex(job.status);
  const distanceMeters = Number(job.estimated_distance_meters ?? 0);
  const durationSeconds = Number(job.estimated_duration_seconds ?? 0);
  const stages = ["Aceito", "Retirada", "Entrega", "Concluído"];

  const transition = async (target: string) => {
    if (busy) return;
    setBusy("transition");
    const { error } = await rpc("courier_transition_delivery", {
      _delivery_job_id: job.id,
      _new_status: target,
    });
    setBusy(null);
    if (error) {
      toast.error(error.message || "Não foi possível atualizar a etapa.");
      await loadActiveJob(courierId);
      return;
    }
    toast.success("Etapa atualizada.");
    await loadActiveJob(courierId);
  };

  const complete = async () => {
    if (!/^\d{4}$/.test(pin)) {
      toast.error("Informe o PIN de 4 dígitos do cliente.");
      return;
    }
    if (busy) return;
    setBusy("complete");
    const { data, error } = await rpc("complete_delivery_with_pin", {
      _delivery_job_id: job.id,
      _pin: pin,
    });
    setBusy(null);
    if (error) {
      toast.error(error.message || "Não foi possível concluir a entrega.");
      await loadActiveJob(courierId);
      return;
    }
    if (!data) {
      toast.error("PIN incorreto. Confira com o cliente.");
      return;
    }
    setPin("");
    toast.success("Entrega concluída!");
    await loadActiveJob(courierId);
  };

  const reportProblem = async () => {
    const description = supportDescription.trim();
    if (description.length < 10) {
      toast.error("Descreva o problema com pelo menos 10 caracteres.");
      return;
    }
    if (busy) return;
    setBusy("support");
    const { error } = await rpc("create_support_ticket", {
      _category: supportCategory,
      _subject: `Problema na entrega #${job.orders?.order_number ?? job.order_id}`,
      _description: description,
      _order_id: job.order_id,
      _delivery_job_id: job.id,
    });
    setBusy(null);
    if (error) {
      toast.error(error.message || "Não foi possível abrir o chamado.");
      return;
    }
    setSupportDescription("");
    setSupportOpen(false);
    toast.success("Chamado aberto para o suporte.");
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[1250] flex items-end justify-center p-3">
      <section className="pointer-events-auto w-full max-w-[390px] overflow-hidden rounded-[2rem] border border-primary/40 bg-[#080808]/98 text-white shadow-[0_-24px_80px_rgba(0,0,0,0.75)] backdrop-blur-xl">
        <div className="max-h-[68dvh] overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                Entrega em andamento
              </p>
              <p className="mt-1 text-xl font-black">Pedido #{job.orders?.order_number ?? "—"}</p>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 text-right">
              <p className="text-[9px] font-black uppercase text-zinc-500">Seu ganho</p>
              <p className="mt-1 text-lg font-black text-primary">{money(job.estimated_earnings)}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-1">
            {stages.map((stage, index) => (
              <div key={stage} className="text-center">
                <div className="flex items-center">
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full border ${
                      index <= currentStage
                        ? "border-primary bg-primary shadow-[0_0_14px_rgba(250,204,21,0.4)]"
                        : "border-zinc-700 bg-zinc-950"
                    }`}
                  />
                  {index < stages.length - 1 ? (
                    <span
                      className={`h-px flex-1 ${index < currentStage ? "bg-primary" : "bg-zinc-800"}`}
                    />
                  ) : null}
                </div>
                <p
                  className={`mt-2 text-[9px] font-black ${
                    index <= currentStage ? "text-primary" : "text-zinc-600"
                  }`}
                >
                  {stage}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800 bg-black">
            <div className="flex gap-3 border-b border-zinc-900 p-4">
              <Store className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase text-primary">Retirada</p>
                <p className="mt-1 text-sm font-bold">{pickup.title}</p>
                <p className="mt-1 text-xs text-zinc-500">{pickup.detail}</p>
              </div>
            </div>
            <div className="flex gap-3 p-4">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase text-primary">Entrega</p>
                <p className="mt-1 text-sm font-bold">{delivery.title}</p>
                <p className="mt-1 text-xs text-zinc-500">{delivery.detail}</p>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-3">
              <div className="flex items-center gap-2 text-zinc-500">
                <RouteIcon className="h-4 w-4 text-primary" />
                <span className="text-[9px] font-black uppercase">Distância</span>
              </div>
              <p className="mt-1 text-sm font-black">
                {distanceMeters > 0
                  ? `${(distanceMeters / 1000).toFixed(1).replace(".", ",")} km`
                  : "A calcular"}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-3">
              <div className="flex items-center gap-2 text-zinc-500">
                <Clock3 className="h-4 w-4 text-primary" />
                <span className="text-[9px] font-black uppercase">Tempo</span>
              </div>
              <p className="mt-1 text-sm font-black">
                {durationSeconds > 0
                  ? `${Math.max(1, Math.round(durationSeconds / 60))} min`
                  : "A calcular"}
              </p>
            </div>
          </div>

          {action ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void transition(action.target)}
              className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black text-black shadow-[0_14px_40px_rgba(250,204,21,0.24)] disabled:opacity-60"
            >
              {busy === "transition" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <action.icon className="h-5 w-5" />
              )}
              {action.label}
            </button>
          ) : null}

          {job.status === "arrived_destination" ? (
            <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/5 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-black">Confirme o PIN do cliente</p>
                  <p className="text-[11px] text-zinc-500">Peça o código antes de entregar o pedido.</p>
                </div>
              </div>
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="0000"
                aria-label="PIN de entrega"
                className="mt-3 h-14 w-full rounded-2xl border border-zinc-800 bg-black px-4 text-center text-2xl font-black tracking-[0.5em] outline-none focus:border-primary/60"
              />
              <button
                type="button"
                disabled={Boolean(busy) || pin.length !== 4}
                onClick={() => void complete()}
                className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black text-black disabled:opacity-50"
              >
                {busy === "complete" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                CONFIRMAR ENTREGA
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setSupportOpen((open) => !open)}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 text-sm font-bold text-zinc-300"
          >
            {supportOpen ? <X className="h-4 w-4" /> : <Headphones className="h-4 w-4 text-primary" />}
            {supportOpen ? "Fechar suporte" : "Ajuda / Problema"}
          </button>

          {supportOpen ? (
            <div className="mt-3 space-y-3 rounded-2xl border border-zinc-800 bg-black p-4">
              <select
                value={supportCategory}
                onChange={(event) => setSupportCategory(event.target.value)}
                aria-label="Categoria do problema"
                className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-primary/60"
              >
                <option value="delivery">Problema na entrega</option>
                <option value="pickup">Problema na retirada</option>
                <option value="customer">Problema com cliente</option>
                <option value="address">Endereço / localização</option>
                <option value="other">Outro</option>
              </select>
              <textarea
                value={supportDescription}
                onChange={(event) => setSupportDescription(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Descreva o que aconteceu..."
                aria-label="Descrição do problema"
                className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-primary/60"
              />
              <button
                type="button"
                disabled={Boolean(busy) || supportDescription.trim().length < 10}
                onClick={() => void reportProblem()}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 text-sm font-black text-primary disabled:opacity-50"
              >
                {busy === "support" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Headphones className="h-4 w-4" />}
                ENVIAR AO SUPORTE
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
