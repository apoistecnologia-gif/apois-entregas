import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(
  () =>
    new Response(JSON.stringify({ error: "homologation_helper_disabled" }), {
      status: 410,
      headers: { "content-type": "application/json; charset=utf-8" },
    }),
);
