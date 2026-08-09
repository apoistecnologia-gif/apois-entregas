import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ShoppingBag,
  User,
  ChevronRight,
  MapPin,
  CreditCard,
  ClipboardList,
  Heart,
  Bell,
  HelpCircle,
  FileText,
  Star,
  LogOut,
  Store,
  Bike,
  ShieldCheck,
} from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppBottomNav } from "@/components/AppBottomNav";
import { toast } from "sonner";

export const Route = createFileRoute("/perfil/")({
  component: PerfilIndexPage,
});

function PerfilIndexPage() {
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const getProfile = useCallback(async () => {
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      setUser(authUser);

      if (authUser) {
        const [profileResult, rolesResult] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", authUser.id).single(),
          supabase.from("user_roles").select("role").eq("user_id", authUser.id),
        ]);
        if (profileResult.error) throw profileResult.error;
        setProfile(profileResult.data);
        setRoles((rolesResult.data ?? []).map((row: any) => String(row.role)));
      }
    } catch {
      toast.error("Não foi possível atualizar os dados da sua conta.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void getProfile();
    window.addEventListener("focus", getProfile);
    return () => window.removeEventListener("focus", getProfile);
  }, [getProfile]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error("Erro ao sair da conta");
    else navigate({ to: "/login" });
  };

  const menuItems = useMemo(() => {
    const base = [
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

    const work = [
      { icon: Store, label: roles.includes("merchant") ? "Painel do estabelecimento" : "Quero vender na APOIS", path: "/merchant", work: true },
      { icon: Bike, label: roles.includes("courier") ? "App do entregador" : "Quero fazer entregas", path: "/courier", work: true },
    ];
    if (roles.includes("admin")) work.push({ icon: ShieldCheck, label: "Administração APOIS", path: "/admin", work: true });
    return [...work, ...base];
  }, [roles]);

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="z-50 flex shrink-0 items-center justify-between border-b border-zinc-900 bg-black/80 p-4 backdrop-blur-lg">
        <button type="button" onClick={() => navigate({ to: "/inicio" })} className="rounded-full bg-zinc-900 p-2 shadow-lg"><ArrowLeft className="h-5 w-5 text-zinc-300" /></button>
        <h1 className="text-xl font-bold text-primary">Conta</h1>
        <button type="button" onClick={() => navigate({ to: "/sacola" })} className="relative rounded-full bg-zinc-900 p-2 shadow-lg">
          <ShoppingBag className="h-5 w-5 text-zinc-300" />
          {totalItems > 0 ? <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-black bg-primary text-[10px] font-bold text-black">{totalItems}</span> : null}
        </button>
      </header>

      <main className="scrollbar-none flex-1 overflow-y-auto p-4 pb-20">
        <div className="mb-8 flex flex-col items-center rounded-3xl border border-zinc-900/50 bg-zinc-900/40 p-6 backdrop-blur-sm">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary bg-zinc-900 shadow-[0_0_15px_rgba(255,215,0,0.3)]"><User className="h-10 w-10 text-primary" /></div>
          <h2 className="mb-1 text-xl font-bold">{loading ? "Carregando..." : profile?.full_name || "Usuário"}</h2>
          <p className="mb-1 text-sm text-zinc-500">{user?.email}</p>
          {profile?.phone ? <p className="text-xs text-zinc-500">{profile.phone}</p> : null}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">Cliente Apois</span>
            {roles.filter((role) => role !== "customer").map((role) => <span key={role} className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">{role}</span>)}
          </div>
        </div>

        <div className="space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate({ to: item.path as any })}
              className={`flex w-full items-center justify-between rounded-2xl border p-4 transition-all active:scale-[0.98] ${item.highlight ? "border-primary/20 bg-primary/5 text-primary" : item.work ? "border-primary/10 bg-zinc-950 text-white hover:border-primary/30" : "border-zinc-900/50 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-900/60"}`}
            >
              <div className="flex items-center gap-4"><div className={`rounded-xl p-2.5 ${item.highlight || item.work ? "bg-primary/10 text-primary" : "bg-zinc-800"}`}><item.icon className="h-5 w-5" /></div><span className="text-sm font-medium">{item.label}</span></div>
              <ChevronRight className={`h-4 w-4 ${item.highlight || item.work ? "text-primary/50" : "text-zinc-600"}`} />
            </button>
          ))}

          <button type="button" onClick={handleLogout} className="mt-6 flex w-full items-center justify-between rounded-2xl border border-red-500/10 bg-red-500/5 p-4 text-red-400 transition-all active:scale-[0.98] hover:bg-red-500/10">
            <div className="flex items-center gap-4"><div className="rounded-xl bg-red-500/10 p-2.5"><LogOut className="h-5 w-5" /></div><span className="text-sm font-medium">Sair da conta</span></div><ChevronRight className="h-4 w-4 opacity-30" />
          </button>
        </div>
      </main>
      <AppBottomNav activeTab="perfil" />
    </div>
  );
}
