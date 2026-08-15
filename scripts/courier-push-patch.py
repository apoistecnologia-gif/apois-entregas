from pathlib import Path
import re

push = Path("src/lib/courier-push.ts")
s = push.read_text(encoding="utf-8")
s = s.replace(
    'import { Capacitor } from "@capacitor/core";\nimport {\n  PushNotifications,\n  type PluginListenerHandle,\n  type PushNotificationSchema,\n} from "@capacitor/push-notifications";',
    'import { Capacitor, type PluginListenerHandle } from "@capacitor/core";\nimport { PushNotifications, type PushNotificationSchema } from "@capacitor/push-notifications";',
    1,
)
push.write_text(s, encoding="utf-8")

route = Path("src/routes/courier.tsx")
s = route.read_text(encoding="utf-8")

import_anchor = 'import { clearPayoutAttemptKey, getPayoutAttemptKey } from "@/lib/payout-attempt";\n'
import_addition = (
    'import {\n'
    '  ensureCourierPushRegistration,\n'
    '  installCourierPushListeners,\n'
    '  isNativeCourierAndroid,\n'
    '  removeCourierPushRegistration,\n'
    '} from "@/lib/courier-push";\n'
)
if 'from "@/lib/courier-push"' not in s:
    if import_anchor not in s:
        raise SystemExit("courier import anchor not found")
    s = s.replace(import_anchor, import_anchor + import_addition, 1)

if "installCourierPushListeners().then" not in s:
    marker = "  useEffect(() => {\n    void loadAll();\n  }, [loadAll]);\n"
    addition = (
        "\n  useEffect(() => {\n"
        '    if (!courier?.id || courier.status !== "approved" || !courier.is_active) return;\n'
        "    void installCourierPushListeners().then(() => ensureCourierPushRegistration(false));\n"
        "  }, [courier?.id, courier?.is_active, courier?.status]);\n"
    )
    if marker not in s:
        raise SystemExit("courier bootstrap anchor not found")
    s = s.replace(marker, marker + addition, 1)

if "Conclua a entrega ativa antes de sair da conta." not in s:
    pattern = re.compile(
        r"  const logout = async \(\) => \{.*?\n  \};\n\n  const submitApplication", re.S
    )
    replacement = (
        "  const logout = async () => {\n"
        "    if (activeJob) {\n"
        '      toast.error("Conclua a entrega ativa antes de sair da conta.");\n'
        "      return;\n"
        "    }\n"
        "    if (availability?.is_online) {\n"
        '      const { error } = await rpc("set_courier_online", { _is_online: false });\n'
        "      if (error) {\n"
        '        toast.error(error.message || "Não foi possível ficar offline antes de sair.");\n'
        "        return;\n"
        "      }\n"
        "    }\n"
        "    await removeCourierPushRegistration();\n"
        "    await supabase.auth.signOut();\n"
        '    navigate({ to: "/login", replace: true });\n'
        "  };\n\n"
        "  const submitApplication"
    )
    s, count = pattern.subn(replacement, s, count=1)
    if count != 1:
        raise SystemExit(f"courier logout replacement count={count}")

if "const pushState = await ensureCourierPushRegistration(true);" not in s:
    toggle_start = s.find("  const toggleOnline = async () => {")
    if toggle_start < 0:
        raise SystemExit("toggleOnline not found")
    target_start = s.find("    if (target) {\n", toggle_start)
    if target_start < 0:
        raise SystemExit("target online branch not found")
    insert_at = target_start + len("    if (target) {\n")
    push_gate = (
        "      if (isNativeCourierAndroid()) {\n"
        '        setBusy("online");\n'
        "        const pushState = await ensureCourierPushRegistration(true);\n"
        '        if (pushState.status !== "registered") {\n'
        "          setBusy(null);\n"
        "          const message =\n"
        '            pushState.status === "permission-denied"\n'
        '              ? "Ative as notificações para ficar online e receber chamadas de entrega."\n'
        '              : pushState.status === "permission-required"\n'
        '                ? "Autorize as notificações para receber chamadas de entrega."\n'
        '                : pushState.status === "failed"\n'
        '                  ? `Não foi possível ativar as chamadas de entrega: ${pushState.message}`\n'
        '                  : "As chamadas nativas de entrega não estão disponíveis neste dispositivo.";\n'
        "          toast.error(message);\n"
        "          return;\n"
        "        }\n"
        "      }\n"
    )
    s = s[:insert_at] + push_gate + s[insert_at:]

route.write_text(s, encoding="utf-8")

overlay = Path("src/components/CourierOfferOverlay.tsx")
s = overlay.read_text(encoding="utf-8")
if 'window.addEventListener("apois:courier-push", refresh);' not in s:
    focus_anchor = '    window.addEventListener("focus", refresh);\n'
    cleanup_anchor = '      window.removeEventListener("focus", refresh);\n'
    if focus_anchor not in s or cleanup_anchor not in s:
        raise SystemExit("courier overlay focus anchors not found")
    s = s.replace(
        focus_anchor,
        focus_anchor + '    window.addEventListener("apois:courier-push", refresh);\n',
        1,
    )
    s = s.replace(
        cleanup_anchor,
        cleanup_anchor + '      window.removeEventListener("apois:courier-push", refresh);\n',
        1,
    )
overlay.write_text(s, encoding="utf-8")
