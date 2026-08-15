import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config";
import { getApoisProductMode } from "@/lib/product-routing";

const productMode = getApoisProductMode();

const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    // Merchant uses a dedicated auth namespace. This prevents the establishment
    // panel from restoring a legacy/default Supabase session that may belong to a
    // previous browser state and immediately bouncing /login back to /merchant.
    storageKey: productMode === "merchant" ? "apois-merchant-auth-v2" : undefined,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// The generated Database type can temporarily lag behind migrations already applied
// in production. Keep auth/functions/storage strongly typed while allowing route-level
// queries to address those runtime tables until the next generated types refresh.
type RuntimeAwareClient = Omit<typeof client, "from" | "rpc"> & {
  from: (...args: any[]) => any;
  rpc: (...args: any[]) => any;
};

export const supabase = client as RuntimeAwareClient;
