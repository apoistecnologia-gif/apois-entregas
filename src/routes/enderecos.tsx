import { createFileRoute, redirect, useNavigate, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  ChevronLeft, 
  MapPin, 
  Plus, 
  Trash2, 
  Edit2, 
  Home, 
  Briefcase, 
  Map as MapIcon,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/enderecos")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
  component: EnderecosLayout,
  head: () => ({
    meta: [
      { title: "Meus Endereços | APOIS ENTREGA" }
    ]
  }),
});

function EnderecosLayout() {
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAddresses = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("customer_addresses" as any)
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching addresses:", error);
      toast.error("Erro ao carregar endereços");
    } else {
      setAddresses(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAddresses();
  }, []);

  const handleSetDefault = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await (supabase as any)
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("user_id", user.id);

    const { error } = await (supabase as any)
      .from("customer_addresses")
      .update({ is_default: true })
      .eq("id", id);

    if (error) {
      toast.error("Erro ao definir endereço padrão");
    } else {
      toast.success("Endereço padrão atualizado");
      fetchAddresses();
    }
  };

  const handleDelete = async (id: string, isDefault: boolean) => {
    if (isDefault && addresses.length > 1) {
      toast.error("Defina outro endereço como padrão antes de excluir este");
      return;
    }

    if (!confirm("Tem certeza que deseja excluir este endereço?")) return;

    const { error } = await (supabase as any)
      .from("customer_addresses")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao excluir endereço");
    } else {
      toast.success("Endereço excluído");
      fetchAddresses();
    }
  };

  const getLabelIcon = (label: string) => {
    switch (label?.toLowerCase()) {
      case "casa": return Home;
      case "trabalho": return Briefcase;
      default: return MapIcon;
    }
  };

  return (
    <>
      <div className="flex min-h-screen flex-col bg-black text-white overflow-x-hidden max-w-[500px] mx-auto shadow-2xl border-x border-white/5">
        <header className="flex items-center p-4 sticky top-0 z-50 bg-black/80 backdrop-blur-lg border-b border-white/10">
          <button 
            onClick={() => navigate({ to: "/inicio" })}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold ml-2">Meus Endereços</h1>
        </header>

        <main className="flex-1 px-6 py-6 pb-24">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : addresses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-2">
                <MapPin className="w-10 h-10 text-zinc-700" />
              </div>
              <h2 className="text-xl font-bold">Nenhum endereço salvo</h2>
              <p className="text-zinc-500 text-sm px-10">
                Adicione um endereço para ver as opções de entrega na sua região.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {addresses.map((addr) => {
                const Icon = getLabelIcon(addr.label);
                return (
                  <div 
                    key={addr.id}
                    className={`p-4 rounded-3xl border transition-all ${
                      addr.is_default 
                        ? "bg-primary/5 border-primary/30" 
                        : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`p-3 rounded-2xl ${addr.is_default ? "bg-primary text-black" : "bg-zinc-800 text-zinc-400"}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{addr.label}</span>
                            {addr.is_default && (
                              <span className="bg-primary/20 text-primary text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                Padrão
                              </span>
                            )}
                          </div>
                          <p className="text-zinc-400 text-sm mt-1 leading-snug">
                            {addr.street}, {addr.number}
                            {addr.complement && ` - ${addr.complement}`}
                          </p>
                          <p className="text-zinc-500 text-xs mt-0.5">
                            {addr.neighborhood}, {addr.city} - {addr.state}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-white/5">
                      {!addr.is_default && (
                        <button 
                          onClick={() => handleSetDefault(addr.id)}
                          className="text-xs font-bold text-primary px-3 py-2 hover:bg-primary/10 rounded-xl transition-colors"
                        >
                          Tornar padrão
                        </button>
                      )}
                      <button 
                        onClick={() => navigate({ to: `/enderecos/editar/${addr.id}` })}
                        className="p-2 text-zinc-500 hover:text-white transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(addr.id, addr.is_default)}
                        className="p-2 text-zinc-500 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-8">
            <Button 
              onClick={() => navigate({ to: "/enderecos/novo" })}
              className="w-full bg-primary text-black hover:bg-primary/90 font-bold h-14 text-lg rounded-2xl shadow-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              Adicionar endereço
            </Button>
          </div>
        </main>
      </div>
      <Outlet />
    </>
  );
}
