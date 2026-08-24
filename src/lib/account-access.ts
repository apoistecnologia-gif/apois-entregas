import { supabase } from "@/integrations/supabase/client";
import { getApoisProductMode } from "@/lib/product-routing";

export type AccountAccessResult = { allowed: true } | { allowed: false; message: string };

/**
 * Re-checks account status for a session obtained outside the password login form
 * (Google OAuth web/native redirect, magic links). login.tsx already enforces this for
 * email/password sign-in; any other way of landing a session must repeat it here or a
 * blocked/deactivated account bypasses the sign-out that login.tsx guarantees.
 */
export async function verifyAccountAccessOrSignOut(): Promise<AccountAccessResult> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    await supabase.auth.signOut();
    return { allowed: false, message: "Não foi possível validar sua conta. Tente novamente." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active,blocked_reason")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { allowed: false, message: "Não foi possível validar seu perfil. Tente novamente." };
  }
  if (profile.is_active === false) {
    await supabase.auth.signOut();
    return {
      allowed: false,
      message:
        profile.blocked_reason || "Sua conta está desativada. Entre em contato com o suporte.",
    };
  }

  if (getApoisProductMode() === "admin") {
    const { data: adminRole, error: adminRoleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (adminRoleError || !adminRole) {
      await supabase.auth.signOut();
      return {
        allowed: false,
        message: "Esta conta não possui autorização para acessar o painel administrativo.",
      };
    }
  }

  return { allowed: true };
}
