/// <reference types="@types/google.maps" />
import { AdvancedMarker, APIProvider, Map } from "@vis.gl/react-google-maps";
import { Loader2, Navigation, Search } from "lucide-react";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { autocompleteAddress, geocodeAddress, getPlaceDetails } from "@/lib/google-maps.functions";
import { toast } from "sonner";

interface GoogleMapsAddressSelectorProps {
  onAddressSelected: (address: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    postal_code: string;
    latitude?: number | null;
    longitude?: number | null;
  }) => void;
  initialCenter?: { lat: number; lng: number } | null | undefined;
}

type AddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type AddressSuggestion = {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string | null;
  } | null;
};

export function GoogleMapsAddressSelector({
  onAddressSelected,
  initialCenter,
}: GoogleMapsAddressSelectorProps) {
  const browserKey = (import.meta as any).env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const mapId = (import.meta as any).env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;
  const mapConfigured = Boolean(browserKey && mapId);
  const [markerPos, setMarkerPos] = useState(initialCenter || { lat: -23.5505, lng: -46.6333 });
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLocating, setIsLocating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const geocodeFn = useServerFn(geocodeAddress);
  const autocompleteFn = useServerFn(autocompleteAddress);
  const detailsFn = useServerFn(getPlaceDetails);

  const getAccessToken = async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error || !session?.access_token) {
      throw new Error("Sessão expirada");
    }
    return session.access_token;
  };

  const parseAddressComponents = (components: AddressComponent[]) => {
    const getComponent = (type: string) =>
      components.find((component) => component.types.includes(type))?.long_name || "";

    const getShortComponent = (type: string) =>
      components.find((component) => component.types.includes(type))?.short_name || "";

    const street = getComponent("route");
    const neighborhood =
      getComponent("sublocality_level_1") ||
      getComponent("neighborhood") ||
      getComponent("political");
    const city = getComponent("administrative_area_level_2") || getComponent("locality");
    const state = getShortComponent("administrative_area_level_1");
    const postalCode = getComponent("postal_code").replace(/\D/g, "");
    const number = getComponent("street_number");

    return {
      street,
      number,
      neighborhood,
      city,
      state,
      postal_code: postalCode,
    };
  };

  const handleMarkerDragEnd = async (event: google.maps.MapMouseEvent) => {
    if (!event.latLng) return;
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    setMarkerPos({ lat, lng });

    try {
      const accessToken = await getAccessToken();
      const data = await geocodeFn({ data: { lat, lng, accessToken } });
      const first = data.results[0];
      if (first) {
        const address = parseAddressComponents(first.address_components);
        onAddressSelected({ ...address, latitude: lat, longitude: lng });
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      toast.error("Erro ao obter endereço do mapa");
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada pelo seu navegador");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        setMarkerPos({ lat, lng });

        try {
          const accessToken = await getAccessToken();
          const data = await geocodeFn({ data: { lat, lng, accessToken } });
          const first = data.results[0];
          if (first) {
            const address = parseAddressComponents(first.address_components);
            onAddressSelected({ ...address, latitude: lat, longitude: lng });
            toast.success("Localização encontrada!");
          } else {
            toast.error("Não foi possível identificar um endereço para esta localização.");
          }
        } catch {
          toast.error("Erro ao identificar endereço");
        } finally {
          setIsLocating(false);
        }
      },
      () => {
        setIsLocating(false);
        toast.error("Erro ao obter sua localização. Verifique as permissões.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  };

  const handleSearch = async (value: string) => {
    setSearchQuery(value);
    if (!mapConfigured || value.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    try {
      const accessToken = await getAccessToken();
      const data = await autocompleteFn({ data: { input: value, accessToken } });
      setSuggestions(data.predictions);
    } catch (error) {
      console.error("Autocomplete error:", error);
      setSuggestions([]);
    }
  };

  const handleSuggestionSelect = async (suggestion: AddressSuggestion) => {
    setIsSearching(true);
    setSearchQuery(suggestion.description);
    setSuggestions([]);

    try {
      const accessToken = await getAccessToken();
      const data = await detailsFn({ data: { placeId: suggestion.place_id, accessToken } });
      const result = data.result;
      if (result) {
        const { lat, lng } = result.geometry.location;
        setMarkerPos({ lat, lng });
        const address = parseAddressComponents(result.address_components);
        onAddressSelected({ ...address, latitude: lat, longitude: lng });
      } else {
        toast.error("O endereço selecionado não possui coordenadas válidas.");
      }
    } catch {
      toast.error("Erro ao carregar detalhes do endereço");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={searchQuery}
            onChange={(event) => void handleSearch(event.target.value)}
            placeholder="Buscar endereço ou CEP..."
            disabled={!mapConfigured || isSearching}
            className="h-12 rounded-xl border-zinc-800 bg-zinc-900 pl-10 text-white focus:ring-primary"
          />
          {isSearching ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
          ) : null}
        </div>

        {suggestions.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
            {suggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion.place_id}
                onClick={() => void handleSuggestionSelect(suggestion)}
                className="w-full border-b border-zinc-800 p-3 text-left text-sm last:border-0 hover:bg-zinc-800"
              >
                <p className="font-medium">
                  {suggestion.structured_formatting?.main_text ?? suggestion.description}
                </p>
                {suggestion.structured_formatting?.secondary_text ? (
                  <p className="truncate text-xs text-zinc-500">
                    {suggestion.structured_formatting.secondary_text}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <Button
        type="button"
        onClick={handleGetCurrentLocation}
        disabled={isLocating}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FFD700] font-bold text-black shadow-lg transition-all hover:bg-[#FFD700]/90 active:scale-[0.98]"
      >
        {isLocating ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <Navigation className="h-5 w-5 fill-current" />
            Usar minha localização atual
          </>
        )}
      </Button>

      {mapConfigured ? (
        <APIProvider apiKey={browserKey!}>
          <div className="relative h-48 w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            <Map
              center={markerPos}
              zoom={15}
              gestureHandling="greedy"
              disableDefaultUI
              mapId={mapId!}
              onTilesLoaded={() => setIsMapLoaded(true)}
            >
              <AdvancedMarker position={markerPos} draggable onDragEnd={handleMarkerDragEnd} />
            </Map>

            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleGetCurrentLocation();
              }}
              disabled={isLocating}
              className="absolute bottom-4 right-4 z-[150] flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-2 border-black bg-[#FFD700] p-0 text-black shadow-lg transition-all hover:bg-[#FFD700]/90 active:scale-90"
              title="Usar minha localização atual"
              aria-label="Usar minha localização atual"
            >
              {isLocating ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Navigation className="h-6 w-6 fill-current" />
              )}
            </button>

            {!isMapLoaded ? (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-900">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : null}
          </div>
        </APIProvider>
      ) : (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200">
          O mapa e a busca automática de endereços estão indisponíveis neste ambiente. Você ainda
          pode usar sua localização atual e preencher os dados do endereço manualmente.
        </div>
      )}
    </div>
  );
}
