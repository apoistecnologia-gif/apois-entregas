from pathlib import Path

p = Path('src/routes/courier.tsx')
s = p.read_text(encoding='utf-8')

needle = '  const startupAvailabilityHandledRef = useRef(false);\n'
repl = needle + '''  const audioContextRef = useRef<AudioContext | null>(null);\n  const offerAlertIntervalRef = useRef<number | null>(null);\n  const offerAlertActiveRef = useRef(false);\n\n  const ensureOfferAudioContext = useCallback(() => {\n    if (typeof window === "undefined") return null;\n    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;\n    if (!AudioContextCtor) return null;\n    if (!audioContextRef.current) audioContextRef.current = new AudioContextCtor();\n    if (audioContextRef.current.state === "suspended") void audioContextRef.current.resume();\n    return audioContextRef.current;\n  }, []);\n\n  const stopOfferAlert = useCallback(() => {\n    offerAlertActiveRef.current = false;\n    if (offerAlertIntervalRef.current !== null) {\n      window.clearInterval(offerAlertIntervalRef.current);\n      offerAlertIntervalRef.current = null;\n    }\n    if (navigator.vibrate) navigator.vibrate(0);\n  }, []);\n\n  const playOfferAlertPulse = useCallback(() => {\n    const context = ensureOfferAudioContext();\n    if (context) {\n      const now = context.currentTime;\n      [0, 0.18, 0.36].forEach((offset, index) => {\n        const oscillator = context.createOscillator();\n        const gain = context.createGain();\n        oscillator.type = "square";\n        oscillator.frequency.setValueAtTime(index === 1 ? 1040 : 880, now + offset);\n        gain.gain.setValueAtTime(0.0001, now + offset);\n        gain.gain.exponentialRampToValueAtTime(0.22, now + offset + 0.015);\n        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);\n        oscillator.connect(gain);\n        gain.connect(context.destination);\n        oscillator.start(now + offset);\n        oscillator.stop(now + offset + 0.16);\n      });\n    }\n    if (navigator.vibrate) navigator.vibrate([280, 120, 280, 120, 420]);\n  }, [ensureOfferAudioContext]);\n\n  const startOfferAlert = useCallback(() => {\n    if (offerAlertActiveRef.current) return;\n    offerAlertActiveRef.current = true;\n    playOfferAlertPulse();\n    offerAlertIntervalRef.current = window.setInterval(() => {\n      if (offerAlertActiveRef.current) playOfferAlertPulse();\n    }, 2200);\n  }, [playOfferAlertPulse]);\n'''
if needle not in s:
    raise SystemExit('alert ref insertion target not found')
s = s.replace(needle, repl, 1)

needle = '''  useEffect(() => {\n    void loadAll();\n  }, [loadAll]);\n'''
repl = needle + '''\n  useEffect(() => {\n    const shouldAlert = Boolean(availability?.is_online && !activeJob && offers.length > 0);\n    if (shouldAlert) startOfferAlert();\n    else stopOfferAlert();\n    return () => {\n      if (!shouldAlert) stopOfferAlert();\n    };\n  }, [availability?.is_online, activeJob, offers.length, startOfferAlert, stopOfferAlert]);\n\n  useEffect(\n    () => () => {\n      stopOfferAlert();\n      if (audioContextRef.current) void audioContextRef.current.close();\n      audioContextRef.current = null;\n    },\n    [stopOfferAlert],\n  );\n'''
if needle not in s:
    raise SystemExit('alert effect insertion target not found')
s = s.replace(needle, repl, 1)

needle = '''    if (target) {\n      if (!navigator.geolocation) {'''
repl = '''    if (target) {\n      ensureOfferAudioContext();\n      if (!navigator.geolocation) {'''
if needle not in s:
    raise SystemExit('online audio unlock target not found')
s = s.replace(needle, repl, 1)

needle = '''  const acceptOffer = async (offerId: string) => {\n    if (!courier?.id) return;\n    setBusy(`offer:${offerId}`);'''
repl = '''  const acceptOffer = async (offerId: string) => {\n    if (!courier?.id) return;\n    stopOfferAlert();\n    setBusy(`offer:${offerId}`);'''
if needle not in s:
    raise SystemExit('accept target not found')
s = s.replace(needle, repl, 1)

needle = '''  const rejectOffer = async (offerId: string) => {\n    if (!courier?.id) return;\n    setBusy(`offer:${offerId}`);'''
repl = '''  const rejectOffer = async (offerId: string) => {\n    if (!courier?.id) return;\n    stopOfferAlert();\n    setBusy(`offer:${offerId}`);'''
if needle not in s:
    raise SystemExit('reject target not found')
s = s.replace(needle, repl, 1)

p.write_text(s, encoding='utf-8')
# trigger
