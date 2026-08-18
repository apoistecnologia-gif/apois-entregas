import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function googleJson(url: URL) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Google Maps HTTP ${response.status}`);
  const payload = await response.json();
  if (!["OK", "ZERO_RESULTS"].includes(payload?.status)) {
    throw new Error(`Google Maps retornou ${payload?.status ?? "erro desconhecido"}`);
  }
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY")?.trim();
    if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY não configurada no Supabase");

    const body = await req.json();
    const action = String(body?.action ?? "");

    if (action === "reverse_geocode") {
      const lat = Number(body?.lat);
      const lng = Number(body?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: "Coordenadas inválidas" }, 400);
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("latlng", `${lat},${lng}`);
      url.searchParams.set("language", "pt-BR");
      url.searchParams.set("region", "br");
      url.searchParams.set("key", apiKey);
      const payload = await googleJson(url);
      return json({ results: payload.results ?? [] });
    }

    if (action === "autocomplete") {
      const input = String(body?.input ?? "").trim();
      if (input.length < 3) return json({ predictions: [] });
      const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
      url.searchParams.set("input", input);
      url.searchParams.set("components", "country:br");
      url.searchParams.set("language", "pt-BR");
      url.searchParams.set("key", apiKey);
      const payload = await googleJson(url);
      return json({ predictions: payload.predictions ?? [] });
    }

    if (action === "place_details") {
      const placeId = String(body?.placeId ?? "").trim();
      if (!placeId) return json({ error: "placeId obrigatório" }, 400);
      const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      url.searchParams.set("place_id", placeId);
      url.searchParams.set("fields", "address_components,geometry");
      url.searchParams.set("language", "pt-BR");
      url.searchParams.set("key", apiKey);
      const payload = await googleJson(url);
      return json({ result: payload.result ?? null });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (error) {
    console.error("google-maps-address error", error);
    return json({ error: error instanceof Error ? error.message : "Erro ao consultar endereço" }, 500);
  }
});
