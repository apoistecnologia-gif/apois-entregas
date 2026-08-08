/// <reference types="@types/google.maps" />
import {
  APIProvider,
  AdvancedMarker,
  Map,
  useApiIsLoaded,
} from "@vis.gl/react-google-maps";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Navigation, Search, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

export interface SelectedAddress {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  postal_code: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface GoogleMapsAddressSelectorProps {
  onAddressSelected: (address: SelectedAddress) => void;
  initialCenter?: { lat: number; lng: number } | null;
}

type Suggestion = google.maps.places.AutocompletePrediction;

function parseAddressComponents(
  components: google.maps.GeocoderAddressComponent[] | undefined,
): Omit<SelectedAddress, "latitude" | "longitude"> {
  const list = components ?? [];
  const getComponent = (type: string) =>
    list.find((component) => component.types.includes(type))?.long_name ?? "";
  const getShortComponent = (type: string) =>
    list.find((component) => component.types.includes(type))?.short_name ?? "";

  return {
    street: getComponent("route"),
    number: getComponent("street_number"),
    neighborhood:
      getComponent("sublocality_level_1") ||
      getComponent("neighborhood") ||
      getComponent("sublocality"),
    city:
      getComponent("administrative_area_level_2") ||
      getComponent("locality") ||
      getComponent("administrative_area_level_3"),
    state: getShortComponent("administrative_area_level_1"),
    postal_code: getComponent("postal_code").replace(/\D/g, ""),
  };
}

export function GoogleMapsAddressSelector({
  onAddressSelected,
  initialCenter,
}: GoogleMapsAddressSelectorProps) {
  const browserKey =
    import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ||
    import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY ||
    "";

  if (!browserKey) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-center">
        <MapPin className="mx-auto mb-3 h-8 w-8 text-primary" />
        <p className="font-semibold text-white">Mapa temporariamente indisponível</p>
        <p className="mt-1 text-sm text-zinc-400">
          A chave pública do Google Maps ainda não foi configurada neste ambiente.
        </p>
      </div>
    );
  }

  return (
    <APIProvider apiKey={browserKey} libraries={["places"]} region="BR" language="pt-BR">
      <AddressSelectorContent
        onAddressSelected={onAddressSelected}
        initialCenter={initialCenter}
      />
    </APIProvider>
  );
}

function AddressSelectorContent({
  onAddressSelected,
  initialCenter,
}: GoogleMapsAddressSelectorProps) {
  const apiLoaded = useApiIsLoaded();
  const [markerPos, setMarkerPos] = useState(initialCenter ?? { lat: -23.5505, lng: -46.6333 });
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLocating, setIsLocating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const autocompleteRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const placesHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!apiLoaded || !placesHostRef.current) return;
    autocompleteRef.current = new google.maps.places.AutocompleteService();
    placesServiceRef.current = new google.maps.places.PlacesService(placesHostRef.current);
  }, [apiLoaded]);

  const reverseGeocode = async (lat: number, lng: number) => {
    const geocoder = new google.maps.Geocoder();
    const response = await geocoder.geocode({ location: { lat, lng } });
    const result = response.results[0];
    if (!result) throw new Error("ADDRESS_NOT_FOUND");

    return {
      ...parseAddressComponents(result.address_components),
      latitude: lat,
      longitude: lng,
    } satisfies SelectedAddress;
  };

  const handleMarkerDragEnd = async (event: google.maps.MapMouseEvent) => {
    if (!event.latLng) return;
    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    setMarkerPos({ lat, lng });

    try {
      onAddressSelected(await reverseGeocode(lat, lng));
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
          onAddressSelected(await reverseGeocode(lat, lng));
          toast.success("Localização encontrada!");
        } catch (error) {
          console.error("Reverse geocoding error:", error);
          toast.error("Erro ao identificar endereço");
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        console.error("Geolocation error:", error.code);
        setIsLocating(false);
        toast.error("Erro ao obter sua localização. Verifique as permissões.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (value.trim().length < 3 || !autocompleteRef.current) {
      setSuggestions([]);
      return;
    }

    autocompleteRef.current.getPlacePredictions(
      {
        input: value,
        componentRestrictions: { country: "br" },
        types: ["geocode"],
      },
      (predictions, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
          setSuggestions(predictions);
        } else {
          setSuggestions([]);
        }
      },
    );
  };

  const handleSuggestionSelect = (suggestion: Suggestion) => {
    const service = placesServiceRef.current;
    if (!service) return;

    setIsSearching(true);
    setSearchQuery(suggestion.description);
    setSuggestions([]);

    service.getDetails(
      {
        placeId: suggestion.place_id,
        fields: ["address_components", "geometry", "formatted_address"],
      },
      (place, status) => {
        try {
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !place?.geometry?.location
          ) {
            toast.error("Erro ao carregar detalhes do endereço");
            return;
          }

          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          setMarkerPos({ lat, lng });
          onAddressSelected({
            ...parseAddressComponents(place.address_components),
            latitude: lat,
            longitude: lng,
          });
        } finally {
          setIsSearching(false);
        }
      },
    );
  };

  return (
    <div className="space-y-4">
      <div ref={placesHostRef} className="hidden" aria-hidden="true" />

      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={searchQuery}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="Buscar endereço ou CEP..."
            autoComplete="off"
            className="h-12 rounded-xl border-zinc-800 bg-zinc-900 pl-10 text-white focus:ring-primary"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" />
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
            {suggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion.place_id}
                onClick={() => handleSuggestionSelect(suggestion)}
                className="w-full border-b border-zinc-800 p-3 text-left text-sm last:border-0 hover:bg-zinc-800"
              >
                <p className="font-medium">
                  {suggestion.structured_formatting?.main_text ?? suggestion.description}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {suggestion.structured_formatting?.secondary_text ?? ""}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <Button
        type="button"
        onClick={handleGetCurrentLocation}
        disabled={isLocating || !apiLoaded}
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

      <div className="relative h-48 w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <Map
          center={markerPos}
          zoom={15}
          gestureHandling="greedy"
          disableDefaultUI
          mapId="APOIS_ADDRESS_PICKER"
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

        {!isMapLoaded && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-900">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
