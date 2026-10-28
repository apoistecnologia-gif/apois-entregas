// Web backoffice previews can target the isolated APOIS Entregas Supabase project.
// Preserve the existing mobile/legacy default unless an environment explicitly opts in.
export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  "https://sbvhdgyuuperszlsllji.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
  "sb_publishable_tmNxPNALqBcWiEdD7_eWOw_mk0qRkJa";
