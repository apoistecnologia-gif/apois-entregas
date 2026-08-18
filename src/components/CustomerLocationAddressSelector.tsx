import { Loader2, Navigation, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Address = {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  postal_code: string;
  latitude?: number | null;
  longitude?: number | null;
};

type AddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type Suggestion = {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text: string;
    secondary_text?: string;
  };
};

interface Props {
  onAddressSelected: (address: Address) => void;
  autoLocate?: boolean;
}

function parseAddressComponents(components: AddressComponent[]): Address {
  const getLong = (type: string) =>
    components.find((component) => component.types.includes(type))?.long_name || "";
  const getShort = (type: string) =>
    components.find((component) => component.types.includes(type))?.short_name || "";

  return {
    street: getLong("route"),
    number: getLong("street_number"),
    neighborhood:
      getLong("sublocality_level_1") ||
      getLong("neighborhood") ||
      getLong("sublocality") ||
      "",
    city:
      getLong("locality") ||
      getLong("administrative_area_level_2") ||
      getLong("administrative_area_level_3") ||
      "",
    state: getShort("administrative_area_level_1"),
    postal_code: getLong("postal_code").replace(/\D/g, ""),
  };
}

async function invokeMaps(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("google-maps-address", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function CustomerLocationAddressSelector({ onAddressSelected, autoLocate = false }: Props) {
  const [isLocating, setIsLocating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const autoRan = useRef(false);

  const locate = async () => {
    if (!navigator.geolocation) {
      toast.error("Seu aparelho não oferece localização para este aplicativo.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        try {
          const data = await invokeMaps({ action: "reverse_geocode", lat, lng });
          const first = data?.results?.[0];
          if (!first?.address_components) {
            throw new Error("O Google não retornou os dados deste endereço.");
          }

          const address = parseAddressComponents(first.address_components);
          onAddressSelected({ ...address, latitude: lat, longitude: lng });

          const missing = [
            !address.street && "rua",
            !address.number && "número",
            !address.neighborhood && "bairro",
            !address.city && "cidade",
            !address.state && "UF",
            !address.postal_code && "CEP",
          ].filter(Boolean);

          if (missing.length > 0) {
            toast.success(`Localização encontrada. Complete apenas: ${missing.join(", ")}.`);
          } else {
            toast.success("Endereço preenchido pela sua localização.");
          }
        } catch (error) {
          console.error("Erro ao converter GPS em endereço:", error);
          onAddressSelected({
            street: "",
            number: "",
            neighborhood: "",
            city: "",
            state: "",
            postal_code: "",
            latitude: lat,
            longitude: lng,
          });
          toast.error(
            error instanceof Error
              ? `Localização obtida, mas não foi possível buscar o endereço: ${error.message}`
              : "Localização obtida, mas não foi possível buscar o endereço.",
          );
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        console.error("Erro de geolocalização:", error);
        setIsLocating(false);
        toast.error("Não foi possível acessar sua localização. Verifique a permissão do aplicativo.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 },
    );
  };

  useEffect(() => {
    if (!autoLocate || autoRan.current) return;
    autoRan.current = true;
    const timer = window.setTimeout(() => void locate(), 250);
    return () => window.clearTimeout(timer);
  }, [autoLocate]);

  const search = async (value: string) => {
    setQuery(value);
    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const data = await invokeMaps({ action: "autocomplete", input: value.trim() });
      setSuggestions(Array.isArray(data?.predictions) ? data.predictions : []);
    } catch (error) {
      console.error("Erro no autocomplete:", error);
      setSuggestions([]);
    }
  };

  const selectSuggestion = async (suggestion: Suggestion) => {
    setIsSearching(true);
    setQuery(suggestion.description);
    setSuggestions([]);
    try {
      const data = await invokeMaps({ action: "place_details", placeId: suggestion.place_id });
      const result = data?.result;
      if (!result?.geometry?.location || !result?.address_components) {
        throw new Error("Endereço sem coordenadas válidas.");
      }
      const address = parseAddressComponents(result.address_components);
      onAddressSelected({
        ...address,
        latitude: Number(result.geometry.location.lat),
        longitude: Number(result.geometry.location.lng),
      });
      toast.success("Endereço encontrado. Complete somente o que estiver faltando.");
    } catch (error) {
      console.error("Erro ao selecionar endereço:", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar o endereço.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={() => void locate()}
        disabled={isLocating}
        className="h-14 w-full rounded-2xl bg-primary text-base font-black text-black"
      >
        {isLocating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Navigation className="mr-2 h-5 w-5 fill-current" />}
        {isLocating ? "Buscando seu endereço..." : "Usar minha localização atual"}
      </Button>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
        <Input
          value={query}
          onChange={(event) => void search(event.target.value)}
          placeholder="Ou buscar endereço/CEP"
          disabled={isSearching}
          className="h-12 rounded-xl border-zinc-800 bg-zinc-900 pl-10 text-white"
        />
        {isSearching ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" /> : null}
        {suggestions.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-[200] mt-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
            {suggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion.place_id}
                onClick={() => void selectSuggestion(suggestion)}
                className="w-full border-b border-zinc-800 p-3 text-left last:border-0 active:bg-zinc-900"
              >
                <p className="text-sm font-semibold text-white">
                  {suggestion.structured_formatting?.main_text || suggestion.description}
                </p>
                {suggestion.structured_formatting?.secondary_text ? (
                  <p className="mt-0.5 truncate text-xs text-zinc-500">{suggestion.structured_formatting.secondary_text}</p>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="px-1 text-xs leading-relaxed text-zinc-500">
        O app tenta preencher rua, bairro, cidade, UF, CEP e número automaticamente. Você completa apenas o que não for identificado.
      </p>
    </div>
  );
}
