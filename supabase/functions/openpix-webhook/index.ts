Deno.serve(
  () =>
    new Response(JSON.stringify({ error: "provider_retired", provider: "openpix" }), {
      status: 410,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
);
