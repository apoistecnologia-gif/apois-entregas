const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const headers = { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

Deno.serve((request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  return new Response(
    JSON.stringify({
      error: "provider_retired",
      code: "ASAAS_RETIRED",
      message: "Cobranças de pedidos não usam mais Asaas na APOIS ENTREGAS.",
    }),
    { status: 410, headers },
  );
});
