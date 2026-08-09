/// <reference types="@types/google.maps" />
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { useState, useCallback, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Search, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { geocodeAddress, autocompleteAddress, getPlaceDetails } from "@/lib/google-maps.functions";
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

export function GoogleMapsAddressSelector({
  onAddressSelected,
  initialCenter,
}: GoogleMapsAddressSelectorProps) {
  const browserKey = (import.meta as any).env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const [markerPos, setMarkerPos] = useState(initialCenter || { lat: -23.5505, lng: -46.6333 }); // Default SP
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isLocating, setIsLocating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const geocodeFn = useServerFn(geocodeAddress);
  const autocompleteFn = useServerFn(autocompleteAddress);
  const detailsFn = useServerFn(getPlaceDetails);

  const parseAddressComponents = (components: any[]) => {
    const getComponent = (type: string) =>
      components.find((c: any) => c.types.includes(type))?.long_name || "";

    const getShortComponent = (type: string) =>
      components.find((c: any) => c.types.includes(type))?.short_name || "";

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

  const handleMarkerDragEnd = async (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setMarkerPos({ lat, lng });

    try {
      const data = await geocodeFn({ data: { lat, lng } });
      if (data.results && data.results[0]) {
        const addr = parseAddressComponents(data.results[0].address_components);
        onAddressSelected({ ...addr, latitude: lat, longitude: lng });
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
          const data = await geocodeFn({ data: { lat, lng } });
          if (data.results && data.results[0]) {
            const addr = parseAddressComponents(data.results[0].address_components);
            onAddressSelected({ ...addr, latitude: lat, longitude: lng });
            toast.success("Localização encontrada!");
          }
        } catch (error) {
          toast.error("Erro ao identificar endereço");
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        setIsLocating(false);
        toast.error("Erro ao obter sua localização. Verifique as permissões.");
      },
    );
  };

  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    if (val.length < 3) {
      setSuggestions([]);
      return;
    }

    try {
      const data = await autocompleteFn({ data: { input: val } });
      setSuggestions(data.predictions || []);
    } catch (error) {
      console.error("Autocomplete error:", error);
    }
  };

  const handleSuggestionSelect = async (suggestion: any) => {
    setIsSearching(true);
    setSearchQuery(suggestion.description);
    setSuggestions([]);

    try {
      const data = await detailsFn({ data: { placeId: suggestion.place_id } });
      if (data.result && data.result.geometry) {
        const { lat, lng } = data.result.geometry.location;
        const newPos = { lat, lng };
        setMarkerPos(newPos);

        const addr = parseAddressComponents(data.result.address_components);
        onAddressSelected({ ...addr, latitude: lat, longitude: lng });
      }
    } catch (error) {
      toast.error("Erro ao carregar detalhes do endereço");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <APIProvider apiKey={browserKey}>
      <div className="space-y-4">
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Buscar endereço ou CEP..."
              className="bg-zinc-900 border-zinc-800 h-12 pl-10 rounded-xl focus:ring-primary text-white"
            />
          </div>

          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 bg-zinc-900 border border-zinc-800 mt-1 rounded-xl shadow-2xl overflow-hidden">
              {suggestions.map((s) => (
                <button
                  key={s.place_id}
                  onClick={() => handleSuggestionSelect(s)}
                  className="w-full text-left p-3 hover:bg-zinc-800 text-sm border-b border-zinc-800 last:border-0"
                >
                  <p className="font-medium">{s.structured_formatting?.main_text}</p>
                  <p className="text-zinc-500 text-xs truncate">
                    {s.structured_formatting?.secondary_text}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        <Button
          type="button"
          onClick={handleGetCurrentLocation}
          disabled={isLocating}
          className="w-full bg-[#FFD700] text-black hover:bg-[#FFD700]/90 font-bold h-12 rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
        >
          {isLocating ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Navigation className="w-5 h-5 fill-current" />
              Usar minha localização atual
            </>
          )}
        </Button>

        <div className="relative h-48 w-full rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900">
          <Map
            center={markerPos}
            zoom={15}
            gestureHandling={"greedy"}
            disableDefaultUI={true}
            mapId="DEMO_MAP_ID"
            onTilesLoaded={() => setIsMapLoaded(true)}
          >
            <AdvancedMarker position={markerPos} draggable={true} onDragEnd={handleMarkerDragEnd} />
          </Map>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleGetCurrentLocation();
            }}
            disabled={isLocating}
            className="absolute bottom-4 right-4 bg-[#FFD700] text-black hover:bg-[#FFD700]/90 w-12 h-12 p-0 rounded-full shadow-lg z-[150] border-2 border-black active:scale-90 transition-all flex items-center justify-center cursor-pointer"
            title="Usar minha localização atual"
          >
            {isLocating ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Navigation className="w-6 h-6 fill-current" />
            )}
          </button>

          {!isMapLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}
        </div>
      </div>
    </APIProvider>
  );
}
