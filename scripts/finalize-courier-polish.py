from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f"{label} target not found")
    return source.replace(old, new, 1)


courier = Path("src/routes/courier.tsx")
s = courier.read_text()

s = replace_once(
    s,
    '''  const startupAvailabilityHandledRef = useRef(false);\n  const audioContextRef = useRef<AudioContext | null>(null);\n  const offerAlertIntervalRef = useRef<number | null>(null);\n  const offerAlertActiveRef = useRef(false);\n\n  const ensureOfferAudioContext = useCallback(() => {\n    if (typeof window === "undefined") return null;\n    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;\n    if (!AudioContextCtor) return null;\n    if (!audioContextRef.current) audioContextRef.current = new AudioContextCtor();\n    if (audioContextRef.current.state === "suspended") void audioContextRef.current.resume();\n    return audioContextRef.current;\n  }, []);\n\n  const stopOfferAlert = useCallback(() => {\n    offerAlertActiveRef.current = false;\n    if (offerAlertIntervalRef.current !== null) {\n      window.clearInterval(offerAlertIntervalRef.current);\n      offerAlertIntervalRef.current = null;\n    }\n    if (navigator.vibrate) navigator.vibrate(0);\n  }, []);\n\n  const playOfferAlertPulse = useCallback(() => {\n    const context = ensureOfferAudioContext();\n    if (context) {\n      const now = context.currentTime;\n      [0, 0.18, 0.36].forEach((offset, index) => {\n        const oscillator = context.createOscillator();\n        const gain = context.createGain();\n        oscillator.type = "square";\n        oscillator.frequency.setValueAtTime(index === 1 ? 1040 : 880, now + offset);\n        gain.gain.setValueAtTime(0.0001, now + offset);\n        gain.gain.exponentialRampToValueAtTime(0.22, now + offset + 0.015);\n        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);\n        oscillator.connect(gain);\n        gain.connect(context.destination);\n        oscillator.start(now + offset);\n        oscillator.stop(now + offset + 0.16);\n      });\n    }\n    if (navigator.vibrate) navigator.vibrate([280, 120, 280, 120, 420]);\n  }, [ensureOfferAudioContext]);\n\n  const startOfferAlert = useCallback(() => {\n    if (offerAlertActiveRef.current) return;\n    offerAlertActiveRef.current = true;\n    playOfferAlertPulse();\n    offerAlertIntervalRef.current = window.setInterval(() => {\n      if (offerAlertActiveRef.current) playOfferAlertPulse();\n    }, 2200);\n  }, [playOfferAlertPulse]);''',
    '''  const startupAvailabilityHandledRef = useRef(false);''',
    "duplicate route offer alert",
)

s = replace_once(
    s,
    '''  useEffect(() => {\n    const shouldAlert = Boolean(availability?.is_online && !activeJob && offers.length > 0);\n    if (shouldAlert) startOfferAlert();\n    else stopOfferAlert();\n    return () => {\n      if (!shouldAlert) stopOfferAlert();\n    };\n  }, [availability?.is_online, activeJob, offers.length, startOfferAlert, stopOfferAlert]);\n\n  useEffect(\n    () => () => {\n      stopOfferAlert();\n      if (audioContextRef.current) void audioContextRef.current.close();\n      audioContextRef.current = null;\n    },\n    [stopOfferAlert],\n  );\n\n''',
    "",
    "duplicate offer alert effects",
)

s = replace_once(
    s,
    "      ensureOfferAudioContext();\n",
    "",
    "online audio unlock leftover",
)
s = replace_once(s, "    stopOfferAlert();\n", "", "accept offer alert leftover")
s = replace_once(s, "    stopOfferAlert();\n", "", "reject offer alert leftover")

s = replace_once(
    s,
    '<h1 className="font-black">Carteira</h1>',
    '<h1 className="font-black">Meus ganhos</h1>',
    "finance title",
)
s = replace_once(
    s,
    '<div className="rounded-3xl bg-primary p-6 text-black">\n          <p className="text-xs font-black uppercase">Disponível para saque</p>\n          <p className="mt-2 text-4xl font-black">{money(wallet?.available_balance)}</p>\n          <p className="mt-2 text-xs opacity-70">',
    '<div className="rounded-3xl border border-primary/40 bg-[linear-gradient(145deg,rgba(250,204,21,0.12),#090909_62%)] p-6 text-white shadow-[0_20px_55px_rgba(0,0,0,0.5)]">\n          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">Saldo disponível</p>\n          <p className="mt-2 text-4xl font-black text-primary">{money(wallet?.available_balance)}</p>\n          <p className="mt-2 text-xs text-zinc-500">',
    "finance balance card",
)
s = replace_once(
    s,
    '''              <Button\n                className="w-full"\n                disabled={!payoutAccount || busy === "payout"}\n                onClick={onRequestPayout}\n              >\n                Solicitar\n              </Button>''',
    '''              <Button\n                className="h-12 w-full rounded-xl font-black"\n                disabled={!payoutAccount || busy === "payout"}\n                onClick={onRequestPayout}\n              >\n                Solicitar saque\n              </Button>\n              <p className="text-[11px] leading-4 text-zinc-500">\n                A solicitação entra em processamento após a reserva do saldo. O app não promete transferência instantânea.\n              </p>''',
    "payout disclaimer",
)

