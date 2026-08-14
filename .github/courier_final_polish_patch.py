from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)


route_path = Path("src/routes/courier.tsx")
text = route_path.read_text(encoding="utf-8")

text = replace_once(
    text,
    '''  Upload,\n  WalletCards,\n  XCircle,''',
    '''  Upload,\n  UserRound,\n  WalletCards,\n  XCircle,''',
    "add UserRound import",
)
text = replace_once(
    text,
    '''import { useCallback, useEffect, useMemo, useRef, useState } from "react";''',
    '''import { useCallback, useEffect, useMemo, useState } from "react";''',
    "remove route useRef import",
)
text = replace_once(
    text,
    '''import { CourierLiveMap, CourierRouteMap } from "@/components/CourierRouteMap";''',
    '''import { CourierLiveMap, CourierRouteMap } from "@/components/CourierRouteMap";\nimport logoAsset from "@/assets/logo.png.asset.json";''',
    "add logo asset",
)
text = replace_once(
    text,
    '''  const [loading, setLoading] = useState(true);\n  const [refreshing, setRefreshing] = useState(false);''',
    '''  const [loading, setLoading] = useState(true);\n  const [appError, setAppError] = useState<string | null>(null);\n  const [refreshing, setRefreshing] = useState(false);''',
    "add app error state",
)
text = replace_once(
    text,
    '''  const [currentPosition, setCurrentPosition] = useState<CourierPosition | null>(null);\n  const startupAvailabilityHandledRef = useRef(false);''',
    '''  const [currentPosition, setCurrentPosition] = useState<CourierPosition | null>(null);''',
    "remove startup availability ref",
)

startup_old = '''        if (courierRow.status === "approved" && courierRow.is_active) {\n          if (!startupAvailabilityHandledRef.current) {\n            startupAvailabilityHandledRef.current = true;\n            const activeDeliveryRes = await from("delivery_jobs")\n              .select("id")\n              .eq("courier_id", courierRow.id)\n              .in("status", [\n                "accepted",\n                "arriving_pickup",\n                "at_pickup",\n                "picked_up",\n                "on_the_way",\n                "arrived_destination",\n              ])\n              .limit(1)\n              .maybeSingle();\n\n            if (!activeDeliveryRes.data) {\n              const { error: offlineError } = await rpc("set_courier_online", {\n                _is_online: false,\n              });\n              if (offlineError)\n                console.warn("courier startup offline reset failed", offlineError.message);\n              setCurrentPosition(null);\n            }\n          }\n          await loadCourierOperations(courierRow.id);\n        }'''
startup_new = '''        if (courierRow.status === "approved" && courierRow.is_active) {\n          // Preserve the server-side online state on a quick app reopen so a still-valid offer\n          // can be recovered immediately. Stale couriers are already excluded by dispatch, and\n          // CourierLocationTracker refreshes location/heartbeat as soon as this screen resumes.\n          await loadCourierOperations(courierRow.id);\n        }'''
text = replace_once(text, startup_old, startup_new, "preserve online state on reopen")

text = replace_once(
    text,
    '''      quiet ? setRefreshing(true) : setLoading(true);\n      try {''',
    '''      quiet ? setRefreshing(true) : setLoading(true);\n      setAppError(null);\n      try {''',
    "reset app error",
)
text = replace_once(
    text,
    '''      } catch (error: any) {\n        toast.error(error?.message || "Não foi possível carregar o app do entregador.");\n      } finally {''',
    '''      } catch (error: any) {\n        const message = error?.message || "Não foi possível carregar o app do entregador.";\n        setAppError(message);\n        toast.error(message);\n      } finally {''',
    "persist load error",
)

loading_old = '''  if (loading)\n    return (\n      <div className="grid min-h-dvh place-items-center bg-black">\n        <Loader2 className="h-8 w-8 animate-spin text-primary" />\n      </div>\n    );\n  if (!courier)'''
loading_new = '''  if (loading)\n    return (\n      <div className="grid min-h-dvh place-items-center bg-black">\n        <Loader2 className="h-8 w-8 animate-spin text-primary" />\n      </div>\n    );\n  if (appError)\n    return (\n      <div className="grid min-h-dvh place-items-center bg-black p-5 text-white">\n        <section className="w-full max-w-sm rounded-[2rem] border border-red-500/20 bg-zinc-950 p-6 text-center">\n          <XCircle className="mx-auto h-10 w-10 text-red-400" />\n          <h1 className="mt-4 text-xl font-black">Não foi possível carregar o app</h1>\n          <p className="mt-2 text-sm leading-5 text-zinc-500">\n            {appError === "Sessão expirada."\n              ? "Sua sessão expirou. Entre novamente para continuar."\n              : "Verifique sua conexão com a internet e tente novamente."}\n          </p>\n          {appError === "Sessão expirada." ? (\n            <Button onClick={() => navigate({ to: "/login" })} className="mt-5 h-12 w-full rounded-2xl font-black">\n              ENTRAR NOVAMENTE\n            </Button>\n          ) : (\n            <Button onClick={() => void loadAll()} className="mt-5 h-12 w-full rounded-2xl font-black">\n              <RefreshCw className="mr-2 h-4 w-4" /> TENTAR NOVAMENTE\n            </Button>\n          )}\n        </section>\n      </div>\n    );\n  if (!courier)'''
text = replace_once(text, loading_old, loading_new, "add network/session error screen")

