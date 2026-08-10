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

const addressComponentSchema = z.object({
  long_name: z.string(),
  short_name: z.string(),
  types: z.array(z.string()),
});

const geocodeResponseSchema = z.object({
  results: z.array(
    z.object({
      address_components: z.array(addressComponentSchema),
    }),
  ),
});

const autocompleteResponseSchema = z.object({
  predictions: z.array(
    z.object({
      place_id: z.string(),
      description: z.string(),
      structured_formatting: z
        .object({
          main_text: z.string(),
          secondary_text: z.string().nullable(),
        })
        .nullable(),
    }),
  ),
});

const placeDetailsResponseSchema = z.object({
  result: z
    .object({
      geometry: z.object({
        location: z.object({
          lat: z.number().finite(),
          lng: z.number().finite(),
        }),
      }),
      address_components: z.array(addressComponentSchema),
    })
    .nullable(),
});

const statusSchema = z.object({
  status: z.string(),
});

function getGoogleMapsApiKey() {
  const apiKey = process.env["GOOGLE_MAPS_API_KEY"]?.trim();
  if (!apiKey) {
    throw new Error("Google Maps server credential is not configured");
  }
  return apiKey;
}

async function fetchGoogleMapsJson(url: URL): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Google Maps API HTTP ${response.status}`);
  }

  return response.json();
}

function assertApiStatus(payload: unknown, allowedStatuses: string[]) {
  const { status } = statusSchema.parse(payload);
  if (!allowedStatuses.includes(status)) {
    throw new Error(`Google Maps API returned ${status}`);
  }
}

export const geocodeAddress = createServerFn({ method: "GET" })
  .validator((data: unknown) => geocodeInput.parse(data))
  .handler(async ({ data }) => {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${data.lat},${data.lng}`);
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("region", "br");
    url.searchParams.set("key", getGoogleMapsApiKey());

    const raw = await fetchGoogleMapsJson(url);
    assertApiStatus(raw, ["OK", "ZERO_RESULTS"]);
    const parsed = geocodeResponseSchema.parse(raw);
    return { results: parsed.results };
  });

export const autocompleteAddress = createServerFn({ method: "GET" })
  .validator((data: unknown) => autocompleteInput.parse(data))
  .handler(async ({ data }) => {
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", data.input);
    url.searchParams.set("components", "country:br");
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("key", getGoogleMapsApiKey());

    const raw = await fetchGoogleMapsJson(url);
    assertApiStatus(raw, ["OK", "ZERO_RESULTS"]);
    const parsed = autocompleteResponseSchema.parse(raw);
    return { predictions: parsed.predictions };
  });

export const getPlaceDetails = createServerFn({ method: "GET" })
  .validator((data: unknown) => placeDetailsInput.parse(data))
  .handler(async ({ data }) => {
    const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    url.searchParams.set("place_id", data.placeId);
    url.searchParams.set("fields", "address_components,geometry");
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("key", getGoogleMapsApiKey());

    const raw = await fetchGoogleMapsJson(url);
    assertApiStatus(raw, ["OK"]);
    const parsed = placeDetailsResponseSchema.parse(raw);
    return { result: parsed.result };
  });
