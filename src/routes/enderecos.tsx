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

    setIsLoading(true);
    // 1. Remove default from all other addresses of this user
    await (supabase as any)
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("user_id", user.id);

    // 2. Set this one as default
    const { error } = await (supabase as any)
      .from("customer_addresses")
      .update({ is_default: true })
      .eq("id", id);

    if (error) {
      toast.error("Erro ao definir endereço padrão");
      setIsLoading(false);
      fetchAddresses();
    } else {
      toast.success("Endereço padrão atualizado");
      // 3. Navigate back to inicio immediately
      navigate({ to: "/inicio" });
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
    <div className="flex min-h-full flex-col bg-black text-white overflow-x-hidden w-full">
      <header className="relative flex items-center justify-center px-4 py-4 sticky top-0 z-50 bg-black/85 backdrop-blur-lg">
        <button
          onClick={() => navigate({ to: "/inicio" })}
          className="absolute left-3 p-2 text-primary hover:bg-white/10 rounded-full transition-colors"
          aria-label="Voltar"
        >
          <ChevronLeft className="w-7 h-7" strokeWidth={2.5} />
        </button>
        <h1 className="text-xl font-extrabold tracking-tight">Meus Endereços</h1>
      </header>

      <main className="flex-1 px-5 pt-3 pb-28">
        <p className="text-zinc-400 text-[15px] mb-5">
          Selecione um endereço para suas entregas
        </p>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : addresses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center ring-1 ring-white/10">
              <MapPin className="w-10 h-10 text-zinc-700" />
            </div>
            <h2 className="text-lg font-bold">Nenhum endereço salvo</h2>
            <p className="text-zinc-500 text-sm px-8">
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
                  onClick={() => !addr.is_default && handleSetDefault(addr.id)}
                  className={`relative rounded-3xl border p-4 pr-12 transition-all cursor-pointer ${
                    addr.is_default
                      ? "bg-zinc-950 border-primary/70 shadow-[0_0_20px_-8px_hsl(var(--primary)/0.5)]"
                      : "bg-zinc-950 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  {/* Selection indicator */}
                  <span
                    className={`absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      addr.is_default ? "border-primary" : "border-zinc-600"
                    }`}
                  >
                    {addr.is_default && (
                      <span className="w-3 h-3 rounded-full bg-primary block" />
                    )}
                  </span>

                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-12 h-12 rounded-full bg-primary/10 ring-1 ring-primary/40 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-white text-lg leading-none">
                          {addr.label}
                        </span>
                        {addr.is_default && (
                          <span className="inline-flex items-center gap-1 bg-primary text-black text-[11px] px-2.5 py-1 rounded-full font-bold">
                            <Star className="w-3 h-3 fill-black" />
                            Padrão
                          </span>
                        )}
                      </div>
                      <p className="text-white font-semibold text-[15px] mt-2 leading-snug truncate">
                        {addr.street}, {addr.number}
                        {addr.complement && ` - ${addr.complement}`}
                      </p>
                      <p className="text-zinc-400 text-sm mt-0.5 truncate">
                        {addr.neighborhood}
                      </p>
                      <p className="text-zinc-500 text-[13px] mt-0.5 truncate">
                        {addr.city} - {addr.state}
                        {addr.zip_code ? ` • CEP ${addr.zip_code}` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-end gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate({ to: `/enderecos/editar/${addr.id}` });
                      }}
                      className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-primary px-3 py-2 rounded-xl transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      Editar
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(addr.id, addr.is_default);
                      }}
                      className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-red-500 px-3 py-2 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir
                    </button>
                    <ChevronRight className="w-5 h-5 text-primary ml-1" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8">
          <Button
            onClick={() => navigate({ to: "/enderecos/novo" })}
            className="w-full bg-primary text-black hover:bg-primary/90 font-extrabold h-14 text-lg rounded-2xl shadow-[0_8px_30px_-10px_hsl(var(--primary)/0.8)] flex items-center justify-center gap-3 cursor-pointer"
          >
            <span className="w-7 h-7 rounded-full bg-black/90 text-primary flex items-center justify-center">
              <Plus className="w-4 h-4" strokeWidth={3} />
            </span>
            Adicionar endereço
          </Button>
        </div>
      </main>

      <Outlet />
    </div>
  );
}

