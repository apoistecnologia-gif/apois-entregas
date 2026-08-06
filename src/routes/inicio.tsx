import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  MapPin, 
  Search, 
  UtensilsCrossed, 
  ShoppingBag, 
  PlusSquare, 
  Store,
  LogOut,
  ChevronRight,
  Bell
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/inicio")({
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
  component: Inicio,
  head: () => ({
    title: "Início | APOIS ENTREGA",
    meta: [
      { name: "description", content: "Bem-vindo ao APOIS ENTREGA" }
    ]
  }),
});

function Inicio() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [defaultAddress, setDefaultAddress] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Fetch profile
      const { data: profileData } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (profileData) setProfile(profileData);

      // Fetch default address
      const { data: addrData } = await supabase
        .from("customer_addresses" as any)
        .select("*")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .single();
      
      setDefaultAddress(addrData);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair da conta");
    } else {
      navigate({ to: "/login" });
    }
  };

  const categories = [
    { id: 1, name: "Restaurantes", icon: UtensilsCrossed, color: "bg-primary" },
    { id: 2, name: "Mercados", icon: ShoppingBag, color: "bg-blue-500" },
    { id: 3, name: "Farmácias", icon: PlusSquare, color: "bg-red-500" },
    { id: 4, name: "Lojas", icon: Store, color: "bg-zinc-700" },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-black text-white overflow-x-hidden max-w-[500px] mx-auto shadow-2xl border-x border-white/5">
      {/* Top Header */}
      <header className="px-6 pt-8 pb-4 sticky top-0 z-50 bg-black/80 backdrop-blur-lg">
        <div className="flex items-center justify-between mb-4">
          <button 
            onClick={() => navigate({ to: "/enderecos" })}
            className="flex items-center gap-2 flex-1 text-left group"
          >
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <div className="flex flex-col overflow-hidden">
              <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Entregar em</span>
              <div className="flex items-center gap-1 text-sm font-bold text-white">
                {defaultAddress ? (
                  <span className="truncate max-w-[180px]">
                    {defaultAddress.label}: {defaultAddress.street}, {defaultAddress.number}
                  </span>
                ) : (
                  "Informe seu endereço"
                )}
                <ChevronRight className="w-4 h-4 text-primary transition-transform group-hover:translate-x-0.5 flex-shrink-0" />
              </div>
            </div>
          </button>
          <button className="p-2 bg-zinc-900 rounded-full text-zinc-400 hover:text-white transition-colors">
            <Bell className="w-5 h-5" />
          </button>
        </div>

        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-primary transition-colors" />
          <Input 
            type="text"
            placeholder="O que você quer pedir?"
            className="bg-zinc-900 border-zinc-800 h-12 rounded-2xl pl-12 text-white placeholder:text-zinc-600 focus:ring-primary focus:border-primary transition-all"
          />
        </div>
      </header>

      <main className="flex-1 px-6 pb-24 space-y-8">
        {/* Greeting */}
        <div className="mt-4">
          <h2 className="text-xl font-bold text-white">
            {isLoading ? (
              <div className="h-6 w-48 bg-zinc-900 animate-pulse rounded-md" />
            ) : (
              `Olá, ${profile?.full_name?.split(' ')[0] || 'Bem-vindo'}!`
            )}
          </h2>
          <p className="text-zinc-500 text-sm">O que vamos comer hoje?</p>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-4 gap-3">
          {categories.map((cat) => (
            <button key={cat.id} className="flex flex-col items-center gap-2 group">
              <div className={`${cat.color} w-full aspect-square rounded-2xl flex items-center justify-center text-black transition-transform group-active:scale-95 shadow-lg`}>
                <cat.icon className="w-7 h-7" />
              </div>
              <span className="text-[11px] font-bold text-zinc-400 group-hover:text-white transition-colors">
                {cat.name}
              </span>
            </button>
          ))}
        </div>

        {/* Perto de você Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-white">Perto de você</h3>
          </div>
          
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 flex flex-col items-center text-center space-y-3">
            <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mb-2">
              <Store className="w-8 h-8 text-zinc-700" />
            </div>
            <h4 className="font-bold text-zinc-400">Tudo pronto para começar</h4>
            <p className="text-zinc-600 text-xs px-4">
              Ainda não existem estabelecimentos cadastrados nesta região. Fique de olho!
            </p>
          </div>
        </section>

        {/* Logout Option */}
        <div className="pt-8">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 text-zinc-600 hover:text-red-400 transition-colors text-sm font-medium mx-auto"
          >
            <LogOut className="w-4 h-4" />
            Sair da conta
          </button>
        </div>
      </main>
    </div>
  );
}