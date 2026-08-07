import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config';

console.log("[AUDIT] CLIENT LOADED WITH URL:", SUPABASE_URL);
console.log("[AUDIT] KEY CHECK - START:", SUPABASE_PUBLISHABLE_KEY.slice(0, 15), "END:", SUPABASE_PUBLISHABLE_KEY.slice(-6));

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    }
});
