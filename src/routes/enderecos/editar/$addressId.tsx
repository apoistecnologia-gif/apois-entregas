import { createFileRoute, redirect, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { GoogleMapsAddressSelector } from "@/components/GoogleMapsAddressSelector";

export const Route = createFileRoute("/enderecos/editar/$addressId")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
  component: EditarEndereco,
  head: () => ({
    meta: [{ title: "Editar Endereço | APOIS ENTREGA" }],
  }),
});

const locationFields = new Set([
  "postal_code",
  "street",
  "number",
  "neighborhood",
  "city",
  "state",
]);

function EditarEndereco() {
  const { addressId } = useParams({ from: "/enderecos/editar/$addressId" });
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    label: "",
    postal_code: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    reference: "",
    latitude: null as number | null,
    longitude: null as number | null,
  });

  useEffect(() => {
    const fetchAddress = async () => {
      const { data, error } = await (supabase as any)
        .from("customer_addresses")
        .select("*")
        .eq("id", addressId)
        .single();

      if (error) {
        toast.error("Endereço não encontrado ou sem permissão de acesso");
        await navigate({ to: "/enderecos" });
      } else {
        setFormData({
          label: data.label,
          postal_code: data.postal_code,
          street: data.street,
          number: data.number,
          complement: data.complement || "",
          neighborhood: data.neighborhood,
          city: data.city,
          state: data.state,
          reference: data.reference || "",
          latitude: data.latitude === null ? null : Number(data.latitude),
          longitude: data.longitude === null ? null : Number(data.longitude),
        });
      }
      setIsLoading(false);
    };

    void fetchAddress();
  }, [addressId, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(locationFields.has(name) ? { latitude: null, longitude: null } : {}),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.postal_code.replace(/\D/g, "").length !== 8) {
      toast.error("Informe um CEP válido com 8 dígitos");
      return;
    }
    if (formData.state.trim().length !== 2) {
      toast.error("O estado (UF) deve ter exatamente 2 letras");
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await (supabase as any)
        .from("customer_addresses")
        .update({
          ...formData,
          postal_code: formData.postal_code.replace(/\D/g, ""),
          state: formData.state.toUpperCase(),
        })
        .eq("id", addressId);

      if (error) throw error;

      toast.success("Endereço atualizado!");
      await navigate({ to: "/enderecos" });
    } catch (error: any) {
      toast.error(`Erro ao salvar: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-black" role="status">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="sr-only">Carregando endereço</span>
      </div>
    );
  }

  const labelOptions = ["Casa", "Trabalho", "Outro"];

  return (
    <div className="absolute inset-0 z-[160] bg-black overflow-y-auto overflow-x-hidden flex flex-col w-full shadow-2xl">
      <header className="flex items-center p-4 sticky top-0 z-50 bg-black/80 backdrop-blur-lg border-b border-white/10">
        <button
          type="button"
          onClick={() => navigate({ to: "/enderecos" })}
          className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          aria-label="Voltar"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold ml-2">Editar Endereço</h1>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 border-b border-white/5 bg-zinc-950/50">
          <GoogleMapsAddressSelector
            initialCenter={
              formData.latitude !== null && formData.longitude !== null
                ? { lat: formData.latitude, lng: formData.longitude }
                : undefined
            }
            onAddressSelected={(addr) => {
              setFormData((prev) => ({
                ...prev,
                street: addr.street || prev.street,
                neighborhood: addr.neighborhood || prev.neighborhood,
                city: addr.city || prev.city,
                state: addr.state || prev.state,
                postal_code: addr.postal_code || prev.postal_code,
                number: addr.number || prev.number,
                latitude: addr.latitude ?? prev.latitude,
                longitude: addr.longitude ?? prev.longitude,
              }));
            }}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6 pb-24">
          <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-400">Apelido do endereço</label>
            <div className="flex gap-2">
              {labelOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, label: opt }))}
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

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1 space-y-2">
              <label className="text-xs font-medium text-zinc-500 ml-1">CEP*</label>
              <Input
                name="postal_code"
                value={formData.postal_code}
                onChange={handleChange}
                inputMode="numeric"
                className="bg-zinc-900 border-zinc-800 h-12 rounded-xl"
                required
              />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-medium text-zinc-500 ml-1">Rua*</label>
              <Input
                name="street"
                value={formData.street}
                onChange={handleChange}
                className="bg-zinc-900 border-zinc-800 h-12 rounded-xl"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1 space-y-2">
              <label className="text-xs font-medium text-zinc-500 ml-1">Número*</label>
              <Input
                name="number"
                value={formData.number}
                onChange={handleChange}
                className="bg-zinc-900 border-zinc-800 h-12 rounded-xl"
                required
              />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-medium text-zinc-500 ml-1">Complemento</label>
              <Input
                name="complement"
                value={formData.complement}
                onChange={handleChange}
                className="bg-zinc-900 border-zinc-800 h-12 rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500 ml-1">Bairro*</label>
            <Input
              name="neighborhood"
              value={formData.neighborhood}
              onChange={handleChange}
              className="bg-zinc-900 border-zinc-800 h-12 rounded-xl"
              required
            />
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3 space-y-2">
              <label className="text-xs font-medium text-zinc-500 ml-1">Cidade*</label>
              <Input
                name="city"
                value={formData.city}
                onChange={handleChange}
                className="bg-zinc-900 border-zinc-800 h-12 rounded-xl"
                required
              />
            </div>
            <div className="col-span-1 space-y-2">
              <label className="text-xs font-medium text-zinc-500 ml-1">UF*</label>
              <Input
                name="state"
                maxLength={2}
                value={formData.state}
                onChange={handleChange}
                className="bg-zinc-900 border-zinc-800 h-12 rounded-xl uppercase text-center"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500 ml-1">Ponto de referência</label>
            <Input
              name="reference"
              value={formData.reference}
              onChange={handleChange}
              className="bg-zinc-900 border-zinc-800 h-12 rounded-xl"
            />
          </div>

          <div className="sticky bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black to-transparent pt-10">
            <Button
              type="submit"
              disabled={isSaving}
              className="w-full bg-primary text-black hover:bg-primary/90 font-bold h-14 text-lg rounded-2xl shadow-xl flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Atualizar endereço
                </>
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
