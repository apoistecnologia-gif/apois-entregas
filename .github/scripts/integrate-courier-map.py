from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor missing")
    return text.replace(old, new, 1)


path = Path("src/routes/courier.tsx")
text = path.read_text(encoding="utf-8")

text = replace_once(
    text,
    'import { useCallback, useEffect, useMemo, useRef, useState } from "react";',
    'import { useCallback, useEffect, useMemo, useState } from "react";',
    "React hooks import",
)

panel_import = '''import {
  CourierBottomNav,
  CourierHistoryPanel,
  CourierProfilePanel,
} from "@/components/CourierPanels";'''
map_imports = '''import {
  CourierLocationTracker,
  type CourierPosition,
} from "@/components/CourierLocationTracker";
import { CourierRouteMap } from "@/components/CourierRouteMap";'''
if 'from "@/components/CourierLocationTracker"' not in text:
    text = replace_once(text, panel_import, panel_import + "\n" + map_imports, "CourierPanels import")

watcher_state = "  const locationWatchRef = useRef<number | null>(null);"
text = replace_once(
    text,
    watcher_state,
    "  const [currentPosition, setCurrentPosition] = useState<CourierPosition | null>(null);",
    "location watcher state",
)

send_start = text.find("  const sendLocation = useCallback((position: GeolocationPosition) => {")
logout_start = text.find("  const logout = async () => {", send_start)
if send_start == -1 or logout_start == -1:
    raise SystemExit("route-level GPS watcher block not found")
text = text[:send_start] + text[logout_start:]

old_send = "        sendLocation(position);"
position_state = '''        setCurrentPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          heading:
            position.coords.heading !== null && Number.isFinite(position.coords.heading)
              ? position.coords.heading
              : null,
          speed:
            position.coords.speed !== null && Number.isFinite(position.coords.speed)
              ? position.coords.speed
              : null,
          recordedAt: Date.now(),
        });'''
text = replace_once(text, old_send, position_state, "initial GPS fix")

offline_anchor = '''      if (error) {
        setBusy(null);
        return toast.error(error.message);
      }
    }
    setBusy(null);'''
offline_new = '''      if (error) {
        setBusy(null);
        return toast.error(error.message);
      }
      setCurrentPosition(null);
    }
    setBusy(null);'''
text = replace_once(text, offline_anchor, offline_new, "offline location reset")

status_end = '''          ) : null}
        </section>

        <div className="grid grid-cols-2 gap-3">'''
tracker_insert = '''          ) : null}
        </section>

        <CourierLocationTracker
          enabled={Boolean(availability?.is_online)}
          onPosition={setCurrentPosition}
        />

        <div className="grid grid-cols-2 gap-3">'''
text = replace_once(text, status_end, tracker_insert, "courier status section")

active_old = '''        {activeJob ? (
          <ActiveDelivery
            job={activeJob}
            busy={busy === "delivery" || busy === "support"}
            supportBusy={busy === "support"}
            pin={pin}
            setPin={setPin}
            onTransition={transitionDelivery}
            onComplete={completeDelivery}
            onReport={reportDeliveryProblem}
          />
        ) : null}'''
active_new = '''        {activeJob ? (
          <>
            <CourierRouteMap job={activeJob} currentPosition={currentPosition} />
            <ActiveDelivery
              job={activeJob}
              busy={busy === "delivery" || busy === "support"}
              supportBusy={busy === "support"}
              pin={pin}
              setPin={setPin}
              onTransition={transitionDelivery}
              onComplete={completeDelivery}
              onReport={reportDeliveryProblem}
            />
          </>
        ) : null}'''
text = replace_once(text, active_old, active_new, "active delivery render")
path.write_text(text, encoding="utf-8")

for component_path in (
    "src/components/CourierRouteMap.tsx",
    "src/components/CustomerDeliveryMap.tsx",
    "src/components/GoogleMapsAddressSelector.tsx",
):
    component = Path(component_path)
    content = component.read_text(encoding="utf-8")
    old = (
        "const browserKey = (import.meta as any).env."
        "VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;"
    )
    new = '''const browserKey =
    (import.meta as any).env.VITE_GOOGLE_MAPS_BROWSER_KEY ||
    (import.meta as any).env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;'''
    content = replace_once(content, old, new, f"Google Maps browser key in {component_path}")
    component.write_text(content, encoding="utf-8")
