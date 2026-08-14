import {
  AlertTriangle,
  Bike,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  Lightbulb,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  PackageCheck,
  Power,
  Radio,
  RefreshCw,
  Route as RouteIcon,
  ShieldCheck,
  Store,
  Upload,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/logo.png.asset.json";

export const courierMoney = (value: unknown) =>
  `R$ ${Number(value ?? 0)
    .toFixed(2)
    .replace(".", ",")}`;

const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

export function formatCourierOnlineTime(value: unknown) {
  const seconds = Math.max(0, Number(value ?? 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes}min`;
  return `${hours}h ${minutes}min`;
}

function distance(value: unknown) {
  const meters = Number(value);
  if (!Number.isFinite(meters) || meters <= 0) return "A calcular";
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

function duration(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "A calcular";
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function PremiumField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-14 w-full rounded-2xl border border-zinc-800 bg-black/70 px-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-primary focus:ring-2 focus:ring-primary/10"
    />
  );
}

export function CourierApplication({ user, busy, onSubmit, onBack }: any) {
  const [vehicleType, setVehicleType] = useState("moto");
  const motorized = vehicleType === "moto" || vehicleType === "carro";

  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-primary/10 bg-black/92 px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur-xl">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-zinc-300"
        >
          ← Voltar
        </button>
        <img src={logoAsset.url} alt="APOIS ENTREGA" className="h-10 w-auto object-contain" />
        <div className="w-[4.3rem]" aria-hidden="true" />
      </header>

      <main className="mx-auto w-full max-w-lg px-4 pb-[max(env(safe-area-inset-bottom),2rem)] pt-5">
        <section className="relative overflow-hidden rounded-[2rem] border border-primary/30 bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.16),transparent_36%),linear-gradient(145deg,#111,#070707)] p-5 shadow-[0_24px_65px_rgba(0,0,0,0.55)]">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full border border-primary/10" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
              <Bike className="h-3.5 w-3.5" /> Seja entregador
            </span>
            <h1 className="mt-4 text-3xl font-black leading-tight">
              Faça seu <span className="text-primary">cadastro</span>
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-5 text-zinc-400">
              Preencha seus dados com atenção. Seus documentos serão enviados e analisados na
              próxima etapa.
            </p>
          </div>
        </section>

        <form
          onSubmit={onSubmit}
          className="mt-4 space-y-3 rounded-[2rem] border border-zinc-800 bg-zinc-950/85 p-4 shadow-[0_20px_55px_rgba(0,0,0,0.42)]"
        >
          <div className="mb-1 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-400">
              Dados pessoais
            </p>
          </div>
          <PremiumField name="cpf" placeholder="CPF" required inputMode="numeric" />
          <PremiumField name="birthDate" type="date" placeholder="Data de nascimento" required />
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <PremiumField name="street" placeholder="Rua" required />
            <PremiumField name="number" placeholder="Número" required />
          </div>
          <PremiumField name="neighborhood" placeholder="Bairro" required />
          <div className="grid grid-cols-[1fr_78px] gap-2">
            <PremiumField name="city" placeholder="Cidade" required />
            <PremiumField name="state" placeholder="UF" maxLength={2} required />
          </div>

          <div className="pt-2">
            <div className="mb-3 flex items-center gap-2">
              <Bike className="h-4 w-4 text-primary" />
              <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-400">
                Veículo
              </p>
            </div>
            <select
              name="vehicleType"
              required
              value={vehicleType}
              onChange={(event) => setVehicleType(event.target.value)}
              className="h-14 w-full rounded-2xl border border-zinc-800 bg-black/70 px-4 text-sm text-white outline-none focus:border-primary"
            >
              <option value="moto">Moto</option>
              <option value="carro">Carro</option>
              <option value="bicicleta">Bicicleta</option>
            </select>
          </div>
          <PremiumField name="vehicleModel" placeholder="Modelo do veículo" required />
          {motorized ? (
            <>
              <PremiumField
                name="vehiclePlate"
                placeholder="Placa do veículo"
                required
                autoCapitalize="characters"
                maxLength={8}
              />
              <PremiumField
                name="cnh"
                placeholder="Número da CNH (11 dígitos)"
                required
                inputMode="numeric"
                maxLength={14}
              />
              <p className="rounded-2xl border border-primary/10 bg-primary/5 p-3 text-xs leading-5 text-zinc-400">
                Para moto ou carro, placa, CNH e documento do veículo serão validados antes da
                aprovação.
              </p>
            </>
          ) : (
            <p className="rounded-2xl border border-primary/10 bg-primary/5 p-3 text-xs leading-5 text-zinc-400">
              Para bicicleta, CNH e documento do veículo não são exigidos. A foto do entregador
              continua obrigatória.
            </p>
          )}
          <p className="px-1 text-[11px] text-zinc-600">Conta autenticada: {user?.email}</p>
          <Button
            disabled={busy}
            className="h-14 w-full rounded-2xl font-black uppercase tracking-[0.06em]"
          >
            {busy ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <ChevronRight className="mr-2 h-5 w-5" />
            )}
            Enviar cadastro
          </Button>
        </form>
      </main>
    </div>
  );
}

export function CourierReviewState({
  courier,
  documents,
  busy,
  onUpload,
  onRefresh,
  refreshing,
  onLogout,
  onResubmit,
}: any) {
  const required = [
    ...(courier.vehicle_type === "bicicleta"
      ? []
      : [
          { type: "cnh", label: "CNH" },
          { type: "documento_veiculo", label: "Documento do veículo" },
        ]),
    { type: "foto_perfil", label: "Foto do entregador" },
  ];
  const blocked = courier.status === "blocked" || courier.is_active === false;
  const requiredReady = required.every((item) => {
    const document = documents.find((row: any) => row.document_type === item.type);
    return document && ["pending", "approved"].includes(document.status);
  });
  const canResubmit = courier.status === "rejected" && !blocked && requiredReady;
  const rejected = courier.status === "rejected" && !blocked;

  const statusLabel = blocked
    ? "CONTA BLOQUEADA"
    : courier.status === "under_review"
      ? "CADASTRO EM ANÁLISE"
      : rejected
        ? "CADASTRO RECUSADO"
        : courier.status === "pending"
          ? "CADASTRO PENDENTE"
          : courier.status === "approved"
            ? "APROVADO"
            : String(courier.status ?? "PENDENTE").replaceAll("_", " ");

  const StatusIcon = blocked || rejected ? AlertTriangle : FileCheck2;

  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-primary/10 bg-black/92 px-4 py-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur-xl">
        <img src={logoAsset.url} alt="APOIS ENTREGA" className="h-10 w-auto object-contain" />
        <button
          type="button"
          onClick={onLogout}
          className="rounded-full border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs font-bold text-red-300"
        >
          Sair
        </button>
      </header>

      <main className="mx-auto w-full max-w-lg space-y-4 p-4 pb-[max(env(safe-area-inset-bottom),2rem)]">
        <section
          className={`relative overflow-hidden rounded-[2rem] border p-5 shadow-[0_24px_65px_rgba(0,0,0,0.55)] ${
            blocked || rejected
              ? "border-red-500/25 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.12),transparent_38%),#0b0808]"
              : "border-primary/30 bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.14),transparent_38%),#090909]"
          }`}
        >
          <div
            className={`grid h-14 w-14 place-items-center rounded-2xl border ${blocked || rejected ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-primary/20 bg-primary/10 text-primary"}`}
          >
            <StatusIcon className="h-7 w-7" />
          </div>
          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
            Situação do cadastro
          </p>
          <h1
            className={`mt-1 text-2xl font-black ${blocked || rejected ? "text-red-300" : "text-primary"}`}
          >
            {statusLabel}
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            {blocked
              ? "Seu acesso operacional está bloqueado. Seus documentos ficam preservados enquanto a situação é analisada pelo suporte APOIS."
              : rejected
                ? "Revise os documentos recusados abaixo. Depois que todos estiverem enviados ou aprovados, reenvie seu cadastro para uma nova análise."
                : "Recebemos seus dados. Envie os documentos necessários e acompanhe aqui o andamento da análise."}
          </p>
          {courier.rejection_reason ? (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm leading-5 text-red-200">
              <b>Motivo:</b> {courier.rejection_reason}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onRefresh}
            className="mt-4 flex items-center gap-2 rounded-full border border-zinc-800 bg-black/65 px-3 py-2 text-xs font-bold text-zinc-300"
          >
            <RefreshCw className={`h-4 w-4 text-primary ${refreshing ? "animate-spin" : ""}`} />{" "}
            Atualizar situação
          </button>
        </section>

        <section className="rounded-[1.75rem] border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">
                Documentos
              </p>
              <h2 className="mt-1 font-black">Validação do entregador</h2>
            </div>
            <FileCheck2 className="h-6 w-6 text-primary" />
          </div>
          <div className="mt-4 space-y-3">
            {required.map((item) => {
              const doc = documents.find((row: any) => row.document_type === item.type);
              const approved = doc?.status === "approved";
              const docRejected = doc?.status === "rejected";
              return (
                <label
                  key={item.type}
                  className="block rounded-2xl border border-zinc-900 bg-black p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold">{item.label}</span>
                    <span
                      className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${approved ? "bg-emerald-500/10 text-emerald-400" : docRejected ? "bg-red-500/10 text-red-300" : "bg-primary/10 text-primary"}`}
                    >
                      {approved
                        ? "Aprovado"
                        : docRejected
                          ? "Recusado"
                          : doc?.status === "pending"
                            ? "Em análise"
                            : "Não enviado"}
                    </span>
                  </div>
                  {doc?.rejection_reason ? (
                    <p className="mt-2 text-xs leading-5 text-red-300">{doc.rejection_reason}</p>
                  ) : null}
                  {doc?.status === "pending" ? (
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      Arquivo recebido e aguardando análise.
                    </p>
                  ) : null}
                  {!blocked && !approved ? (
                    <>
                      <div className="mt-3 flex items-center gap-2 text-xs font-bold text-zinc-400">
                        <Upload className="h-4 w-4 text-primary" />
                        {busy === `doc:${item.type}`
                          ? "Enviando arquivo..."
                          : doc
                            ? "Substituir arquivo"
                            : "Selecionar arquivo"}
                      </div>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="mt-2 w-full rounded-xl border border-zinc-900 bg-zinc-950 p-2 text-xs text-zinc-500 file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-black file:text-black"
                        disabled={busy === `doc:${item.type}`}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          const input = event.currentTarget;
                          if (file) {
                            void onUpload(item.type, file).finally(() => {
                              input.value = "";
                            });
                          }
                        }}
                      />
                    </>
                  ) : approved ? (
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" /> Documento aprovado
                    </p>
                  ) : (
                    <p className="mt-3 text-xs font-bold text-amber-300">
                      Envio desativado enquanto a conta estiver bloqueada.
                    </p>
                  )}
                </label>
              );
            })}
          </div>
        </section>

        {rejected ? (
          <section className="rounded-[1.6rem] border border-primary/25 bg-primary/5 p-4">
            <button
              type="button"
              disabled={Boolean(busy) || !canResubmit}
              onClick={() => void onResubmit()}
              className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black text-black disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {busy === "application" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              REENVIAR PARA ANÁLISE
            </button>
            <p className="mt-2 text-center text-[11px] leading-4 text-zinc-500">
              {canResubmit
                ? "Seus documentos estão prontos para uma nova revisão."
                : "Substitua os documentos recusados e envie tudo que estiver faltando."}
            </p>
          </section>
        ) : null}

        <p className="px-3 text-center text-xs leading-5 text-zinc-600">
          {blocked
            ? "Entre em contato com o suporte APOIS para entender ou revisar o bloqueio."
            : "Depois da aprovação, o modo Online e as ofertas de entrega serão liberados automaticamente."}
        </p>
      </main>
    </div>
  );
}

export function CourierStatusCard({ online, busy, activeJob, onToggle }: any) {
  return (
    <section
      className={`rounded-[1.7rem] border p-4 shadow-[0_18px_45px_rgba(0,0,0,0.35)] ${online ? "border-primary/35 bg-[linear-gradient(135deg,rgba(250,204,21,0.09),#0a0a0a_58%)]" : "border-zinc-800 bg-zinc-950"}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border ${online ? "border-primary/25 bg-primary/10 text-primary" : "border-zinc-800 bg-black text-zinc-500"}`}
          >
            {online ? <Radio className="h-5 w-5" /> : <Power className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.17em] text-zinc-500">
              Disponibilidade
            </p>
            <p
              className={`mt-0.5 truncate text-lg font-black ${online ? "text-white" : "text-zinc-300"}`}
            >
              Você está {online ? <span className="text-primary">ONLINE</span> : "OFFLINE"}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {online
                ? "Disponível para receber entregas"
                : "Ative quando quiser começar sua jornada"}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={busy || Boolean(activeJob && online)}
          onClick={onToggle}
          aria-label={online ? "Ficar offline" : "Ficar online"}
          className={`relative h-9 w-[4.15rem] shrink-0 rounded-full border transition active:scale-95 disabled:opacity-50 ${online ? "border-primary bg-primary shadow-[0_0_24px_rgba(250,204,21,0.25)]" : "border-zinc-700 bg-zinc-900"}`}
        >
          <span
            className={`absolute top-1 grid h-7 w-7 place-items-center rounded-full shadow-lg transition-all ${online ? "left-[2.08rem] bg-black text-primary" : "left-1 bg-zinc-600 text-zinc-300"}`}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )}
          </span>
        </button>
      </div>
      {activeJob && online ? (
        <p className="mt-3 border-t border-zinc-800 pt-3 text-[11px] text-zinc-500">
          Finalize a entrega atual antes de ficar offline.
        </p>
      ) : null}
    </section>
  );
}

export function CourierWaitingSheet({ metrics, wallet, onRefresh }: any) {
  return (
    <section className="relative -mt-8 overflow-hidden rounded-t-[2rem] rounded-b-[1.7rem] border border-primary/30 bg-[linear-gradient(180deg,#0d0d0d,#070707)] px-4 pb-5 pt-3 shadow-[0_-18px_45px_rgba(0,0,0,0.6)]">
      <div className="mx-auto h-1.5 w-12 rounded-full bg-zinc-700" />
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-lg font-black">
            <LocateFixed className="h-5 w-5 text-primary" /> Aguardando entregas
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Você está disponível para receber pedidos.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Atualizar ofertas"
          className="grid h-10 w-10 place-items-center rounded-full border border-zinc-800 bg-black text-zinc-400 active:scale-95"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-zinc-800 rounded-2xl border border-zinc-800 bg-black/70 p-3">
        <div className="px-2 text-center">
          <p className="text-[9px] font-black uppercase leading-3 text-zinc-600">Ganhos hoje</p>
          <p className="mt-1.5 text-sm font-black text-primary">
            {courierMoney(metrics?.earnings_today)}
          </p>
        </div>
        <div className="px-2 text-center">
          <p className="text-[9px] font-black uppercase leading-3 text-zinc-600">
            Entregas concluídas
          </p>
          <p className="mt-1.5 text-sm font-black">{String(metrics?.completed_deliveries ?? 0)}</p>
        </div>
        <div className="px-2 text-center">
          <p className="text-[9px] font-black uppercase leading-3 text-zinc-600">Tempo online</p>
          <p className="mt-1.5 text-sm font-black">
            {formatCourierOnlineTime(metrics?.online_seconds_today)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-black">
          <Lightbulb className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black text-primary">Dica Apois</p>
          <p className="mt-1 text-[11px] leading-4 text-zinc-400">
            Mantenha o GPS ativo e fique em áreas com estabelecimentos parceiros para receber novas
            ofertas.
          </p>
          {wallet ? (
            <p className="mt-1 text-[10px] font-bold text-zinc-600">
              Saldo disponível: {courierMoney(wallet.available_balance)}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function CourierOfflineCard({ busy, onToggle }: any) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-primary/25 bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.14),transparent_38%),linear-gradient(145deg,#111,#070707)] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.5)]">
      <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full border border-primary/10" />
      <div className="relative flex items-start gap-4">
        <div className="relative grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-primary/30 bg-primary/10">
          <Bike className="h-8 w-8 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
            Sua jornada, seu horário
          </p>
          <h2 className="mt-1 text-xl font-black">Você está offline</h2>
          <p className="mt-2 text-sm leading-5 text-zinc-400">
            Ative quando quiser receber entregas. Sua localização é utilizada operacionalmente
            enquanto você estiver online.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        className="mt-5 flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 text-sm font-black uppercase tracking-[0.08em] text-black shadow-[0_12px_35px_rgba(250,204,21,0.22)] active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Power className="h-5 w-5" />}
        {busy ? "Ativando..." : "Ficar online agora"}
      </button>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { icon: LocateFixed, label: "GPS ativo" },
          { icon: Store, label: "Parceiros perto" },
          { icon: CircleDollarSign, label: "Ganhos reais" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-zinc-800 bg-black/55 px-2 py-3 text-center"
          >
            <item.icon className="mx-auto h-4 w-4 text-primary" />
            <p className="mt-2 text-[9px] font-bold text-zinc-400">{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CourierOfferCard({ offer, busy, onAccept, onReject }: any) {
  const job = offer.delivery_jobs ?? offer;
  const pickup = offer.pickup_address ?? job?.pickup_address ?? {};
  const delivery = offer.delivery_area ?? {};
  const merchantName = offer.merchant_name || pickup.name || "Estabelecimento parceiro";
  const orderNumber = offer.order_number ?? job?.orders?.order_number ?? job?.order_number;
  const itemCount = Number(offer.item_count ?? 0);
  const totalDistance = offer.total_distance_meters ?? job?.estimated_distance_meters;

  return (
    <section className="overflow-hidden rounded-[2rem] border border-primary/40 bg-[#080808] shadow-[0_0_55px_rgba(250,204,21,0.09)]">
      <div className="flex items-center justify-between gap-3 border-b border-primary/15 bg-[linear-gradient(135deg,rgba(250,204,21,0.12),transparent)] px-4 py-3">
        <span className="flex items-center gap-2 rounded-full border border-primary/30 bg-black/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-primary">
          <Radio className="h-3.5 w-3.5" /> Nova entrega
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500">
          <Clock3 className="h-3.5 w-3.5 text-primary" /> Chegou agora
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl border border-zinc-800 bg-zinc-900">
            <Store className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-black">{merchantName}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {orderNumber ? `Pedido #${orderNumber}` : "Pedido APOIS"}
              {itemCount > 0 ? ` · ${itemCount} ${itemCount === 1 ? "item" : "itens"}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[9px] font-black uppercase text-zinc-600">Ganho estimado</p>
            <p className="mt-1 text-xl font-black text-primary">
              {courierMoney(offer.estimated_earnings ?? job?.estimated_earnings)}
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-black">
          <div className="flex gap-3 p-3.5">
            <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-black">
              <Store className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase text-primary">Retirada</p>
              <p className="truncate text-sm font-bold">{merchantName}</p>
              <p className="mt-0.5 truncate text-xs text-zinc-500">
                {pickup.address_line || pickup.street || "Endereço do estabelecimento"}
              </p>
            </div>
            <span className="text-xs font-bold text-zinc-400">
              {distance(offer.pickup_distance_meters)}
            </span>
          </div>
          <div className="mx-7 h-4 border-l border-dashed border-zinc-700" />
          <div className="flex gap-3 p-3.5 pt-0">
            <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-black">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase text-primary">Entrega aproximada</p>
              <p className="truncate text-sm font-bold">
                {[delivery.neighborhood, delivery.city, delivery.state]
                  .filter(Boolean)
                  .join(" · ") || "Região aproximada"}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Endereço exato liberado somente após o aceite.
              </p>
            </div>
            <span className="text-xs font-bold text-zinc-400">
              {distance(offer.delivery_distance_meters)}
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 divide-x divide-zinc-800 rounded-2xl border border-zinc-800 bg-black p-3">
          <div className="flex items-center justify-center gap-2 px-2">
            <Clock3 className="h-5 w-5 text-primary" />
            <div>
              <p className="text-[9px] font-black uppercase text-zinc-600">Tempo estimado</p>
              <p className="text-sm font-black">
                {duration(offer.estimated_duration_seconds ?? job?.estimated_duration_seconds)}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 px-2">
            <RouteIcon className="h-5 w-5 text-primary" />
            <div>
              <p className="text-[9px] font-black uppercase text-zinc-600">Distância total</p>
              <p className="text-sm font-black">{distance(totalDistance)}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[0.8fr_1.2fr] gap-3">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void onReject(offer.id)}
            className="h-14 rounded-2xl border-primary/45 bg-transparent font-black text-primary hover:bg-primary/5"
          >
            Recusar
          </Button>
          <Button
            disabled={busy}
            onClick={() => void onAccept(offer.id)}
            className="h-14 rounded-2xl font-black text-black shadow-[0_10px_30px_rgba(250,204,21,0.18)]"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aceitar entrega"}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function ActiveDelivery({
  job,
  busy,
  supportBusy,
  pin,
  setPin,
  onTransition,
  onComplete,
  onReport,
}: any) {
  const pickup = job.pickup_address ?? {};
  const delivery = job.delivery_address ?? {};
  const action =
    job.status === "accepted"
      ? { status: "arriving_pickup", label: "A caminho da retirada", icon: Navigation }
      : job.status === "arriving_pickup"
        ? { status: "at_pickup", label: "Cheguei na retirada", icon: MapPin }
        : job.status === "at_pickup"
          ? { status: "picked_up", label: "Pedido coletado", icon: PackageCheck }
          : job.status === "picked_up"
            ? { status: "on_the_way", label: "A caminho do cliente", icon: RouteIcon }
            : job.status === "on_the_way"
              ? { status: "arrived_destination", label: "Cheguei ao destino", icon: MapPin }
              : null;
  const stageIndex =
    job.status === "accepted" || job.status === "arriving_pickup"
      ? 0
      : job.status === "at_pickup" || job.status === "picked_up"
        ? 1
        : job.status === "on_the_way" || job.status === "arrived_destination"
          ? 2
          : 3;
  const stages = ["Aceito", "Retirada", "Entrega", "Concluído"];

  return (
    <section className="relative -mt-7 overflow-hidden rounded-t-[2rem] rounded-b-[1.8rem] border border-primary/35 bg-[linear-gradient(180deg,#10100d,#070707)] p-4 pt-3 shadow-[0_-18px_45px_rgba(0,0,0,0.65)]">
      <div className="mx-auto h-1.5 w-12 rounded-full bg-zinc-700" />
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">
            Entrega em andamento
          </p>
          <p className="mt-1 text-xl font-black">Pedido #{job.orders?.order_number ?? "—"}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-black uppercase text-zinc-600">Ganhos estimados</p>
          <p className="mt-1 text-xl font-black text-primary">
            {courierMoney(job.estimated_earnings)}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-black">
        <div className="flex gap-3 p-3.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-black">
            <Store className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase text-primary">Retirada</p>
            <p className="truncate text-sm font-bold">{pickup.name || "Estabelecimento"}</p>
            <p className="truncate text-xs text-zinc-500">{pickup.address_line || pickup.street}</p>
          </div>
        </div>
        <div className="mx-7 h-4 border-l border-dashed border-zinc-700" />
        <div className="flex gap-3 p-3.5 pt-0">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-black">
            <MapPin className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase text-primary">Entrega</p>
            <p className="truncate text-sm font-bold">
              {delivery.street ? `${delivery.street}, ${delivery.number || "s/n"}` : "Destino"}
            </p>
            <p className="truncate text-xs text-zinc-500">{delivery.neighborhood}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 divide-x divide-zinc-800 rounded-2xl border border-zinc-800 bg-black p-3">
        <div className="flex items-center justify-center gap-2 px-2">
          <Clock3 className="h-5 w-5 text-primary" />
          <div>
            <p className="text-[9px] font-black uppercase text-zinc-600">Tempo estimado</p>
            <p className="text-sm font-black">{duration(job.estimated_duration_seconds)}</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 px-2">
          <RouteIcon className="h-5 w-5 text-primary" />
          <div>
            <p className="text-[9px] font-black uppercase text-zinc-600">Distância total</p>
            <p className="text-sm font-black">{distance(job.estimated_distance_meters)}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-1">
        {stages.map((stage, index) => (
          <div key={stage} className="text-center">
            <div className="flex items-center">
              <span
                className={`h-3 w-3 shrink-0 rounded-full border ${index <= stageIndex ? "border-primary bg-primary shadow-[0_0_14px_rgba(250,204,21,0.35)]" : "border-zinc-700 bg-zinc-950"}`}
              />
              {index < stages.length - 1 ? (
                <span
                  className={`h-px flex-1 ${index < stageIndex ? "bg-primary" : "bg-zinc-800"}`}
                />
              ) : null}
            </div>
            <p
              className={`mt-2 text-[9px] font-black ${index <= stageIndex ? "text-primary" : "text-zinc-600"}`}
            >
              {stage}
            </p>
          </div>
        ))}
      </div>

      {action ? (
        <Button
          disabled={busy}
          onClick={() => void onTransition(action.status)}
          className="mt-4 h-14 w-full rounded-2xl font-black uppercase tracking-[0.04em]"
        >
          {busy ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <action.icon className="mr-2 h-5 w-5" />
          )}
          {action.label}
        </Button>
      ) : null}

      {job.status === "arrived_destination" ? (
        <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-black">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-black">Confirme o PIN do cliente</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Peça o código de 4 dígitos antes de entregar o pedido.
              </p>
            </div>
          </div>
          <input
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="0000"
            className="mt-3 h-14 w-full rounded-2xl border border-zinc-800 bg-black px-4 text-center text-2xl font-black tracking-[0.45em] text-white outline-none focus:border-primary"
          />
          <Button
            disabled={busy || pin.length !== 4}
            onClick={onComplete}
            className="mt-3 h-13 w-full rounded-2xl font-black"
          >
            <CheckCircle2 className="mr-2 h-5 w-5" /> Confirmar entrega
          </Button>
        </div>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void onReport()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-black py-3 text-sm font-bold text-zinc-400 disabled:opacity-50"
      >
        {supportBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-300" />
        )}
        {supportBusy ? "Abrindo chamado..." : "Ajuda / Problema"}
      </button>
    </section>
  );
}

export function CourierFinance({
  wallet,
  metrics,
  transactions,
  payoutAccount,
  payouts,
  draft,
  setDraft,
  busy,
  onSaveAccount,
  onRequestPayout,
  onClose,
}: any) {
  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 z-40 grid min-h-20 grid-cols-[2.75rem_1fr_2.75rem] items-center border-b border-primary/10 bg-black/92 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-2xl">
        <button
          type="button"
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full border border-zinc-800 bg-zinc-950 text-zinc-300"
        >
          ←
        </button>
        <div className="flex flex-col items-center py-2">
          <img src={logoAsset.url} alt="APOIS ENTREGA" className="h-9 w-auto object-contain" />
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
            Meus ganhos
          </p>
        </div>
        <WalletCards className="h-5 w-5 justify-self-end text-primary" />
      </header>

      <main className="mx-auto w-full max-w-lg space-y-4 p-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
        <section className="rounded-[2rem] border border-primary/40 bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.16),transparent_38%),linear-gradient(145deg,#111,#070707)] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
          <div className="grid grid-cols-3 divide-x divide-zinc-800">
            <div className="pr-3">
              <p className="text-[9px] font-black uppercase leading-3 text-zinc-600">Ganhos hoje</p>
              <p className="mt-2 text-lg font-black">{courierMoney(metrics?.earnings_today)}</p>
            </div>
            <div className="px-3">
              <p className="text-[9px] font-black uppercase leading-3 text-zinc-600">
                Ganhos da semana
              </p>
              <p className="mt-2 text-lg font-black">{courierMoney(metrics?.earnings_week)}</p>
            </div>
            <div className="pl-3">
              <p className="text-[9px] font-black uppercase leading-3 text-zinc-600">
                Saldo disponível
              </p>
              <p className="mt-2 text-lg font-black text-primary">
                {courierMoney(wallet?.available_balance)}
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-end justify-between gap-3 border-t border-zinc-800 pt-4">
            <div>
              <p className="text-[10px] text-zinc-500">Saldo total</p>
              <p className="mt-1 font-black">{courierMoney(wallet?.balance)}</p>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-right">
              <p className="text-[9px] uppercase text-zinc-600">Reservado</p>
              <p className="text-sm font-black text-primary">
                {courierMoney(wallet?.reserved_balance)}
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-3 divide-x divide-zinc-800 rounded-[1.6rem] border border-zinc-800 bg-zinc-950 p-4 text-center">
          <div className="px-2">
            <CheckCircle2 className="mx-auto h-5 w-5 text-primary" />
            <p className="mt-2 text-[9px] font-black uppercase text-zinc-600">Aceitação</p>
            <p className="mt-1 text-sm font-black">
              {Number(metrics?.acceptance_rate ?? 0)
                .toFixed(1)
                .replace(".", ",")}
              %
            </p>
          </div>
          <div className="px-2">
            <Clock3 className="mx-auto h-5 w-5 text-primary" />
            <p className="mt-2 text-[9px] font-black uppercase text-zinc-600">Horas online</p>
            <p className="mt-1 text-sm font-black">
              {formatCourierOnlineTime(metrics?.online_seconds_week)}
            </p>
          </div>
          <div className="px-2">
            <Bike className="mx-auto h-5 w-5 text-primary" />
            <p className="mt-2 text-[9px] font-black uppercase text-zinc-600">Concluídas</p>
            <p className="mt-1 text-sm font-black">{String(metrics?.completed_deliveries ?? 0)}</p>
          </div>
        </section>

        {!wallet ? (
          <div className="rounded-[1.6rem] border border-dashed border-primary/20 bg-zinc-950 p-6 text-center">
            <WalletCards className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 font-black">Sua carteira aparecerá aqui</p>
            <p className="mt-1 text-sm leading-5 text-zinc-500">
              Ela será criada automaticamente após a primeira entrega liquidada.
            </p>
          </div>
        ) : (
          <>
            <section className="rounded-[1.6rem] border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex items-center gap-2">
                <CircleDollarSign className="h-5 w-5 text-primary" />
                <h2 className="font-black">Recebimento via PIX</h2>
              </div>
              <div className="mt-4 space-y-3">
                <FinanceInput
                  value={draft.pixKey}
                  onChange={(value: string) =>
                    setDraft((current: any) => ({ ...current, pixKey: value }))
                  }
                  placeholder="Chave PIX"
                />
                <FinanceInput
                  value={draft.holderName}
                  onChange={(value: string) =>
                    setDraft((current: any) => ({ ...current, holderName: value }))
                  }
                  placeholder="Nome do titular"
                />
                <FinanceInput
                  value={draft.document}
                  onChange={(value: string) =>
                    setDraft((current: any) => ({ ...current, document: value }))
                  }
                  placeholder="CPF/CNPJ do titular"
                />
                <Button
                  className="h-12 w-full rounded-2xl font-black"
                  disabled={busy === "account"}
                  onClick={onSaveAccount}
                >
                  {busy === "account" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{" "}
                  Salvar chave PIX
                </Button>
              </div>
            </section>

            <section className="rounded-[1.6rem] border border-primary/25 bg-[linear-gradient(145deg,rgba(250,204,21,0.08),#090909_60%)] p-4">
              <div className="flex items-center gap-2">
                <WalletCards className="h-5 w-5 text-primary" />
                <h2 className="font-black">Solicitar saque</h2>
              </div>
              <div className="mt-4 space-y-3">
                <FinanceInput
                  value={draft.amount}
                  onChange={(value: string) =>
                    setDraft((current: any) => ({ ...current, amount: value }))
                  }
                  placeholder="Valor do saque"
                  type="number"
                />
                <Button
                  className="h-13 w-full rounded-2xl font-black"
                  disabled={!payoutAccount || busy === "payout"}
                  onClick={onRequestPayout}
                >
                  {busy === "payout" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <WalletCards className="mr-2 h-4 w-4" />
                  )}{" "}
                  Solicitar saque
                </Button>
              </div>
              <p className="mt-3 text-[11px] leading-4 text-zinc-500">
                A solicitação entra em processamento após a reserva do saldo. O app não promete
                transferência instantânea.
              </p>
            </section>

            <FinanceList
              title="Histórico de saques"
              icon={CalendarDays}
              empty="Nenhum saque solicitado ainda."
            >
              {payouts.map((payout: any) => (
                <div
                  key={payout.id}
                  className="flex items-center justify-between gap-3 border-t border-zinc-900 py-3 first:border-t-0"
                >
                  <div>
                    <p className="font-bold">{courierMoney(payout.amount)}</p>
                    <p className="mt-0.5 text-xs text-zinc-600">{dateTime(payout.requested_at)}</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-black uppercase text-primary">
                    {payout.status}
                  </span>
                </div>
              ))}
            </FinanceList>

            <FinanceList
              title="Histórico financeiro"
              icon={CircleDollarSign}
              empty="Seu extrato aparecerá aqui."
            >
              {transactions.map((transaction: any) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between gap-3 border-t border-zinc-900 py-3 first:border-t-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {transaction.description || transaction.transaction_type}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-600">
                      {dateTime(transaction.created_at)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-black ${Number(transaction.balance_delta) >= 0 ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {Number(transaction.balance_delta) >= 0 ? "+" : ""}
                    {courierMoney(transaction.balance_delta)}
                  </span>
                </div>
              ))}
            </FinanceList>
          </>
        )}
      </main>
    </div>
  );
}

function FinanceInput({ value, onChange, placeholder, type = "text" }: any) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      type={type}
      step={type === "number" ? "0.01" : undefined}
      placeholder={placeholder}
      className="h-13 w-full rounded-2xl border border-zinc-800 bg-black px-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-primary"
    />
  );
}

function FinanceList({ title, icon: Icon, empty, children }: any) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="rounded-[1.6rem] border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="font-black">{title}</h2>
      </div>
      <div className="mt-3">
        {hasChildren ? (
          children
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-black p-5 text-center text-sm text-zinc-500">
            {empty}
          </div>
        )}
      </div>
    </section>
  );
}
