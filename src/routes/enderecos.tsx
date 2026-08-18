import { createFileRoute, redirect, useNavigate, Outlet, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  Briefcase,
  ChevronLeft,
  Edit2,
  Home,
  Loader2,
  Map as MapIcon,
  MapPin,
  Navigation,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/enderecos")({
  ssr: false,
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  component: EnderecosLayout,
  head: () => ({ meta: [{ title: "Meus Endereços | APOIS ENTREGA" }] }),
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
  latitude: number | string | null;
  longitude: number | string | null;
  is_default: boolean;
};

const hasCoordinates = (address: CustomerAddress) => {
  const lat = Number(address.latitude);
  const lng = Number(address.longitude);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
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
      .select(
        "id,label,street,number,complement,neighborhood,city,state,postal_code,latitude,longitude,is_default",
      )
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching addresses:", error);
      setLoadError("Não foi possível carregar seus endereços.");
    } else {
      const next = (data ?? []) as CustomerAddress[];
      setAddresses(next);
      setSelectedAddressId((current) => {
        if (current && next.some((address) => address.id === current)) return current;
        return next.find((address) => address.is_default)?.id ?? next[0]?.id ?? null;
      });
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchAddresses();
    const unsub = router.subscribe("onResolved", (state) => {
      if (state.toLocation.pathname === "/enderecos") void fetchAddresses();
    });
    const handleFocus = () => void fetchAddresses();
    window.addEventListener("focus", handleFocus);
    return () => {
      unsub();
      window.removeEventListener("focus", handleFocus);
    };
  }, [fetchAddresses, router]);

  const selectedAddress = addresses.find((address) => address.id === selectedAddressId) ?? null;
  const selectedLocated = selectedAddress ? hasCoordinates(selectedAddress) : false;

  const setDefaultWithFallback = async (addressId: string) => {
    const rpcResult = await (supabase.rpc as any)("set_default_customer_address", {
      _address_id: addressId,
    });
    if (!rpcResult.error) return;

    console.warn("RPC set_default_customer_address failed, using RLS fallback:", rpcResult.error);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw userError ?? new Error("Sessão não encontrada");

    const clearResult = await supabase
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("user_id", user.id)
      .eq("is_default", true);
    if (clearResult.error) throw clearResult.error;

    const selectResult = await supabase
      .from("customer_addresses")
      .update({ is_default: true })
      .eq("id", addressId)
      .eq("user_id", user.id)
      .select("id")
      .single();
    if (selectResult.error) throw selectResult.error;
  };

  const handleConfirmAddress = async () => {
    if (!selectedAddress || isConfirming) return;
    if (!hasCoordinates(selectedAddress)) {
      toast.error("Confirme o ponto deste endereço no mapa antes de usá-lo para entrega.");
      await navigate({ to: `/enderecos/editar/${selectedAddress.id}` });
      return;
    }

    setIsConfirming(true);
    try {
      if (!selectedAddress.is_default) {
        await setDefaultWithFallback(selectedAddress.id);
      }
      sessionStorage.setItem("apois_checkout_address_changed", "1");
      sessionStorage.setItem("apois_selected_address_id", selectedAddress.id);
      setAddresses((current) =>
        current.map((address) => ({ ...address, is_default: address.id === selectedAddress.id })),
      );
      toast.success("Endereço confirmado");
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      if (window.history.length > 1) router.history.back();
      else await navigate({ to: "/inicio" });
    } catch (error) {
      console.error("Error setting default address:", error);
      toast.error("Não foi possível confirmar este endereço. Tente novamente.");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDelete = async (address: CustomerAddress) => {
    if (address.is_default && addresses.length > 1) {
      toast.error("Defina outro endereço como padrão antes de excluir este");
      return;
    }
    if (!window.confirm("Tem certeza que deseja excluir este endereço?")) return;
    const { error } = await supabase.from("customer_addresses").delete().eq("id", address.id);
    if (error) toast.error("Erro ao excluir endereço");
    else {
      toast.success("Endereço excluído");
      await fetchAddresses();
    }
  };

  const handleUseCurrentLocation = () => {
    sessionStorage.setItem("apois_auto_locate_new_address", "1");
    void navigate({ to: "/enderecos/novo" });
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
      <header className="sticky top-0 z-50 flex items-center justify-center border-b border-zinc-900 bg-black/90 px-4 pb-4 pt-8 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => router.history.back()}
          className="absolute left-3 rounded-full p-2 text-primary active:bg-white/10"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
        <h1 className="text-xl font-extrabold">Meus Endereços</h1>
      </header>

      <main className="flex-1 px-5 pb-32 pt-4">
        <p className="mb-5 text-sm text-zinc-400">Selecione onde o pedido deve ser entregue.</p>

        {isLoading ? (
          <div className="flex justify-center py-20" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : loadError ? (
          <div className="space-y-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
            <p className="text-sm text-red-300">{loadError}</p>
            <Button
              variant="outline"
              onClick={() => void fetchAddresses()}
              className="border-zinc-800"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
            </Button>
          </div>
        ) : addresses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-zinc-800 p-10 text-center">
            <MapPin className="mx-auto h-10 w-10 text-zinc-700" />
            <h2 className="mt-4 font-bold">Nenhum endereço salvo</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Use sua localização para preencher automaticamente o máximo possível do endereço.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {addresses.map((address) => {
              const Icon = getLabelIcon(address.label);
              const located = hasCoordinates(address);
              const selected = selectedAddressId === address.id;
              return (
                <div
                  key={address.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedAddressId(address.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      setSelectedAddressId(address.id);
                  }}
                  className={`rounded-3xl border p-4 ${selected ? "border-primary bg-primary/5" : "border-zinc-800 bg-zinc-950"}`}
                >
                  <div className="flex gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold">{address.label}</span>
                        {address.is_default ? (
                          <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-black text-black">
                            <Star className="h-3 w-3 fill-black" /> Padrão
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-black ${located ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}
                        >
                          {located ? "Mapa confirmado" : "Localização pendente"}
                        </span>
                      </div>
                      <p className="mt-2 truncate text-sm font-semibold">
                        {address.street}, {address.number}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {address.neighborhood} · {address.city}/{address.state}
                      </p>
                    </div>
                  </div>

                  {!located ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void navigate({ to: `/enderecos/editar/${address.id}` });
                      }}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-black text-amber-200"
                    >
                      <AlertTriangle className="h-4 w-4" /> Corrigir localização no mapa
                    </button>
                  ) : null}

                  <div className="mt-3 flex justify-end gap-2 border-t border-zinc-900 pt-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void navigate({ to: `/enderecos/editar/${address.id}` });
                      }}
                      className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-zinc-400"
                    >
                      <Edit2 className="h-4 w-4" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDelete(address);
                      }}
                      className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-red-400"
                    >
                      <Trash2 className="h-4 w-4" /> Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {addresses.length > 0 ? (
          <div className="mt-6 space-y-2">
            <Button
              type="button"
              disabled={!selectedAddressId || isConfirming}
              onClick={() => void handleConfirmAddress()}
              className={`h-14 w-full rounded-2xl font-extrabold text-black ${selectedLocated ? "bg-primary" : "bg-amber-400"}`}
            >
              {isConfirming ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              {selectedLocated ? "Confirmar endereço" : "Corrigir endereço selecionado"}
            </Button>
            {!selectedLocated && selectedAddress ? (
              <p className="text-center text-xs text-amber-300">
                Este endereço não pode ser usado para entrega até o ponto no mapa ser confirmado.
              </p>
            ) : null}
          </div>
        ) : null}

        <Button
          type="button"
          onClick={handleUseCurrentLocation}
          className="mt-4 h-14 w-full rounded-2xl bg-primary font-extrabold text-black shadow-[0_8px_24px_rgba(57,181,74,0.25)]"
        >
          <Navigation className="mr-2 h-5 w-5 fill-current" /> Usar minha localização atual
        </Button>

        <Button
          type="button"
          onClick={() => navigate({ to: "/enderecos/novo" })}
          className="mt-3 h-13 w-full rounded-2xl bg-zinc-900 font-extrabold text-zinc-300 ring-1 ring-zinc-800"
        >
          <Plus className="mr-2 h-5 w-5" /> Adicionar endereço manualmente
        </Button>
      </main>

      <Outlet />
    </div>
  );
}
