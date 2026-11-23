// Public client configuration for APOIS Entregas.
// Producao preserva projeto canonico; preview/dev usa par explicito e isolado.
// Sem par explicito em desenvolvimento local, o sistema falha de modo fechado.
const canonicalUrl = "https://ptgkwyyolrdgnqketkjj.supabase.co";
const canonicalPublishableKey = "sb_publishable_DcfjTMboo1HX0O3w8Ptijg_quQbvVBY";
const optionalUrl = (import.meta.env['VITE_SUPABASE_URL'] as string | undefined)?.trim();
const optionalPublishableKey = (import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string | undefined)?.trim();
const hasExplicitPair = Boolean(optionalUrl && optionalPublishableKey);
// Nunca usar as credenciais canonicas quando houver par explicito de homologacao.
// A Vercel bloqueia o build Preview caso esse par aponte para producao.
if (import.meta.env.DEV && (!hasExplicitPair || [
  "ptgkwyyolrdgnqketkjj",
  "tbbzkrfupmqdywnzgnms",
].some((ref) => optionalUrl?.includes(ref)))) {
  throw new Error("APOIS Q12: desenvolvimento local precisa de banco isolado; producao bloqueada.");
}
export const SUPABASE_URL = hasExplicitPair ? optionalUrl! : canonicalUrl;
export const SUPABASE_PUBLISHABLE_KEY = hasExplicitPair ? optionalPublishableKey! : canonicalPublishableKey;
