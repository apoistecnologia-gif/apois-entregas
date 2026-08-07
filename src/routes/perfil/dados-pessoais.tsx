import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, User, Phone, Mail, Save, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/perfil/dados-pessoais")({
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
  component: DadosPessoaisPage,
});

function DadosPessoaisPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    full_name: "",
    phone: "",
    email: "",
  });

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

          if (error) throw error;
          setProfile({
            full_name: data?.full_name || "",
            phone: data?.phone || "",
            email: user.email || "",
          });
        }
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
        toast.error("Erro ao carregar seus dados");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não encontrado");

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name,
          phone: profile.phone,
        })
        .eq("id", user.id);

      if (error) throw error;
      toast.success("Perfil atualizado com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar alterações");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-black text-white overflow-hidden relative">
      <header className="shrink-0 z-50 flex items-center justify-between p-4 bg-black/80 backdrop-blur-lg border-b border-zinc-900">
        <button onClick={() => navigate({ to: "/perfil" })} className="p-2 rounded-full bg-zinc-900 shadow-lg">
          <ArrowLeft className="w-5 h-5 text-zinc-300" />
        </button>
        <h1 className="text-xl font-bold text-primary text-center flex-1">Dados Pessoais</h1>
        <div className="w-9" /> {/* Spacer */}
      </header>

      <main className="flex-1 overflow-y-auto p-6 scrollbar-none">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-primary uppercase tracking-widest ml-1">Nome Completo</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    type="text"
                    value={profile.full_name}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-primary transition-colors"
                    placeholder="Seu nome completo"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-primary uppercase tracking-widest ml-1">Telefone</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-primary transition-colors"
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>

              <div className="space-y-2 opacity-60">
                <label className="text-xs font-bold text-primary uppercase tracking-widest ml-1">E-mail (Apenas leitura)</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    type="email"
                    value={profile.email}
                    readOnly
                    className="w-full bg-zinc-900/50 border border-zinc-800/50 rounded-2xl py-4 pl-12 pr-4 text-zinc-500 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-primary text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Salvar alterações
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
