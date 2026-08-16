from pathlib import Path

# Courier: fresh installs must request notification permission, otherwise no FCM token is stored.
p = Path('src/routes/courier.tsx')
s = p.read_text(encoding='utf-8')
old = 'void installCourierPushListeners().then(() => ensureCourierPushRegistration(false));'
new = '''void installCourierPushListeners().then(async () => {
      const result = await ensureCourierPushRegistration(true);
      if (result.status === "permission-denied") {
        toast.error("Ative as notificações para receber chamadas de novas entregas.");
      } else if (result.status === "failed") {
        console.warn("courier push registration failed", result.message);
      }
    });'''
if old not in s:
    raise SystemExit('courier push registration marker not found')
p.write_text(s.replace(old, new, 1), encoding='utf-8')

# Route map: after fitting a long route, move camera back to a practical driving view near courier.
p = Path('src/components/CourierRouteMap.tsx')
s = p.read_text(encoding='utf-8')
needle = '''        const metrics: RouteMetrics = {
          distanceMeters: Math.max(0, Math.round(Number(route.distanceMeters ?? 0))),
          durationSeconds: Math.max(0, Math.round(Number(route.durationMillis ?? 0) / 1000)),
        };'''
replacement = needle + '''
        if (metrics.distanceMeters > 5000) {
          map.panTo(origin);
          map.setZoom(13);
        } else if (metrics.distanceMeters > 1800) {
          map.panTo(origin);
          map.setZoom(14);
        }'''
if needle not in s:
    raise SystemExit('courier map metrics marker not found')
s = s.replace(needle, replacement, 1)
# Give route mode more map and reduce dead chrome.
s = s.replace('h-[31rem] min-h-[64vh] max-h-[38rem]', 'h-[36rem] min-h-[70vh] max-h-[44rem]')
p.write_text(s, encoding='utf-8')
