import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const geocodeAddress = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ lat: z.number(), lng: z.number() }).parse(data))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
    const GOOGLE_MAPS_API_KEY = process.env["GOOGLE_MAPS_API_KEY"];

    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      throw new Error("Missing Google Maps Platform credentials");
    }

    const url = new URL("https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json");
    url.searchParams.append("latlng", `${data.lat},${data.lng}`);
    url.searchParams.append("key", GOOGLE_MAPS_API_KEY);

    const response = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Google Maps API error: ${response.statusText}`);
    }

    return response.json();
  });

export const autocompleteAddress = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ input: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
    const GOOGLE_MAPS_API_KEY = process.env["GOOGLE_MAPS_API_KEY"];

    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      throw new Error("Missing Google Maps Platform credentials");
    }

    const url = new URL("https://connector-gateway.lovable.dev/google_maps/maps/api/place/autocomplete/json");
    url.searchParams.append("input", data.input);
    url.searchParams.append("components", "country:br");
    url.searchParams.append("language", "pt-BR");
    url.searchParams.append("key", GOOGLE_MAPS_API_KEY);

    const response = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Google Maps API error: ${response.statusText}`);
    }

    return response.json();
  });

export const getPlaceDetails = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ placeId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
    const GOOGLE_MAPS_API_KEY = process.env["GOOGLE_MAPS_API_KEY"];

    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      throw new Error("Missing Google Maps Platform credentials");
    }

    const url = new URL("https://connector-gateway.lovable.dev/google_maps/maps/api/place/details/json");
    url.searchParams.append("place_id", data.placeId);
    url.searchParams.append("fields", "address_components,geometry");
    url.searchParams.append("key", GOOGLE_MAPS_API_KEY);

    const response = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Google Maps API error: ${response.statusText}`);
    }

    return response.json();
  });
