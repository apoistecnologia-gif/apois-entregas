from pathlib import Path

p = Path('supabase/functions/dispatch-push-outbox/index.ts')
s = p.read_text()
old = '''  const expectedDispatchKey = env("PUSH_DISPATCH_WEBHOOK_SECRET");
  const suppliedDispatchKey = req.headers.get("x-apois-push-dispatch-key")?.trim() ?? "";
  if (!expectedDispatchKey) return response(503, { error: "push_dispatch_secret_not_configured" });
  if (!suppliedDispatchKey || suppliedDispatchKey !== expectedDispatchKey) {
    return response(401, { error: "invalid_dispatch_key" });
  }

  const supabaseUrl = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const firebaseProjectId = env("FIREBASE_PROJECT_ID");
  const firebaseClientEmail = env("FIREBASE_CLIENT_EMAIL");
  const firebasePrivateKey = Deno.env.get("FIREBASE_PRIVATE_KEY") ?? "";
  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !firebaseProjectId ||
    !firebaseClientEmail ||
    !firebasePrivateKey
  ) {
    return response(503, { error: "firebase_server_credentials_not_configured" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
'''
new = '''  const suppliedDispatchKey = req.headers.get("x-apois-push-dispatch-key")?.trim() ?? "";
  if (!suppliedDispatchKey) return response(401, { error: "invalid_dispatch_key" });

  const supabaseUrl = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const firebaseProjectId = env("FIREBASE_PROJECT_ID");
  const firebaseClientEmail = env("FIREBASE_CLIENT_EMAIL");
  const firebasePrivateKey = Deno.env.get("FIREBASE_PRIVATE_KEY") ?? "";
  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !firebaseProjectId ||
    !firebaseClientEmail ||
    !firebasePrivateKey
  ) {
    return response(503, { error: "firebase_server_credentials_not_configured" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: dispatchKeyValid, error: dispatchKeyError } = await supabase.rpc(
    "verify_push_dispatch_runtime_key",
    { _candidate: suppliedDispatchKey },
  );
  if (dispatchKeyError || dispatchKeyValid !== true) {
    return response(401, { error: "invalid_dispatch_key" });
  }
'''
if old not in s:
    raise SystemExit('dispatcher auth pattern not found')
p.write_text(s.replace(old, new))
