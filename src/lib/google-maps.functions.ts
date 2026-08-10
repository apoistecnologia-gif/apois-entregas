import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const geocodeInput = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

const autocompleteInput = z.object({
  input: z.string().trim().min(3).max(256),
});

const placeDetailsInput = z.object({
  placeId: z.string().trim().min(1).max(512),
});

type GoogleMapsResponse = {
  status?: string;
  error_message?: string;
  [key: string]: unknown;
};

function getGoogleMapsApiKey() {
  const apiKey = process.env["GOOGLE_MAPS_API_KEY"]?.trim();
  if (!apiKey) {
    throw new Error("Google Maps server credential is not configured");
  }
  return apiKey;
}

async function fetchGoogleMapsJson(url: URL, allowedStatuses: string[]) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Google Maps API HTTP ${response.status}`);
  }

  const payload = (await response.json()) as GoogleMapsResponse;
  const apiStatus = typeof payload.status === "string" ? payload.status : null;
  if (apiStatus && !allowedStatuses.includes(apiStatus)) {
    throw new Error(`Google Maps API returned ${apiStatus}`);
  }

  return payload;
}

export const geocodeAddress = createServerFn({ method: "GET" })
  .validator((data: unknown) => geocodeInput.parse(data))
  .handler(async ({ data }) => {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${data.lat},${data.lng}`);
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("region", "br");
    url.searchParams.set("key", getGoogleMapsApiKey());

    return fetchGoogleMapsJson(url, ["OK", "ZERO_RESULTS"]);
  });

export const autocompleteAddress = createServerFn({ method: "GET" })
  .validator((data: unknown) => autocompleteInput.parse(data))
  .handler(async ({ data }) => {
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", data.input);
    url.searchParams.set("components", "country:br");
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("key", getGoogleMapsApiKey());

    return fetchGoogleMapsJson(url, ["OK", "ZERO_RESULTS"]);
  });

export const getPlaceDetails = createServerFn({ method: "GET" })
  .validator((data: unknown) => placeDetailsInput.parse(data))
  .handler(async ({ data }) => {
    const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    url.searchParams.set("place_id", data.placeId);
    url.searchParams.set("fields", "address_components,geometry");
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("key", getGoogleMapsApiKey());

    return fetchGoogleMapsJson(url, ["OK"]);
  });