header_old = '''      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-900 bg-black/90 p-4 backdrop-blur">\n        <div>\n          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">\n            APOIS ENTREGADOR\n          </p>\n          <p className="text-sm text-zinc-500">Olá, {user?.email?.split("@")[0]}</p>\n        </div>\n        <div className="flex gap-2">\n          <button\n            type="button"\n            onClick={() => setFinanceOpen(true)}\n            className="rounded-full bg-zinc-900 p-2"\n          >\n            <WalletCards className="h-5 w-5" />\n          </button>\n          <button\n            type="button"\n            onClick={logout}\n            className="rounded-full bg-zinc-900 p-2 text-red-400"\n          >\n            <LogOut className="h-5 w-5" />\n          </button>\n        </div>\n      </header>'''
header_new = '''      <header className="sticky top-0 z-40 grid h-20 grid-cols-[3rem_1fr_3rem] items-center border-b border-zinc-900 bg-black/92 px-4 backdrop-blur-xl">\n        <div aria-hidden="true" />\n        <div className="flex justify-center">\n          <img src={logoAsset.url} alt="APOIS ENTREGA" className="h-11 w-auto object-contain" />\n        </div>\n        <button\n          type="button"\n          onClick={() => setProfileOpen(true)}\n          aria-label="Abrir perfil"\n          className="relative grid h-11 w-11 place-items-center justify-self-end rounded-full border border-zinc-800 bg-zinc-950 text-zinc-300 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"\n        >\n          <UserRound className="h-5 w-5" />\n          <span\n            className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-black ${availability?.is_online ? "bg-emerald-400" : "bg-zinc-600"}`}\n          />\n        </button>\n      </header>'''
text = replace_once(text, header_old, header_new, "premium courier header")

route_path.write_text(text, encoding="utf-8")

panels_path = Path("src/components/CourierPanels.tsx")
panels = panels_path.read_text(encoding="utf-8")
panels = replace_once(
    panels,
    '''  MapPin,\n  Star,''',
    '''  MapPin,\n  Route as RouteIcon,\n  Star,''',
    "add history route icon",
)
panels = replace_once(
    panels,
    '''            const isDelivered = job.status === "delivered";\n            return (''',
    '''            const isDelivered = job.status === "delivered";\n            const distanceMeters = Number(job.estimated_distance_meters ?? 0);\n            return (''',
    "history distance value",
)
panels = replace_once(
    panels,
    '''                <div className="mt-3 flex items-end justify-between gap-3 border-t border-zinc-900 pt-3">\n                  <div>\n                    <p className="text-[9px] font-black uppercase text-zinc-600">Finalizada em</p>\n                    <p className="text-xs text-zinc-400">\n                      {dateTime(job.delivered_at || job.cancelled_at || job.updated_at)}\n                    </p>\n                  </div>\n                  {isDelivered ? (\n                    <div className="text-right">\n                      <p className="text-[9px] font-black uppercase text-zinc-600">Ganho</p>\n                      <p className="font-black text-primary">{money(job.estimated_earnings)}</p>\n                    </div>\n                  ) : null}\n                </div>''',
    '''                <div className="mt-3 grid grid-cols-[1fr_auto_auto] items-end gap-4 border-t border-zinc-900 pt-3">\n                  <div className="min-w-0">\n                    <p className="text-[9px] font-black uppercase text-zinc-600">Finalizada em</p>\n                    <p className="truncate text-xs text-zinc-400">\n                      {dateTime(job.delivered_at || job.cancelled_at || job.updated_at)}\n                    </p>\n                  </div>\n                  <div className="text-right">\n                    <p className="text-[9px] font-black uppercase text-zinc-600">Distância</p>\n                    <p className="flex items-center justify-end gap-1 text-xs font-bold text-zinc-300">\n                      <RouteIcon className="h-3 w-3 text-primary" />\n                      {distanceMeters > 0\n                        ? `${(distanceMeters / 1000).toFixed(1).replace(".", ",")} km`\n                        : "—"}\n                    </p>\n                  </div>\n                  {isDelivered ? (\n                    <div className="text-right">\n                      <p className="text-[9px] font-black uppercase text-zinc-600">Ganho</p>\n                      <p className="font-black text-primary">{money(job.estimated_earnings)}</p>\n                    </div>\n                  ) : null}\n                </div>''',
    "history footer distance",
)
panels = replace_once(
    panels,
    '''              <p className="break-all pr-1 text-base font-black leading-snug sm:text-lg">\n                {user?.email || "Entregador APOIS"}\n              </p>\n              <p className="mt-1 text-xs font-bold uppercase text-emerald-400">Cadastro aprovado</p>''',
    '''              <p className="pr-1 text-base font-black leading-snug sm:text-lg">\n                {user?.user_metadata?.full_name || user?.user_metadata?.name || "Entregador APOIS"}\n              </p>\n              <p className="mt-1 break-all text-xs text-zinc-500">{user?.email || "Conta APOIS"}</p>\n              <p className="mt-2 text-xs font-bold uppercase text-emerald-400">Cadastro aprovado</p>''',
    "profile display name",
)
panels_path.write_text(panels, encoding="utf-8")
