import {
  ArrowLeft,
  Bike,
  CircleDollarSign,
  FileCheck2,
  House,
  MapPin,
  Route as RouteIcon,
  Star,
  UserRound,
  WalletCards,
} from "lucide-react";

const money = (value: unknown) =>
  `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;

const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

const statusLabel: Record<string, string> = {
  delivered: "Entregue",
  cancelled: "Cancelada",
  accepted: "Aceita",
  arriving_pickup: "A caminho da retirada",
  at_pickup: "No estabelecimento",
  picked_up: "Pedido retirado",
  on_the_way: "A caminho do cliente",
  arrived_destination: "No destino",
};

export function CourierBottomNav({
  active = "home",
  onHome,
  onHistory,
  onFinance,
  onProfile,
}: {
  active?: "home" | "history" | "finance" | "profile";
  onHome: () => void;
  onHistory: () => void;
  onFinance: () => void;
  onProfile: () => void;
}) {
  const items = [
    { id: "home", label: "Início", icon: House, onClick: onHome },
    { id: "history", label: "Corridas", icon: Bike, onClick: onHistory },
    { id: "finance", label: "Ganhos", icon: WalletCards, onClick: onFinance },
    { id: "profile", label: "Perfil", icon: UserRound, onClick: onProfile },
  ] as const;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-900 bg-black/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
      <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            aria-current={active === item.id ? "page" : undefined}
            className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold transition-colors active:bg-zinc-900 ${
              active === item.id ? "text-primary" : "text-zinc-500"
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
            {active === item.id ? (
              <span className="absolute bottom-0 h-0.5 w-7 rounded-full bg-primary" />
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function CourierHistoryPanel({ jobs, onClose }: { jobs: any[]; onClose: () => void }) {
  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-zinc-900 bg-black/95 p-4 backdrop-blur">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            APOIS ENTREGADOR
          </p>
          <h1 className="text-lg font-black">Corridas</h1>
        </div>
      </header>

      <main className="space-y-3 p-4 pb-28">
        {jobs.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950 p-8 text-center">
            <Bike className="mx-auto h-9 w-9 text-zinc-700" />
            <p className="mt-3 font-black">Nenhuma entrega concluída ainda</p>
            <p className="mt-1 text-sm text-zinc-500">Seu histórico aparecerá aqui.</p>
          </div>
        ) : (
          jobs.map((job) => {
            const pickup = job.pickup_address ?? {};
            const delivery = job.delivery_address ?? {};
            const isDelivered = job.status === "delivered";
            const distanceMeters = Number(job.estimated_distance_meters ?? 0);
            return (
              <article key={job.id} className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase text-zinc-500">Pedido</p>
                    <p className="font-black">#{job.orders?.order_number ?? "—"}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                      isDelivered
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-red-500/10 text-red-300"
                    }`}
                  >
                    {statusLabel[job.status] ?? job.status}
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex gap-2 rounded-xl bg-black p-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase text-zinc-600">Retirada</p>
                      <p className="truncate text-xs text-zinc-300">
                        {pickup.name || pickup.address_line || pickup.street || "Estabelecimento"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 rounded-xl bg-black p-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase text-zinc-600">Destino</p>
                      <p className="truncate text-xs text-zinc-300">
                        {delivery.street
                          ? `${delivery.street}, ${delivery.number || "s/n"}`
                          : "Endereço de entrega"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-end gap-4 border-t border-zinc-900 pt-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase text-zinc-600">Finalizada em</p>
                    <p className="truncate text-xs text-zinc-400">
                      {dateTime(job.delivered_at || job.cancelled_at || job.updated_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase text-zinc-600">Distância</p>
                    <p className="flex items-center justify-end gap-1 text-xs font-bold text-zinc-300">
                      <RouteIcon className="h-3 w-3 text-primary" />
                      {distanceMeters > 0
                        ? `${(distanceMeters / 1000).toFixed(1).replace(".", ",")} km`
                        : "—"}
                    </p>
                  </div>
                  {isDelivered ? (
                    <div className="text-right">
                      <p className="text-[9px] font-black uppercase text-zinc-600">Ganho</p>
                      <p className="font-black text-primary">{money(job.estimated_earnings)}</p>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </main>
    </div>
  );
}

export function CourierProfilePanel({
  courier,
  user,
  documents,
  availability,
  wallet,
  onFinance,
  onLogout,
  onClose,
}: {
  courier: any;
  user: any;
  documents: any[];
  availability: any;
  wallet: any;
  onFinance: () => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  const approvedDocs = documents.filter((document) => document.status === "approved").length;
  const vehicle = [courier.vehicle_type, courier.vehicle_model].filter(Boolean).join(" · ");

  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-zinc-900 bg-black/95 p-4 backdrop-blur">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
            APOIS ENTREGADOR
          </p>
          <h1 className="text-lg font-black">Perfil</h1>
        </div>
      </header>

      <main className="space-y-4 p-4 pb-28">
        <section className="rounded-3xl border border-zinc-900 bg-zinc-950 p-5">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
              <UserRound className="h-8 w-8" />
            </div>
            <div className="min-w-0">
              <p className="pr-1 text-base font-black leading-snug sm:text-lg">
                {user?.user_metadata?.full_name || user?.user_metadata?.name || "Entregador APOIS"}
              </p>
              <p className="mt-1 break-all text-xs text-zinc-500">{user?.email || "Conta APOIS"}</p>
              <p className="mt-2 text-xs font-bold uppercase text-emerald-400">Cadastro aprovado</p>
              <div className="mt-2 flex items-center gap-1 text-sm text-zinc-400">
                <Star className="h-4 w-4 fill-primary text-primary" />
                {Number(courier.rating || 0).toFixed(1)} · {courier.review_count || 0} avaliações
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
            <FileCheck2 className="h-5 w-5 text-primary" />
            <p className="mt-3 text-[10px] font-black uppercase text-zinc-500">Documentos</p>
            <p className="mt-1 text-lg font-black">
              {approvedDocs}/{documents.length || 3}
            </p>
          </section>
          <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
            <Bike className="h-5 w-5 text-primary" />
            <p className="mt-3 text-[10px] font-black uppercase text-zinc-500">Status</p>
            <p
              className={
                availability?.is_online
                  ? "mt-1 font-black text-emerald-400"
                  : "mt-1 font-black text-zinc-400"
              }
            >
              {availability?.is_online ? "ONLINE" : "OFFLINE"}
            </p>
          </section>
        </div>

        <section className="space-y-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <h2 className="font-black">Veículo</h2>
          <p className="text-sm text-zinc-400">{vehicle || "Veículo não informado"}</p>
          {courier.vehicle_plate ? (
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-600">
              Placa {courier.vehicle_plate}
            </p>
          ) : null}
        </section>

        <button
          type="button"
          onClick={onFinance}
          className="flex w-full items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 p-4 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <CircleDollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="font-black">Carteira e saques</p>
              <p className="text-xs text-zinc-500">Disponível {money(wallet?.available_balance)}</p>
            </div>
          </div>
          <WalletCards className="h-5 w-5 text-primary" />
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="w-full rounded-2xl border border-red-500/20 bg-red-500/5 p-4 font-black text-red-300"
        >
          Sair da conta
        </button>
      </main>
    </div>
  );
}
