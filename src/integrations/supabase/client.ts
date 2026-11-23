import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config";
import { getApoisProductMode } from "@/lib/product-routing";
import { markPasswordRecoveryIntent } from "@/lib/passwordRecoveryIntent";

const productMode = getApoisProductMode();

const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    // Merchant uses a dedicated auth namespace. This prevents the establishment
    // panel from restoring a legacy/default Supabase session that may belong to a
    // previous browser state and immediately bouncing /login back to /merchant.
    ...(productMode === "merchant" ? { storageKey: "apois-merchant-auth-v2" } : {}),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Capture recovery events as soon as the Auth client starts processing URL tokens.
// A short-lived navigation hint survives route changes but contains no credentials.
if (typeof window !== "undefined" && (productMode === "admin" || productMode === "merchant")) {
  client.auth.onAuthStateChange((event, session) => {
    if (event !== "PASSWORD_RECOVERY" || !session) return;
    markPasswordRecoveryIntent();
    if (window.location.pathname !== "/redefinir-senha") {
      window.location.replace("/redefinir-senha");
    }
  });
}

// The generated Database type can temporarily lag behind migrations already applied
// in production. Keep auth/functions/storage strongly typed while allowing route-level
// queries to address those runtime tables until the next generated types refresh.
type RuntimeAwareClient = Omit<typeof client, "from" | "rpc"> & {
  from: (...args: any[]) => any;
  rpc: (...args: any[]) => any;
};

const runtimeAwareClient = client as RuntimeAwareClient;
// Some courier overlays keep a local reference to `supabase.rpc`. Supabase's rpc
// method relies on the client instance as `this`, so extracting it without binding
// can throw before any HTTP request is sent and leave the UI stuck in a loading state.
runtimeAwareClient.rpc = client.rpc.bind(client) as RuntimeAwareClient["rpc"];

export const supabase = runtimeAwareClient;
