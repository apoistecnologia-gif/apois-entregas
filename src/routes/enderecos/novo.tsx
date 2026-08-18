import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Briefcase, CheckCircle2, ChevronLeft, Home, Loader2, MapPin, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CustomerLocationAddressSelector } from "@/components/CustomerLocationAddressSelector";

export const Route = createFileRoute("/enderecos/novo")({
  ssr: false,
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  component: NovoEndereco,
  head: () => ({ meta: [{ title: "Novo Endereço | APOIS ENTREGA" }] }),
});

const locationFields = new Set([
  "postal_code",
  "street",
  "number",
  "neighborhood",
  "city",
  "state",
]);

function NovoEndereco() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [autoLocate, setAutoLocate] = useState(false);
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
    latitude: null as number | null,
    longitude: null as number | null,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
    if (sessionStorage.getItem("apois_auto_locate_new_address") === "1") {
      sessionStorage.removeItem("apois_auto_locate_new_address");
      setAutoLocate(true);
    }
  }, []);

  const hasPreciseLocation = formData.latitude !== null && formData.longitude !== null;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((previous) => {
      const previousValue = String(previous[name as keyof typeof previous] ?? "").trim();
      const isCompletingMissingField = locationFields.has(name) && previousValue.length === 0;
      const mustReconfirmPoint = locationFields.has(name) && !isCompletingMissingField;

      return {
        ...previous,
        [name]: value,
        ...(mustReconfirmPoint ? { latitude: null, longitude: null } : {}),
      };
    });
  };

  const handleCEPBlur = async () => {
    const cep = formData.postal_code.replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) return;
      const data = await response.json();
      if (!data.erro) {
        setFormData((previous) => ({
          ...previous,
          street: data.logradouro || previous.street,
          neighborhood: data.bairro || previous.neighborhood,
          city: data.localidade || previous.city,
          state: data.uf || previous.state,
        }));
      }
    } catch (error) {
      console.error("CEP fetch error:", error);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const required = ["postal_code", "street", "number", "neighborhood", "city", "state"];
    for (const field of required) {
      if (!formData[field as keyof typeof formData]) {
        toast.error("Preencha apenas os dados obrigatórios que a localização não conseguiu identificar.");
        return;
      }
    }
    if (formData.postal_code.replace(/\D/g, "").length !== 8) {
      toast.error("Informe um CEP válido com 8 dígitos");
      return;
    }
    if (formData.state.trim().length !== 2) {
      toast.error("O estado (UF) deve ter exatamente 2 letras");
      return;
    }
    if (!hasPreciseLocation) {
      toast.error("Use sua localização ou busque o endereço antes de salvar.");
      return;
    }

    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { count, error: countError } = await (supabase as any)
        .from("customer_addresses")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (countError) throw countError;

      const { error } = await (supabase as any).from("customer_addresses").insert({
        ...formData,
        postal_code: formData.postal_code.replace(/\D/g, ""),
        state: formData.state.toUpperCase(),
        user_id: user.id,
        is_default: count === 0,
      });
      if (error) throw error;

      sessionStorage.setItem("apois_checkout_address_changed", "1");
      toast.success("Endereço salvo com localização confirmada!");
      await navigate({ to: "/enderecos" });
    } catch (error: any) {
      toast.error(`Erro ao salvar: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const labelOptions = [
    { value: "Casa", Icon: Home },
    { value: "Trabalho", Icon: Briefcase },
    { value: "Outro", Icon: MapPin },
  ];

  return (
    <div className="absolute inset-0 z-[160] flex w-full flex-col overflow-x-hidden overflow-y-auto bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center border-b border-white/10 bg-black/90 px-4 pb-4 pt-[max(env(safe-area-inset-top),1rem)] backdrop-blur-xl">
        <button
          type="button"
          onClick={() => navigate({ to: "/enderecos" })}
          className="-ml-1 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-primary"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="ml-3 text-[17px] font-extrabold">Novo Endereço</h1>
      </header>

      <main className="flex-1 overflow-y-auto pb-36">
        <div className="border-b border-white/5 bg-gradient-to-b from-zinc-950 to-black px-5 py-5">
          <div
            className={`mb-4 flex items-start gap-3 rounded-2xl border p-4 ${hasPreciseLocation ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-200"}`}
          >
            {hasPreciseLocation ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <MapPin className="mt-0.5 h-5 w-5 shrink-0" />
            )}
            <div>
              <p className="text-sm font-black">
                {hasPreciseLocation ? "Localização encontrada" : "Preencha pelo GPS"}
              </p>
              <p className="mt-1 text-xs leading-relaxed opacity-80">
                {hasPreciseLocation
                  ? "Os dados encontrados aparecem abaixo. Complete somente o que estiver vazio."
                  : "Toque em usar minha localização para preencher automaticamente rua, bairro, cidade, UF, CEP e número quando disponível."}
              </p>
            </div>
          </div>
          <CustomerLocationAddressSelector
            autoLocate={autoLocate}
            onAddressSelected={(address) => {
              setFormData((previous) => ({
                ...previous,
                street: address.street || previous.street,
                neighborhood: address.neighborhood || previous.neighborhood,
                city: address.city || previous.city,
                state: address.state || previous.state,
                postal_code: address.postal_code || previous.postal_code,
                number: address.number || previous.number,
                latitude: address.latitude ?? previous.latitude,
                longitude: address.longitude ?? previous.longitude,
              }));
            }}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
          <div className="space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
              Tipo do endereço
            </label>
            <div className="flex gap-2">
              {labelOptions.map(({ value, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormData((previous) => ({ ...previous, label: value }))}
                  className={`flex flex-1 flex-col items-center gap-1.5 rounded-2xl border py-3 text-sm font-bold ${formData.label === value ? "border-primary bg-primary text-black" : "border-zinc-800 bg-zinc-900 text-zinc-400"}`}
                >
                  <Icon className="h-5 w-5" /> {value}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field
              label="CEP*"
              name="postal_code"
              value={formData.postal_code}
              onChange={handleChange}
              onBlur={handleCEPBlur}
              inputMode="numeric"
            />
            <div className="col-span-2">
              <Field label="Rua*" name="street" value={formData.street} onChange={handleChange} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Número*" name="number" value={formData.number} onChange={handleChange} />
            <div className="col-span-2">
              <Field label="Complemento" name="complement" value={formData.complement} onChange={handleChange} />
            </div>
          </div>
          <Field label="Bairro*" name="neighborhood" value={formData.neighborhood} onChange={handleChange} />
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-3">
              <Field label="Cidade*" name="city" value={formData.city} onChange={handleChange} />
            </div>
            <Field label="UF*" name="state" value={formData.state} onChange={handleChange} maxLength={2} />
          </div>
          <Field label="Ponto de referência" name="reference" value={formData.reference} onChange={handleChange} />
        </form>
      </main>

      <div className="sticky bottom-0 z-50 bg-gradient-to-t from-black via-black to-transparent px-5 pt-8 pb-[max(env(safe-area-inset-bottom),2.75rem)]">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || !hasPreciseLocation}
          className="h-14 w-full rounded-2xl bg-primary text-[17px] font-extrabold text-black disabled:opacity-40"
        >
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <Save className="mr-2 h-5 w-5" />
              {hasPreciseLocation ? "Salvar endereço" : "Use sua localização primeiro"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className="space-y-2">
      <label className="ml-1 text-xs font-medium text-zinc-500">{label}</label>
      <Input {...props} className="h-12 rounded-xl border-zinc-800 bg-zinc-900 text-white" />
    </div>
  );
}
