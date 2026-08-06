import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  ChevronLeft, 
  MapPin, 
  Loader2,
  Save,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/enderecos/novo")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
  component: NovoEndereco,
  head: () => ({
    meta: [
      { title: "Novo Endereço | APOIS ENTREGA" }
    ]
  }),
});

function NovoEndereco() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    label: "Casa",
    postal_code: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    reference: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCEPBlur = async () => {
    const cep = formData.postal_code.replace(/\D/g, "");
    if (cep.length !== 8) return;

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          street: data.logradouro || prev.street,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
        }));
      }
    } catch (error) {
      console.error("CEP fetch error:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const required = ["postal_code", "street", "number", "neighborhood", "city", "state"];
    for (const field of required) {
      if (!formData[field as keyof typeof formData]) {
        toast.error(`O campo ${field} é obrigatório`);
        return;
      }
    }

    if (formData.state.length !== 2) {
      toast.error("O estado (UF) deve ter exatamente 2 letras");
      return;
    }

    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Check if it's the first address
      const { count } = await (supabase as any)
        .from("customer_addresses")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      const isFirst = count === 0;

      const { error } = await (supabase as any)
        .from("customer_addresses")
        .insert({
          ...formData,
          user_id: user.id,
          is_default: isFirst
        });

      if (error) throw error;

      toast.success("Endereço salvo com sucesso!");
      navigate({ to: "/enderecos" });
    } catch (error: any) {
      toast.error(`Erro ao salvar: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const labelOptions = ["Casa", "Trabalho", "Outro"];

  return (
    <div className="flex min-h-screen flex-col bg-black text-white overflow-x-hidden max-w-[500px] mx-auto shadow-2xl border-x border-white/5">
      <header className="flex items-center p-4 sticky top-0 z-50 bg-black/80 backdrop-blur-lg border-b border-white/10">
        <button 
          onClick={() => navigate({ to: "/enderecos" })}
          className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold ml-2">Novo Endereço</h1>
      </header>

      <main className="flex-1 px-6 py-6 pb-24">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Label Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-400">Apelido do endereço</label>
            <div className="flex gap-2">
              {labelOptions.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, label: opt }))}
                  className={`flex-1 py-3 rounded-2xl font-bold transition-all border ${
                    formData.label === opt 
                      ? "bg-primary text-black border-primary" 
                      : "bg-zinc-900 text-zinc-400 border-zinc-800"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* CEP and Street */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1 space-y-2">
              <label className="text-xs font-medium text-zinc-500 ml-1">CEP*</label>
              <Input 
                name="postal_code"
                placeholder="00000-000"
                value={formData.postal_code}
                onChange={handleChange}
                onBlur={handleCEPBlur}
                className="bg-zinc-900 border-zinc-800 h-12 rounded-xl focus:ring-primary"
                required
              />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-medium text-zinc-500 ml-1">Rua*</label>
              <Input 
                name="street"
                placeholder="Nome da rua"
                value={formData.street}
                onChange={handleChange}
                className="bg-zinc-900 border-zinc-800 h-12 rounded-xl focus:ring-primary"
                required
              />
            </div>
          </div>

          {/* Number and Complement */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1 space-y-2">
              <label className="text-xs font-medium text-zinc-500 ml-1">Número*</label>
              <Input 
                name="number"
                placeholder="123"
                value={formData.number}
                onChange={handleChange}
                className="bg-zinc-900 border-zinc-800 h-12 rounded-xl focus:ring-primary"
                required
              />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-medium text-zinc-500 ml-1">Complemento</label>
              <Input 
                name="complement"
                placeholder="Apto, Bloco, etc."
                value={formData.complement}
                onChange={handleChange}
                className="bg-zinc-900 border-zinc-800 h-12 rounded-xl focus:ring-primary"
              />
            </div>
          </div>

          {/* Neighborhood */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500 ml-1">Bairro*</label>
            <Input 
              name="neighborhood"
              placeholder="Nome do bairro"
              value={formData.neighborhood}
              onChange={handleChange}
              className="bg-zinc-900 border-zinc-800 h-12 rounded-xl focus:ring-primary"
              required
            />
          </div>

          {/* City and State */}
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3 space-y-2">
              <label className="text-xs font-medium text-zinc-500 ml-1">Cidade*</label>
              <Input 
                name="city"
                placeholder="Sua cidade"
                value={formData.city}
                onChange={handleChange}
                className="bg-zinc-900 border-zinc-800 h-12 rounded-xl focus:ring-primary"
                required
              />
            </div>
            <div className="col-span-1 space-y-2">
              <label className="text-xs font-medium text-zinc-500 ml-1">UF*</label>
              <Input 
                name="state"
                placeholder="SP"
                maxLength={2}
                value={formData.state}
                onChange={handleChange}
                className="bg-zinc-900 border-zinc-800 h-12 rounded-xl focus:ring-primary uppercase text-center"
                required
              />
            </div>
          </div>

          {/* Reference */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500 ml-1">Ponto de referência</label>
            <Input 
              name="reference"
              placeholder="Próximo ao..."
              value={formData.reference}
              onChange={handleChange}
              className="bg-zinc-900 border-zinc-800 h-12 rounded-xl focus:ring-primary"
            />
          </div>

          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-[500px] px-6">
            <Button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-black hover:bg-primary/90 font-bold h-14 text-lg rounded-2xl shadow-xl flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Salvar endereço
                </>
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}