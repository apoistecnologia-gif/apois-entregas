import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
function guard(ok, title) {
  if (!ok) throw Error("[FAIL] APOIS portals brand: " + title);
  console.log("[OK] " + title);
}
const root = read("src/routes/__root.tsx");
const css = read("src/apois-backoffice-2026.css");
const official = read("src/assets/apoisOfficial2026.ts");
const workspace = read("src/components/WorkspaceShell.tsx");
const login = read("src/routes/login.tsx");
const routing = read("src/lib/product-routing.ts");
guard(root.includes('product === "admin" || product === "merchant"'), "Web branding remains scoped to admin/merchant only");
guard(root.includes('"apois-system-theme apois-portal-v2026"'), "Backoffice web roots opt into brand scope");
guard(root.includes('"dark apois-system-theme"'), "Customer and courier keep their existing runtime themes");
guard(root.includes('href: apoisBackofficeCss'), "Official CSS is loaded after legacy system stylesheet");
guard(css.includes("APOIS_BACKOFFICE_RED_2026") && css.includes("#E51B23") && css.includes("#C9141B"), "Canonical red / white palette present");
guard(css.includes('content: normal !important'), "Legacy gold CSS image substitution is disabled");
guard(official.includes('data:image/png;base64,iVBORw0KGgo'), "Official APOIS mark reused from Corridas");
guard((workspace.match(/src=\{APOIS_OFFICIAL_RED_LOGO_URL\}/g) ?? []).length === 2, "Admin/Merchant navigation uses the supplied circular icon");
guard(login.includes('data-apois-backoffice-desktop-login={productMode}') && login.includes("src={APOIS_OFFICIAL_RED_LOGO_URL}"), "Web Admin and Merchant logins use desktop layout and official logo");
guard(workspace.includes("merchant_new_order_alert_") && workspace.includes("playMerchantOrderAlert()"), "Merchant realtime sound notifications preserved");
guard(workspace.includes("onTabChange(tab)") && workspace.includes("onClick={onLogout}"), "Workspace navigation and logout callbacks preserved");
guard(login.includes("signInWithPassword") && login.includes("hasAdminRole"), "Existing authentication / admin authorization preserved");
guard(routing.includes("merchant") && routing.includes("admin"), "Product isolation remains configured");
guard(login.includes('if (productMode === "courier")') && login.includes('src={APOIS_LOGO_DATA_URL}'), "Customer/courier mobile visual paths are not redesigned");
