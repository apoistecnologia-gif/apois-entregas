Deno.serve(() =>
  Response.json(
    { error: "diagnostic_retired" },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  ),
);
