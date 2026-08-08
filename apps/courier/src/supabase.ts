import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url=import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const supabaseConfigured=Boolean(url&&anonKey);
export const supabase:SupabaseClient|null=supabaseConfigured?createClient(url!,anonKey!,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
export function requireSupabase():SupabaseClient{if(!supabase)throw new Error("SUPABASE_NOT_CONFIGURED");return supabase;}
