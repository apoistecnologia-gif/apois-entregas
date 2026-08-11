import { createFileRoute, redirect, useNavigate, Outlet, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronLeft,
  ChevronRight,
  Star,
  MapPin,
  Plus,
  Trash2,
  Edit2,
  Home,
  Briefcase,
  Map as MapIcon,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/enderecos")({
  ssr: false,
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
  component: EnderecosLayout,
  head: () => ({
    meta: [{ title: "Meus Endereços | APOIS ENTREGA" }],
  }),
});

type CustomerAddress = {
  id: string;
  label: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  postal_code: string;
  is_default: boolean;
};

function EnderecosLayout() {
  const navigate = useNavigate();
  const router = useRouter();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const fetchAddresses = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("customer_addresses")
      .select("id,label,street,number,complement,neighborhood,city,state,postal_code,is_default")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching addresses:", error);
      setLoadError("Não foi possível carregar seus endereços.");
      toast.error("Erro ao carregar endereços");
    } else {
      const nextAddresses = (data ?? []) as CustomerAddress[];
      setAddresses(nextAddresses);
      setSelectedAddressId((current) => {
        if (current && nextAddresses.some((address) => address.id === current)) return current;
        return nextAddresses.find((address) => address.is_default)?.id ?? nextAddresses[0]?.id ?? null;
      });
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchAddresses();

    const unsub = router.subscribe("onResolved", (state) => {
      if (state.toLocation.pathname === "/enderecos") {
        void fetchAddresses();
      }
    });

    const handleFocus = () => void fetchAddresses();
    window.addEventListener("focus", handleFocus);

    return () => {
      unsub();
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchAddresses, router]);

  const handleConfirmAddress = async () => {
    if (!selectedAddressId || isConfirming) return;
    setIsConfirming(true);

    const selectedAddress = addresses.find((address) => address.id === selectedAddressId);
    if (!selectedAddress) {
      setIsConfirming(false);
      toast.error("Selecione um endereço para continuar");
      return;
    }

    if (!selectedAddress.is_default) {
      const { error } = await (supabase.rpc as any)("set_default_customer_address", {
        _address_id: selectedAddressId,
      });

      if (error) {
        console.error("Error setting default address:", error);
        setIsConfirming(false);
        toast.error("Não foi possível confirmar este endereço");
        return;
      }
    }

    toast.success("Endereço confirmado");
    await navigate({ to: "/sacola" });
    setIsConfirming(false);
  };

  const handleDelete = async (id: string, isDefault: boolean) => {
    if (isDefault && addresses.length > 1) {
      toast.error("Defina outro endereço como padrão antes de excluir este");
      return;
    }

    if (!confirm("Tem certeza que deseja excluir este endereço?")) return;

    const { error } = await supabase.from("customer_addresses").delete().eq("id", id);

    if (error) {
      toast.error("Erro ao excluir endereço");
    } else {
      toast.success("Endereço excluído");
      await fetchAddresses();
    }
  };

  const getLabelIcon = (label: string) => {
    switch (label?.toLowerCase()) {
      case "casa":
        return Home;
      case "trabalho":
        return Briefcase;
      default:
        return MapIcon;
    }
  };

  return (
    <div className="flex min-h-full w-full flex-col overflow-x-hidden bg-black text-white">
      <header className="sticky top-0 z-50 flex items-center justify-center bg-black/85 px-4 py-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => navigate({ to: "/inicio" })}
          className="absolute left-3 rounded-full p-2 text-primary transition-colors hover:bg-white/10"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-7 w-7" strokeWidth={2.5} />
        </button>
        <h1 className="text-xl font-extrabold tracking-tight">Meus Endereços</h1>
      </header>

      <main className="flex-1 px-5 pb-28 pt-3">
        <p className="mb-5 text-[15px] text-zinc-400">Selecione um endereço para suas entregas</p>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="sr-only">Carregando endereços</span>
          </div>
        ) : loadError ? (
          <div
            className="flex flex-col items-center justify-center space-y-4 py-16 text-center"
            role="alert"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
              <MapPin className="h-10 w-10 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Não foi possível carregar</h2>
              <p className="mt-1 px-8 text-sm text-zinc-500">{loadError}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void fetchAddresses()}
              className="border-zinc-800 bg-zinc-950"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
          </div>
        ) : addresses.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-3 py-16 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-900 ring-1 ring-white/10">
              <MapPin className="h-10 w-10 text-zinc-700" />
            </div>
            <h2 className="text-lg font-bold">Nenhum endereço salvo</h2>
            <p className="px-8 text-sm text-zinc-500">
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
                  onClick={() => setSelectedAddressId(addr.id)}
                  className={`relative cursor-pointer rounded-3xl border p-4 pr-12 transition-all ${
                    selectedAddressId === addr.id
                      ? "border-primary/70 bg-zinc-950 shadow-[0_0_20px_-8px_hsl(var(--primary)/0.5)]"
                      : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                  }`}
                >
                  <span
                    className={`absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                      selectedAddressId === addr.id ? "border-primary" : "border-zinc-600"
                    }`}
                    aria-hidden="true"
                  >
                    {selectedAddressId === addr.id ? (
                      <span className="block h-3 w-3 rounded-full bg-primary" />
                    ) : null}
                  </span>

                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/40">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-extrabold leading-none text-white">
                          {addr.label}
                        </span>
                        {addr.is_default ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-black">
                            <Star className="h-3 w-3 fill-black" />
                            Padrão
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 truncate text-[15px] font-semibold leading-snug text-white">
                        {addr.street}, {addr.number}
                        {addr.complement ? ` - ${addr.complement}` : ""}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-zinc-400">{addr.neighborhood}</p>
                      <p className="mt-0.5 truncate text-[13px] text-zinc-500">
                        {addr.city} - {addr.state}
                        {addr.postal_code ? ` • CEP ${addr.postal_code}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-1 border-t border-white/5 pt-3">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate({ to: `/enderecos/editar/${addr.id}` });
                      }}
                      className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-zinc-400 transition-colors hover:text-primary"
                    >
                      <Edit2 className="h-4 w-4" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDelete(addr.id, addr.is_default);
                      }}
                      className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-zinc-400 transition-colors hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir
                    </button>
                    <ChevronRight className="ml-1 h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {addresses.length > 0 ? (
          <div className="mt-8">
            <Button
              type="button"
              disabled={!selectedAddressId || isConfirming}
              onClick={() => void handleConfirmAddress()}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-extrabold text-black shadow-[0_8px_30px_-10px_hsl(var(--primary)/0.8)] hover:bg-primary/90 disabled:opacity-50"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Confirmando...
                </>
              ) : (
                "Confirmar endereço"
              )}
            </Button>
            <p className="mt-2 text-center text-xs text-zinc-500">
              Ao confirmar, você volta para a sacola com este endereço selecionado.
            </p>
          </div>
        ) : null}

        <div className="mt-4">
          <Button
            type="button"
            onClick={() => navigate({ to: "/enderecos/novo" })}
            className="flex h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-2xl bg-primary text-lg font-extrabold text-black shadow-[0_8px_30px_-10px_hsl(var(--primary)/0.8)] hover:bg-primary/90"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/90 text-primary">
              <Plus className="h-4 w-4" strokeWidth={3} />
            </span>
            Adicionar endereço
          </Button>
        </div>
      </main>

      <Outlet />
    </div>
  );
}
