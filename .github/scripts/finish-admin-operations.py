from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor missing")
    return text.replace(old, new, 1)


realtime_path = Path("src/components/AdminRealtimeOperationsPanel.tsx")
realtime = realtime_path.read_text(encoding="utf-8")
realtime = replace_once(
    realtime,
    'import { APIProvider, AdvancedMarker, Map } from "@vis.gl/react-google-maps";',
    'import { APIProvider, AdvancedMarker, Map as GoogleMap } from "@vis.gl/react-google-maps";',
    "Google Maps import",
)
realtime = replace_once(
    realtime,
    '''    const channels = [
      ["admin_realtime_jobs", "delivery_jobs"],
      ["admin_realtime_availability", "courier_availability"],
      ["admin_realtime_locations", "courier_locations"],
      ["admin_realtime_orders", "orders"],
    ].map(([name, table]) =>
      supabase
        .channel(name)
        .on("postgres_changes", { event: "*", schema: "public", table }, refresh)
        .subscribe(),
    );''',
    '''    const subscriptions = [
      { name: "admin_realtime_jobs", table: "delivery_jobs" },
      { name: "admin_realtime_availability", table: "courier_availability" },
      { name: "admin_realtime_locations", table: "courier_locations" },
      { name: "admin_realtime_orders", table: "orders" },
    ];
    const channels = subscriptions.map(({ name, table }) =>
      supabase
        .channel(name)
        .on("postgres_changes", { event: "*", schema: "public", table }, refresh)
        .subscribe(),
    );''',
    "Realtime subscription array",
)
realtime = realtime.replace("<Map ", "<GoogleMap ", 1).replace("</Map>", "</GoogleMap>", 1)
realtime_path.write_text(realtime, encoding="utf-8")

admin_path = Path("src/routes/admin.tsx")
admin = admin_path.read_text(encoding="utf-8")
if "Activity," not in admin:
    admin = replace_once(admin, "import {\n  Bike,", "import {\n  Activity,\n  Bike,", "lucide imports")
if "  Star," not in admin:
    admin = replace_once(admin, "  ShoppingBag,\n", "  ShoppingBag,\n  Star,\n", "Star icon import")
if 'AdminRealtimeOperationsPanel' not in admin:
    admin = replace_once(
        admin,
        'import { AdminSupportPanel } from "@/components/AdminSupportPanel";\n',
        'import { AdminSupportPanel } from "@/components/AdminSupportPanel";\nimport { AdminRealtimeOperationsPanel } from "@/components/AdminRealtimeOperationsPanel";\nimport { AdminReviewsPanel } from "@/components/AdminReviewsPanel";\n',
        "admin component imports",
    )
if 'id: "realtime"' not in admin:
    admin = replace_once(
        admin,
        '    { id: "orders", label: "Pedidos", icon: ShoppingBag, badge: activeOrders.length },\n',
        '    { id: "orders", label: "Pedidos", icon: ShoppingBag, badge: activeOrders.length },\n    { id: "realtime", label: "Tempo real", icon: Activity, badge: activeOrders.length },\n',
        "realtime tab",
    )
if 'id: "reviews"' not in admin:
    admin = replace_once(
        admin,
        '    { id: "users", label: "Usuários", icon: Users },\n',
        '    { id: "users", label: "Usuários", icon: Users },\n    { id: "reviews", label: "Avaliações", icon: Star },\n',
        "reviews tab",
    )
if 'activeTab === "realtime"' not in admin:
    admin = replace_once(
        admin,
        '      {activeTab === "users" && (\n',
        '      {activeTab === "realtime" && <AdminRealtimeOperationsPanel />}\n\n      {activeTab === "users" && (\n',
        "realtime render",
    )
if 'activeTab === "reviews"' not in admin:
    admin = replace_once(
        admin,
        '      {activeTab === "coverage" && (\n',
        '      {activeTab === "reviews" && <AdminReviewsPanel />}\n\n      {activeTab === "coverage" && (\n',
        "reviews render",
    )
admin_path.write_text(admin, encoding="utf-8")

env_path = Path(".env.example")
env = env_path.read_text(encoding="utf-8")
if "VITE_GOOGLE_MAPS_MAP_ID=" not in env:
    anchor = "VITE_GOOGLE_MAPS_BROWSER_KEY=YOUR_BROWSER_RESTRICTED_GOOGLE_MAPS_KEY\n"
    if anchor not in env:
        raise SystemExit("Google Maps browser key env anchor missing")
    env = env.replace(anchor, anchor + "VITE_GOOGLE_MAPS_MAP_ID=YOUR_GOOGLE_MAPS_MAP_ID\n", 1)
env_path.write_text(env, encoding="utf-8")
