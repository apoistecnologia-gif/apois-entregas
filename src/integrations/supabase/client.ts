import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// O projeto APOIS ENTREGA - PRODUÇÃO sbvhdgyuuperszlsllji
const SUPABASE_URL = "https://sbvhdgyuuperszlsllji.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-fhQ-KcM0lLrx7_QIG6jjA_6kjlVPSR";

console.log("[AUDIT] CLIENT LOADED WITH URL:", SUPABASE_URL);

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    }
});
