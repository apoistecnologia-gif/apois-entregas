import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  Heart,
  HelpCircle,
  LogOut,
  MapPin,
  ShoppingBag,
  Star,
  User,
} from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { AppBottomNav } from "@/components/AppBottomNav";

export const Route = createFileRoute("/perfil/")({
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { session };
  },
  component: PerfilIndexPage,
});

type ProfileRow = {
  full_name: string | null;
  phone: string | null;
};

type ProfileRoute =
  | "/perfil/dados-pessoais"
  | "/enderecos"
  | "/perfil/pagamentos"
  | "/pedidos"
  | "/favoritos"
  | "/perfil/notificacoes"
  | "/perfil/ajuda"
  | "/perfil/legal"
  | "/apois-plus";

type MenuItem = {
  icon: typeof User;
  label: string;
  path: ProfileRoute;
  highlight?: boolean;
};

function PerfilIndexPage() {
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const getProfile = useCallback(async () => {
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);

      if (!currentUser) {
        setProfile(null);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name,phone")
        .eq("id", currentUser.id)
        .single();

      if (error) throw error;
      setProfile(data as ProfileRow);
    } catch (profileError) {
      console.error(
        "Erro ao carregar perfil:",
        profileError instanceof Error ? profileError.message : "unknown",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void getProfile();
    const refresh = () => void getProfile();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [getProfile]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair da conta");
      return;
    }
    void navigate({ to: "/login" });
  };

  const menuItems: MenuItem[] = [
    { icon: User, label: "Dados pessoais", path: "/perfil/dados-pessoais" },
    { icon: MapPin, label: "Meus endereços", path: "/enderecos" },
    { icon: CreditCard, label: "Formas de pagamento", path: "/perfil/pagamentos" },
    { icon: ClipboardList, label: "Meus pedidos", path: "/pedidos" },
    { icon: Heart, label: "Favoritos", path: "/favoritos" },
    { icon: Bell, label: "Notificações", path: "/perfil/notificacoes" },
    { icon: HelpCircle, label: "Ajuda e suporte", path: "/perfil/ajuda" },
    { icon: FileText, label: "Termos de Uso e Privacidade", path: "/perfil/legal" },
    { icon: Star, label: "APOIS+", path: "/apois-plus", highlight: true },
  ];

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="z-50 flex shrink-0 items-center justify-between border-b border-zinc-900 bg-black/80 p-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => void navigate({ to: "/inicio" })}
          className="rounded-full bg-zinc-900 p-2 shadow-lg"
          aria-label="Voltar ao início"
        >
          <ArrowLeft className="h-5 w-5 text-zinc-300" />
        </button>
        <h1 className="text-xl font-bold text-primary">Conta</h1>
        <button
          type="button"
          onClick={() => void navigate({ to: "/sacola" })}
          className="relative rounded-full bg-zinc-900 p-2 shadow-lg"
          aria-label="Abrir sacola"
        >
          <ShoppingBag className="h-5 w-5 text-zinc-300" />
          {totalItems > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-black bg-primary text-[10px] font-bold text-black">
              {totalItems}
            </span>
          )}
        </button>
      </header>

      <main className="scrollbar-none flex-1 overflow-y-auto p-4 pb-20">
        <div className="mb-8 flex flex-col items-center rounded-3xl border border-zinc-900/50 bg-zinc-900/40 p-6 backdrop-blur-sm">
          <div className="mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-primary bg-zinc-900 shadow-[0_0_15px_rgba(255,215,0,0.3)]">
            <User className="h-10 w-10 text-primary" />
          </div>
          <h2 className="mb-1 text-xl font-bold">
            {loading ? "Carregando..." : profile?.full_name || "Usuário"}
          </h2>
          <p className="mb-1 text-sm text-zinc-500">{user?.email ?? ""}</p>
          {profile?.phone && <p className="text-xs text-zinc-500">{profile.phone}</p>}
          <span className="mt-3 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
            Cliente APOIS
          </span>
        </div>

        <div className="space-y-2">
          {menuItems.map((item) => (
            <button
              type="button"
              key={item.path}
              onClick={() => void navigate({ to: item.path })}
              className={`flex w-full items-center justify-between rounded-2xl border p-4 transition-all active:scale-[0.98] ${
                item.highlight
                  ? "border-primary/20 bg-primary/5 text-primary"
                  : "border-zinc-900/50 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-900/60"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`rounded-xl p-2.5 ${item.highlight ? "bg-primary/10" : "bg-zinc-800"}`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium">{item.label}</span>
              </div>
              <ChevronRight className={`h-4 w-4 ${item.highlight ? "text-primary/50" : "text-zinc-600"}`} />
            </button>
          ))}

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-6 flex w-full items-center justify-between rounded-2xl border border-red-500/10 bg-red-500/5 p-4 text-red-400 transition-all active:scale-[0.98] hover:bg-red-500/10"
          >
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-red-500/10 p-2.5">
                <LogOut className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">Sair da conta</span>
            </div>
            <ChevronRight className="h-4 w-4 opacity-30" />
          </button>
        </div>
      </main>

      <AppBottomNav activeTab="perfil" />
    </div>
  );
}
