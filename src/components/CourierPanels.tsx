import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileCheck2,
  House,
  MapPin,
  Route as RouteIcon,
  ShieldCheck,
  Star,
  UserRound,
  WalletCards,
  XCircle,
} from "lucide-react";
import logoAsset from "@/assets/logo.png.asset.json";

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

const documentLabel: Record<string, string> = {
  cnh: "CNH",
  documento_veiculo: "Documento do veículo",
  foto_perfil: "Foto do entregador",
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
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-accent/15 bg-[linear-gradient(180deg,rgba(5,5,5,0.94),#000)] px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-16px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
      <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
        {items.map((item) => {
          const selected = active === item.id;
          return (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              aria-current={selected ? "page" : undefined}
              className={`relative flex min-h-[3.7rem] flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-bold transition active:scale-[0.97] ${
                selected ? "text-primary" : "text-zinc-600"
              }`}
            >
              <span
                className={`grid h-8 w-10 place-items-center rounded-xl transition ${
                  selected ? "bg-accent/15" : "bg-transparent"
                }`}
              >
                <item.icon className={`h-5 w-5 ${selected ? "stroke-[2.5]" : "stroke-2"}`} />
              </span>
              {item.label}
              {selected ? (
                <span className="absolute -bottom-1 h-[3px] w-8 rounded-full bg-gradient-to-r from-primary to-accent shadow-[0_0_16px_rgba(106,27,154,0.45)]" />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <header className="sticky top-0 z-40 grid min-h-20 grid-cols-[2.75rem_1fr_2.75rem] items-center border-b border-accent/15 bg-black/92 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-2xl">
      <button
        type="button"
        onClick={onClose}
        className="grid h-10 w-10 place-items-center rounded-full border border-zinc-800 bg-zinc-950 text-zinc-300 active:scale-95"
        aria-label="Voltar"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="flex flex-col items-center py-2 text-center">
        <img src={logoAsset.url} alt="APOIS ENTREGA" className="h-9 w-auto object-contain" />
        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
          {title}
        </p>
      </div>
      <div aria-hidden="true" />
    </header>
  );
}

export function CourierHistoryPanel({ jobs, onClose }: { jobs: any[]; onClose: () => void }) {
  const delivered = jobs.filter((job) => job.status === "delivered").length;
  const totalEarnings = jobs
    .filter((job) => job.status === "delivered")
    .reduce((sum, job) => sum + Number(job.estimated_earnings ?? 0), 0);

  return (
    <div className="min-h-dvh bg-black text-white">
      <PanelHeader title="Corridas" onClose={onClose} />

      <main className="mx-auto w-full max-w-lg space-y-4 p-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
        <section className="overflow-hidden rounded-[1.75rem] border border-accent/30 bg-[radial-gradient(circle_at_top_right,rgba(106,27,154,0.22),transparent_42%),#090909] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.5)]">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">
            Seu histórico APOIS
          </p>
          <h1 className="mt-1 text-2xl font-black">Corridas</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Acompanhe suas entregas concluídas e canceladas.
          </p>
          <div className="mt-5 grid grid-cols-2 divide-x divide-zinc-800 rounded-2xl border border-zinc-800 bg-black/55 p-4">
            <div className="pr-4">
              <p className="text-[9px] font-black uppercase text-zinc-600">Concluídas</p>
              <p className="mt-1 text-xl font-black">{delivered}</p>
            </div>
            <div className="pl-4">
              <p className="text-[9px] font-black uppercase text-zinc-600">Ganhos listados</p>
              <p className="mt-1 text-xl font-black text-primary">{money(totalEarnings)}</p>
            </div>
          </div>
        </section>

        {jobs.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-accent/20 bg-zinc-950/80 p-9 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-accent/20 bg-accent/5">
              <Bike className="h-7 w-7 text-primary" />
            </div>
            <p className="mt-4 font-black">Nenhuma entrega concluída ainda</p>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-5 text-zinc-500">
              Assim que você finalizar uma entrega, os detalhes aparecerão aqui.
            </p>
          </div>
        ) : (
          jobs.map((job) => {
            const pickup = job.pickup_address ?? {};
            const delivery = job.delivery_address ?? {};
            const isDelivered = job.status === "delivered";
            const distanceMeters = Number(job.estimated_distance_meters ?? 0);
            return (
              <article
                key={job.id}
                className="rounded-[1.6rem] border border-zinc-800/90 bg-[linear-gradient(145deg,#101010,#080808)] p-4 shadow-[0_14px_36px_rgba(0,0,0,0.38)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
                      Pedido
                    </p>
                    <p className="mt-0.5 text-base font-black">
                      #{job.orders?.order_number ?? "—"}
                    </p>
                  </div>
                  <span
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${
                      isDelivered
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                        : "border-red-500/20 bg-red-500/10 text-red-300"
                    }`}
                  >
                    {isDelivered ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {statusLabel[job.status] ?? job.status}
                  </span>
                </div>

                <div className="mt-4 rounded-2xl border border-zinc-900 bg-black/65 p-3.5">
                  <div className="flex gap-3">
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-full border-[3px] border-accent bg-black" />
                    <div className="min-w-0 flex-1 pb-3">
                      <p className="text-[9px] font-black uppercase text-accent">Retirada</p>
                      <p className="truncate text-sm font-bold text-zinc-200">
                        {pickup.name || pickup.address_line || pickup.street || "Estabelecimento"}
                      </p>
                    </div>
                  </div>
                  <div className="ml-[5px] h-5 border-l border-dashed border-zinc-700" />
                  <div className="flex gap-3">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-black uppercase text-primary">Entrega</p>
                      <p className="truncate text-sm text-zinc-300">
                        {delivery.street
                          ? `${delivery.street}, ${delivery.number || "s/n"}`
                          : "Endereço de entrega"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-end gap-3 border-t border-zinc-900 pt-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase text-zinc-600">Finalizada em</p>
                    <p className="truncate text-[11px] text-zinc-400">
                      {dateTime(job.delivered_at || job.cancelled_at || job.updated_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase text-zinc-600">Distância</p>
                    <p className="flex items-center justify-end gap-1 text-xs font-bold text-zinc-300">
                      <RouteIcon className="h-3 w-3 text-accent" />
                      {distanceMeters > 0
                        ? `${(distanceMeters / 1000).toFixed(1).replace(".", ",")} km`
                        : "—"}
                    </p>
                  </div>
                  {isDelivered ? (
                    <div className="text-right">
                      <p className="text-[9px] font-black uppercase text-zinc-600">Ganho</p>
                      <p className="text-sm font-black text-primary">
                        {money(job.estimated_earnings)}
                      </p>
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
  const fullName =
    user?.user_metadata?.full_name || user?.user_metadata?.name || "Entregador APOIS";

  return (
    <div className="min-h-dvh bg-black text-white">
      <PanelHeader title="Perfil" onClose={onClose} />

      <main className="mx-auto w-full max-w-lg space-y-4 p-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
        <section className="relative overflow-hidden rounded-[2rem] border border-accent/30 bg-[radial-gradient(circle_at_top_right,rgba(106,27,154,0.24),transparent_36%),linear-gradient(145deg,#101010,#070707)] p-5 shadow-[0_24px_65px_rgba(0,0,0,0.55)]">
          <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full border border-accent/15" />
          <div className="relative flex items-center gap-4">
            <div className="grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center rounded-full border border-accent/35 bg-black text-accent shadow-[0_0_30px_rgba(106,27,154,0.16)]">
              <UserRound className="h-9 w-9" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-[9px] font-black uppercase text-primary">
                  <ShieldCheck className="h-3 w-3" /> Aprovado
                </span>
              </div>
              <p className="mt-2 truncate text-xl font-black">{fullName}</p>
              <p className="mt-1 truncate text-xs text-zinc-500">{user?.email || "Conta APOIS"}</p>
              <div className="mt-2 flex items-center gap-1 text-sm text-zinc-400">
                <Star className="h-4 w-4 fill-accent text-accent" />
                <b className="text-white">{Number(courier.rating || 0).toFixed(1)}</b>
                <span>· {courier.review_count || 0} avaliações</span>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <section className="rounded-2xl border border-accent/15 bg-zinc-950 p-4">
            <FileCheck2 className="h-5 w-5 text-accent" />
            <p className="mt-3 text-[9px] font-black uppercase text-zinc-600">Documentos</p>
            <p className="mt-1 text-lg font-black">
              {approvedDocs}/{documents.length || (courier.vehicle_type === "bicicleta" ? 1 : 3)}
            </p>
            <p className="mt-1 text-[10px] text-zinc-500">aprovados</p>
          </section>
          <section className="rounded-2xl border border-primary/15 bg-zinc-950 p-4">
            <Bike className="h-5 w-5 text-primary" />
            <p className="mt-3 text-[9px] font-black uppercase text-zinc-600">Disponibilidade</p>
            <p
              className={`mt-1 text-lg font-black ${availability?.is_online ? "text-primary" : "text-zinc-400"}`}
            >
              {availability?.is_online ? "ONLINE" : "OFFLINE"}
            </p>
            <p className="mt-1 text-[10px] text-zinc-500">
              {availability?.is_online ? "recebendo ofertas" : "jornada pausada"}
            </p>
          </section>
        </div>

        <section className="rounded-[1.6rem] border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-accent">Veículo</p>
              <h2 className="mt-1 font-black">Informações do veículo</h2>
            </div>
            <Bike className="h-6 w-6 text-primary" />
          </div>
          <div className="mt-4 rounded-2xl border border-zinc-900 bg-black p-3.5">
            <p className="text-sm font-bold capitalize text-zinc-200">
              {vehicle || "Veículo não informado"}
            </p>
            {courier.vehicle_plate ? (
              <p className="mt-1 text-xs font-bold uppercase tracking-wider text-zinc-500">
                Placa {courier.vehicle_plate}
              </p>
            ) : null}
            {courier.cnh_number ? (
              <p className="mt-1 text-xs text-zinc-600">
                CNH ••••{String(courier.cnh_number).slice(-4)}
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-[1.6rem] border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-accent">
                Cadastro
              </p>
              <h2 className="mt-1 font-black">Documentos</h2>
            </div>
            <FileCheck2 className="h-6 w-6 text-accent" />
          </div>
          <div className="mt-3 space-y-2">
            {documents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 bg-black p-4 text-sm text-zinc-500">
                Nenhum documento disponível para exibição.
              </div>
            ) : (
              documents.map((document) => (
                <div
                  key={document.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-900 bg-black p-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-zinc-200">
                      {documentLabel[document.document_type] || document.document_type}
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-600">
                      Arquivo protegido na sua conta
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase ${
                      document.status === "approved"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : document.status === "rejected"
                          ? "bg-red-500/10 text-red-300"
                          : "bg-accent/10 text-accent"
                    }`}
                  >
                    {document.status === "approved"
                      ? "Aprovado"
                      : document.status === "rejected"
                        ? "Recusado"
                        : "Em análise"}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <button
          type="button"
          onClick={onFinance}
          className="flex w-full items-center justify-between rounded-[1.6rem] border border-accent/30 bg-[linear-gradient(135deg,rgba(106,27,154,0.18),rgba(57,181,74,0.05)_45%,#090909_70%)] p-4 text-left shadow-[0_14px_35px_rgba(0,0,0,0.35)] active:scale-[0.99]"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-white shadow-[0_0_22px_rgba(57,181,74,0.2)]">
              <CircleDollarSign className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-black">Carteira e saques</p>
              <p className="truncate text-xs text-zinc-500">
                Disponível {money(wallet?.available_balance)}
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-accent" />
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="w-full rounded-2xl border border-red-500/20 bg-red-500/5 p-4 font-black text-red-300 active:scale-[0.99]"
        >
          Sair da conta
        </button>
      </main>
    </div>
  );
}
