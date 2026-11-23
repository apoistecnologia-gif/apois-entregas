Deno.serve(
  () =>
    new Response(JSON.stringify({ error: "sandbox_confirmation_disabled" }), {
      status: 410,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
);
