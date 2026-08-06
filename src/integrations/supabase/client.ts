import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// O projeto APOIS ENTREGA - PRODUÇÃO sbvhdgyuuperszlsllji
const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'];
const SUPABASE_PUBLISHABLE_KEY = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'];

console.log("[AUDIT] CLIENT LOADED WITH URL:", SUPABASE_URL);
console.log("[AUDIT] KEY CHECK - START:", SUPABASE_PUBLISHABLE_KEY.slice(0, 15), "END:", SUPABASE_PUBLISHABLE_KEY.slice(-6));

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    }
});