s = replace_once(
    s,
    '<CourierBottomNav\n          onHome={() => setHistoryOpen(false)}',
    '<CourierBottomNav\n          active="history"\n          onHome={() => setHistoryOpen(false)}',
    "history nav active",
)
s = replace_once(
    s,
    '<CourierBottomNav\n          onHome={() => setProfileOpen(false)}',
    '<CourierBottomNav\n          active="profile"\n          onHome={() => setProfileOpen(false)}',
    "profile nav active",
)
s = replace_once(
    s,
    '<CourierBottomNav\n          onHome={() => setFinanceOpen(false)}',
    '<CourierBottomNav\n          active="finance"\n          onHome={() => setFinanceOpen(false)}',
    "finance nav active",
)
s = replace_once(
    s,
    '<CourierBottomNav\n        onHome={() => window.scrollTo',
    '<CourierBottomNav\n        active="home"\n        onHome={() => window.scrollTo',
    "home nav active",
)

courier.write_text(s)

panels = Path("src/components/CourierPanels.tsx")
p = panels.read_text()
p = replace_once(
    p,
    '''export function CourierBottomNav({\n  onHome,\n  onHistory,\n  onFinance,\n  onProfile,\n}: {\n  onHome: () => void;''',
    '''export function CourierBottomNav({\n  active = "home",\n  onHome,\n  onHistory,\n  onFinance,\n  onProfile,\n}: {\n  active?: "home" | "history" | "finance" | "profile";\n  onHome: () => void;''',
    "bottom nav active prop",
)
p = replace_once(
    p,
    '''  const items = [\n    { label: "Início", icon: House, onClick: onHome },\n    { label: "Corridas", icon: Bike, onClick: onHistory },\n    { label: "Ganhos", icon: WalletCards, onClick: onFinance },\n    { label: "Perfil", icon: UserRound, onClick: onProfile },\n  ];''',
    '''  const items = [\n    { id: "home", label: "Início", icon: House, onClick: onHome },\n    { id: "history", label: "Corridas", icon: Bike, onClick: onHistory },\n    { id: "finance", label: "Ganhos", icon: WalletCards, onClick: onFinance },\n    { id: "profile", label: "Perfil", icon: UserRound, onClick: onProfile },\n  ] as const;''',
    "bottom nav item ids",
)
p = replace_once(
    p,
    '''            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold text-zinc-500 transition-colors active:bg-zinc-900 active:text-primary"\n          >\n            <item.icon className="h-5 w-5" />\n            {item.label}''',
    '''            aria-current={active === item.id ? "page" : undefined}\n            className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold transition-colors active:bg-zinc-900 ${\n              active === item.id ? "text-primary" : "text-zinc-500"\n            }`}\n          >\n            <item.icon className="h-5 w-5" />\n            {item.label}\n            {active === item.id ? (\n              <span className="absolute bottom-0 h-0.5 w-7 rounded-full bg-primary" />\n            ) : null}''',
    "bottom nav active style",
)
panels.write_text(p)

offer = Path("src/components/CourierOfferOverlay.tsx")
o = offer.read_text()
o = replace_once(
    o,
    'className="fixed inset-0 z-[1400] flex items-end justify-center bg-black/85 p-3 backdrop-blur-md"',
    'className="fixed inset-x-0 top-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[1400] flex items-end justify-center bg-black/85 p-3 backdrop-blur-md"',
    "offer overlay viewport",
)
offer.write_text(o)

active = Path("src/components/CourierActiveDeliveryOverlay.tsx")
a = active.read_text()
a = replace_once(
    a,
    'className="pointer-events-none fixed inset-0 z-[1250] flex items-end justify-center p-3"',
    'className="pointer-events-none fixed inset-x-0 top-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[1250] flex items-end justify-center p-3"',
    "active overlay viewport",
)
active.write_text(a)
