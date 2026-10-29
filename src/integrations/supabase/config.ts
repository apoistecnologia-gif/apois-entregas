// Public client configuration for APOIS Entregas.
// Web admin/merchant always target the official production Auth project.
// Customer/courier may explicitly override BOTH values in controlled builds;
// without an override, they use the current project rather than a retired host.
const productMode = String(import.meta.env.VITE_APOIS_PRODUCT_MODE ?? "").trim().toLowerCase();
const backoffice = productMode === "admin" || productMode === "merchant";
const canonicalUrl = "https://ptgkwyyolrdgnqketkjj.supabase.co";
const canonicalPublishableKey = "sb_publishable_DcfjTMboo1HX0O3w8Ptijg_quQbvVBY";
const optionalUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const optionalPublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();
const hasExplicitPair = Boolean(optionalUrl && optionalPublishableKey);
export const SUPABASE_URL = !backoffice && hasExplicitPair ? optionalUrl! : canonicalUrl;
export const SUPABASE_PUBLISHABLE_KEY = !backoffice && hasExplicitPair ? optionalPublishableKey! : canonicalPublishableKey;
