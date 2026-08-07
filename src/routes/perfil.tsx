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
  LogOut 
} from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppBottomNav } from "@/components/AppBottomNav";
import { toast } from "sonner";

export const Route = createFileRoute("/perfil")({
  beforeLoad: async ({ location }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
    return { session };
  },
  component: PerfilPage,
});

function PerfilPage() {
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);

        if (user) {
          const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

          if (error) throw error;
          setProfile(data);
        }
      } catch (error) {
        console.error("Erro ao carregar perfil:", error);
      } finally {
        setLoading(false);
      }
    }

    getProfile();
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair da conta");
    } else {
      navigate({ to: "/login" });
    }
  };

  const menuItems = [
    { icon: User, label: "Dados pessoais", path: "#" },
    { icon: MapPin, label: "Meus endereços", path: "/enderecos" },
    { icon: CreditCard, label: "Formas de pagamento", path: "#" },
    { icon: ClipboardList, label: "Meus pedidos", path: "/pedidos" },
    { icon: Heart, label: "Favoritos", path: "/favoritos" },
    { icon: Bell, label: "Notificações", path: "#" },
    { icon: HelpCircle, label: "Ajuda e suporte", path: "#" },
    { icon: FileText, label: "Termos de Uso e Privacidade", path: "#" },
    { icon: Star, label: "APOIS+", path: "#", highlight: true },
  ];

  const handleItemClick = (item: typeof menuItems[0]) => {
    if (item.path !== "#") {
      navigate({ to: item.path as any });
    } else {
      toast.info("Em breve", {
        description: "Funcionalidade em desenvolvimento",
        duration: 2000,
      });
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-black text-white overflow-hidden relative">
      <header className="shrink-0 z-50 flex items-center justify-between p-4 bg-black/80 backdrop-blur-lg border-b border-zinc-900">
        <button onClick={() => navigate({ to: "/inicio" })} className="p-2 rounded-full bg-zinc-900 shadow-lg">
          <ArrowLeft className="w-5 h-5 text-zinc-300" />
        </button>
        <h1 className="text-xl font-bold text-primary">Conta</h1>
        <button onClick={() => navigate({ to: "/sacola" })} className="relative p-2 rounded-full bg-zinc-900 shadow-lg">
          <ShoppingBag className="w-5 h-5 text-zinc-300" />
          {totalItems > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-black text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-black">
              {totalItems}
            </span>
          )}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-20 scrollbar-none">
        {/* Profile Header */}
        <div className="flex flex-col items-center mb-8 bg-zinc-900/40 p-6 rounded-3xl border border-zinc-900/50 backdrop-blur-sm">
          <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-4 border-2 border-primary shadow-[0_0_15px_rgba(255,215,0,0.3)]">
            <User className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-1">
            {loading ? "Carregando..." : profile?.full_name || "Usuário"}
          </h2>
          <p className="text-zinc-500 text-sm mb-1">{user?.email}</p>
          {profile?.phone && (
            <p className="text-zinc-500 text-xs">{profile.phone}</p>
          )}
          <span className="mt-3 px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-[10px] uppercase font-black tracking-widest rounded-full">
            Cliente Apois
          </span>
        </div>

        {/* Menu Items */}
        <div className="space-y-2">
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={() => handleItemClick(item)}
              className={`flex w-full items-center justify-between p-4 rounded-2xl border transition-all active:scale-[0.98] ${
                item.highlight 
                  ? "bg-primary/5 border-primary/20 text-primary" 
                  : "bg-zinc-900/40 border-zinc-900/50 text-zinc-300 hover:bg-zinc-900/60"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`p-2.5 rounded-xl ${item.highlight ? "bg-primary/10" : "bg-zinc-800"}`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <span className="font-medium text-sm">{item.label}</span>
              </div>
              <ChevronRight className={`w-4 h-4 ${item.highlight ? "text-primary/50" : "text-zinc-600"}`} />
            </button>
          ))}

          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-between p-4 rounded-2xl bg-red-500/5 border border-red-500/10 text-red-400 mt-6 transition-all active:scale-[0.98] hover:bg-red-500/10"
          >
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-red-500/10">
                <LogOut className="w-5 h-5" />
              </div>
              <span className="font-medium text-sm">Sair da conta</span>
            </div>
            <ChevronRight className="w-4 h-4 opacity-30" />
          </button>
        </div>
      </main>

      <AppBottomNav activeTab="perfil" />
    </div>
  );
}