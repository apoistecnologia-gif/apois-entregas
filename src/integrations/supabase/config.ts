// Product-scoped public Supabase configuration. The administrative web products
// use the current APOIS Entregas project; customer/courier preserve their legacy
// project until their separate production migration is explicitly authorized.
const productMode = String(import.meta.env.VITE_APOIS_PRODUCT_MODE ?? "").trim().toLowerCase();
const backoffice = productMode === "admin" || productMode === "merchant";
export const SUPABASE_URL = backoffice
  ? "https://ptgkwyyolrdgnqketkjj.supabase.co"
  : ((import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || "https://sbvhdgyuuperszlsllji.supabase.co");
export const SUPABASE_PUBLISHABLE_KEY = backoffice
  ? "sb_publishable_DcfjTMboo1HX0O3w8Ptijg_quQbvVBY"
  : ((import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() || "sb_publishable_tmNxPNALqBcWiEdD7_eWOw_mk0qRkJa");
