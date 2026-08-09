import { createClient } from "npm:@supabase/supabase-js@2.112.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" };

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const reply = (status: number, body: JsonRecord) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST")
    return reply(405, { error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" });

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return reply(401, { error: "Autenticação obrigatória.", code: "UNAUTHORIZED" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return reply(500, {
      error: "Serviço temporariamente indisponível.",
      code: "SERVER_CONFIGURATION",
    });
  }

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user)
    return reply(401, { error: "Sessão inválida ou expirada.", code: "UNAUTHORIZED" });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return reply(400, { error: "Requisição inválida.", code: "INVALID_REQUEST" });
  }
  if (!isRecord(payload))
    return reply(400, { error: "Requisição inválida.", code: "INVALID_REQUEST" });

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (payload.action === "list") {
    const { data, error } = await client
      .from("support_tickets")
      .select(
        `
        id,category,subject,description,priority,status,order_id,delivery_job_id,created_at,updated_at,resolved_at,closed_at,
        support_messages(id,sender_user_id,message,attachment_paths,is_internal,created_at)
      `,
      )
      .eq("requester_user_id", authData.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("customer-support list failed", { code: error.code });
      return reply(500, { error: "Não foi possível carregar seus chamados.", code: "LIST_FAILED" });
    }
    const sanitized = (data ?? []).map((ticket) => ({
      ...ticket,
      support_messages: (ticket.support_messages ?? []).filter((message) => !message.is_internal),
    }));
    return reply(200, { tickets: sanitized });
  }

  if (payload.action === "create") {
    const category = payload.category;
    const subject = payload.subject;
    const description = payload.description;
    const orderId = payload.orderId;

    if (
      typeof category !== "string" ||
      !["orders", "payments", "account", "addresses", "other"].includes(category)
    ) {
      return reply(400, { error: "Categoria inválida.", code: "INVALID_CATEGORY" });
    }
    if (typeof subject !== "string" || subject.trim().length < 3 || subject.trim().length > 150) {
      return reply(400, { error: "Informe um assunto válido.", code: "INVALID_SUBJECT" });
    }
    if (
      typeof description !== "string" ||
      description.trim().length < 10 ||
      description.trim().length > 3000
    ) {
      return reply(400, {
        error: "Descreva o problema com pelo menos 10 caracteres.",
        code: "INVALID_DESCRIPTION",
      });
    }
    if (orderId !== null && orderId !== undefined && typeof orderId !== "string") {
      return reply(400, { error: "Pedido inválido.", code: "INVALID_ORDER" });
    }

    const { data: ticketId, error } = await client.rpc("create_support_ticket", {
      _category: category,
      _subject: subject.trim(),
      _description: description.trim(),
      _order_id: typeof orderId === "string" && orderId ? orderId : null,
      _delivery_job_id: null,
    });
    if (error) {
      console.error("customer-support create failed", { code: error.code });
      return reply(400, { error: "Não foi possível abrir o chamado.", code: "CREATE_FAILED" });
    }
    return reply(200, { ticketId });
  }

  if (payload.action === "message") {
    const ticketId = payload.ticketId;
    const message = payload.message;
    if (
      typeof ticketId !== "string" ||
      typeof message !== "string" ||
      message.trim().length < 1 ||
      message.trim().length > 3000
    ) {
      return reply(400, { error: "Mensagem inválida.", code: "INVALID_MESSAGE" });
    }
    const { error } = await client.rpc("add_support_message", {
      _ticket_id: ticketId,
      _message: message.trim(),
      _attachment_paths: [],
      _is_internal: false,
    });
    if (error) {
      console.error("customer-support message failed", { code: error.code });
      return reply(400, { error: "Não foi possível enviar a mensagem.", code: "MESSAGE_FAILED" });
    }
    return reply(200, { sent: true });
  }

  return reply(400, { error: "Ação inválida.", code: "INVALID_ACTION" });
});
