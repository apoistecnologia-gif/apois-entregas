from pathlib import Path

p = Path("src/routes/courier.tsx")
s = p.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global s
    if old not in s:
        raise SystemExit(f"{label} target not found")
    s = s.replace(old, new, 1)


replace_once(
    '''        from("delivery_offers")
          .select("*, delivery_jobs(*, orders(order_number,total,status))")
          .eq("courier_id", courierId)
          .eq("status", "offered")
          .gt("expires_at", new Date().toISOString())
          .order("offered_at"),''',
    '''        rpc("get_courier_incoming_offers"),''',
    "incoming offer query",
)

replace_once(
    '''            activeOfferMerchantIds={offers
              .map((offer) => offer.delivery_jobs?.merchant_id)
              .filter(Boolean)}''',
    '''            activeOfferMerchantIds={offers.map((offer) => offer.merchant_id).filter(Boolean)}''',
    "merchant markers",
)

replace_once(
    '''      offers.reduce((sum, offer) => sum + Number(offer.delivery_jobs?.estimated_earnings || 0), 0),''',
    '''      offers.reduce((sum, offer) => sum + Number(offer.estimated_earnings || 0), 0),''',
    "expected earnings",
)

replace_once(
    '''function OfferCard({ offer, busy, onAccept, onReject }: any) {
  const job = offer.delivery_jobs;
  const pickup = job?.pickup_address ?? {};
  const delivery = job?.delivery_address ?? {};
  const distanceKm = Number(job?.estimated_distance_meters || 0) / 1000;
  const durationMinutes = Math.max(
    1,
    Math.round(Number(job?.estimated_duration_seconds || 0) / 60),
  );''',
    '''function OfferCard({ offer, busy, onAccept, onReject }: any) {
  const job = offer.delivery_jobs ?? offer;
  const pickup = offer.pickup_address ?? job?.pickup_address ?? {};
  const delivery = offer.delivery_area ?? job?.delivery_address ?? {};
  const distanceKm =
    Number(offer.delivery_distance_meters ?? job?.estimated_distance_meters ?? 0) / 1000;
  const durationMinutes = Math.max(
    1,
    Math.round(
      Number(offer.estimated_duration_seconds ?? job?.estimated_duration_seconds ?? 0) / 60,
    ),
  );''',
    "OfferCard data",
)

replace_once(
    '''            <p className="font-bold">
              {delivery.street || "Destino"}, {delivery.number || "s/n"}
            </p>
            <p className="text-xs text-zinc-500">{delivery.neighborhood || ""}</p>''',
    '''            <p className="font-bold">
              {[delivery.neighborhood, delivery.city, delivery.state].filter(Boolean).join(" · ") ||
                "Região aproximada"}
            </p>
            <p className="text-xs text-zinc-500">Endereço exato liberado após o aceite</p>''',
    "OfferCard destination",
)

replace_once(
    "money(job?.estimated_earnings)",
    "money(offer.estimated_earnings ?? job?.estimated_earnings)",
    "OfferCard earnings",
)
replace_once(
    "Number(job?.estimated_duration_seconds || 0) > 0",
    "Number(offer.estimated_duration_seconds ?? job?.estimated_duration_seconds ?? 0) > 0",
    "OfferCard duration",
)

replace_once(
    '{ status: "arriving_pickup", label: "Ir para o estabelecimento", icon: Navigation }',
    '{ status: "arriving_pickup", label: "Ir para retirada", icon: Navigation }',
    "accepted CTA",
)
replace_once(
    '{ status: "at_pickup", label: "Cheguei ao estabelecimento", icon: MapPin }',
    '{ status: "at_pickup", label: "Cheguei na retirada", icon: MapPin }',
    "pickup arrival CTA",
)
replace_once(
    '{ status: "picked_up", label: "Pedido retirado", icon: PackageCheck }',
    '{ status: "picked_up", label: "Pedido coletado", icon: PackageCheck }',
    "pickup CTA",
)
replace_once("            Finalizar entrega", "            Confirmar entrega", "PIN CTA")

active_marker = s.find("function ActiveDelivery(")
if active_marker < 0:
    raise SystemExit("ActiveDelivery not found")

old_return = '''  return (
    <section className="rounded-3xl border border-primary/30 bg-zinc-950 p-5">'''
new_return = '''  const stageIndex =
    job.status === "accepted" || job.status === "arriving_pickup"
      ? 0
      : job.status === "at_pickup" || job.status === "picked_up"
        ? 1
        : job.status === "on_the_way" || job.status === "arrived_destination"
          ? 2
          : 3;
  const stages = ["Aceito", "Retirada", "Entrega", "Concluído"];
  return (
    <section className="rounded-[2rem] border border-primary/35 bg-[linear-gradient(180deg,#111111,#070707)] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.55)]">'''
relative = s[active_marker:]
if old_return not in relative:
    raise SystemExit("ActiveDelivery return target not found")
s = s[:active_marker] + relative.replace(old_return, new_return, 1)

replace_once(
    '''      <div className="mt-4 rounded-xl bg-black px-3 py-2 text-center text-[10px] font-black uppercase text-zinc-500">
        Etapa atual: {job.status.replaceAll("_", " ")}
      </div>''',
    '''      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-zinc-900 bg-black p-3 text-center">
          <p className="text-[9px] font-black uppercase text-zinc-600">Ganho</p>
          <p className="mt-1 text-sm font-black text-primary">{money(job.estimated_earnings)}</p>
        </div>
        <div className="rounded-2xl border border-zinc-900 bg-black p-3 text-center">
          <p className="text-[9px] font-black uppercase text-zinc-600">Distância</p>
          <p className="mt-1 text-sm font-black">
            {Number(job.estimated_distance_meters || 0) > 0
              ? `${(Number(job.estimated_distance_meters) / 1000).toFixed(1).replace(".", ",")} km`
              : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-900 bg-black p-3 text-center">
          <p className="text-[9px] font-black uppercase text-zinc-600">Tempo</p>
          <p className="mt-1 text-sm font-black">
            {Number(job.estimated_duration_seconds || 0) > 0
              ? `${Math.max(1, Math.round(Number(job.estimated_duration_seconds) / 60))} min`
              : "—"}
          </p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-1">
        {stages.map((stage, index) => (
          <div key={stage} className="text-center">
            <div className="flex items-center">
              <span
                className={`h-3 w-3 shrink-0 rounded-full border ${
                  index <= stageIndex
                    ? "border-primary bg-primary shadow-[0_0_14px_rgba(250,204,21,0.35)]"
                    : "border-zinc-700 bg-zinc-950"
                }`}
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
      </div>''',
    "ActiveDelivery timeline",
)

p.write_text(s)
