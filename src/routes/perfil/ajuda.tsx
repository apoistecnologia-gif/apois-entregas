import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  HelpCircle,
  Loader2,
  MapPin,
  MessageSquare,
  ShoppingBag,
  User,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/perfil/ajuda")({
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return { session };
  },
  component: AjudaPage,
});

type SupportCategory = "orders" | "payments" | "account" | "addresses" | "other";

type SupportMessage = {
  id: string;
  sender_user_id: string;
  message: string;
  attachment_paths: unknown[];
  is_internal: boolean;
  created_at: string;
};

type SupportTicket = {
  id: string;
  category: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  order_id: string | null;
  delivery_job_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  support_messages: SupportMessage[];
};

type ListResponse = { tickets: SupportTicket[] };
type CreateResponse = { ticketId: string };
type FunctionErrorBody = { error?: string };

async function invokeSupport<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("customer-support", { body });
  if (error || !data) {
    let message = "Não foi possível acessar o suporte agora.";
    const context = error?.context;
    if (context instanceof Response) {
      try {
        const payload = (await context.clone().json()) as FunctionErrorBody;
        if (payload.error) message = payload.error;
      } catch {
        // Keep safe fallback.
      }
    }
    throw new Error(message);
  }
  return data;
}

const statusLabels: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em atendimento",
  waiting_customer: "Aguardando você",
  resolved: "Resolvido",
  closed: "Encerrado",
};

function AjudaPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<SupportCategory>("orders");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    try {
      const result = await invokeSupport<ListResponse>({ action: "list" });
      setTickets(result.tickets);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar seus chamados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    const channel = supabase
      .channel("customer-support-screen")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => {
        void loadTickets();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, () => {
        void loadTickets();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadTickets]);

  const categories: Array<{
    id: SupportCategory;
    icon: typeof HelpCircle;
    label: string;
    color: string;
  }> = [
    { id: "orders", icon: ShoppingBag, label: "Pedidos", color: "text-orange-400" },
    { id: "payments", icon: CreditCard, label: "Pagamentos", color: "text-emerald-400" },
    { id: "account", icon: User, label: "Minha conta", color: "text-blue-400" },
    { id: "addresses", icon: MapPin, label: "Endereços", color: "text-red-400" },
  ];

  const createTicket = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      await invokeSupport<CreateResponse>({
        action: "create",
        category,
        subject,
        description,
        orderId: null,
      });
      setSubject("");
      setDescription("");
      setSuccess("Chamado aberto com sucesso. Você pode acompanhar a resposta nesta página.");
      await loadTickets();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Não foi possível abrir o chamado.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="z-50 flex shrink-0 items-center justify-between border-b border-zinc-900 bg-black/80 p-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => void navigate({ to: "/perfil" })}
          className="rounded-full bg-zinc-900 p-2 shadow-lg"
          aria-label="Voltar ao perfil"
        >
          <ArrowLeft className="h-5 w-5 text-zinc-300" />
        </button>
        <h1 className="flex-1 text-center text-xl font-bold text-primary">Ajuda e Suporte</h1>
        <div className="w-9" />
      </header>

      <main className="scrollbar-none flex-1 space-y-8 overflow-y-auto p-6">
        <section className="space-y-3">
          <h2 className="ml-1 text-xs font-bold uppercase tracking-widest text-primary">Qual é o assunto?</h2>
          <div className="grid grid-cols-2 gap-3">
            {categories.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setCategory(item.id)}
                className={`flex flex-col items-center gap-3 rounded-3xl border p-4 transition-all active:scale-95 ${
                  category === item.id
                    ? "border-primary/40 bg-primary/10"
                    : "border-zinc-900/50 bg-zinc-900/40"
                }`}
              >
                <div className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-3 ${item.color}`}>
                  <item.icon className="h-6 w-6" />
                </div>
                <span className="text-xs font-bold text-zinc-300">{item.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-3xl border border-zinc-900 bg-zinc-950 p-5">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="font-black">Abrir chamado</h2>
          </div>
          <input
            value={subject}
            maxLength={150}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Assunto"
            className="h-12 w-full rounded-xl border border-zinc-800 bg-black px-4 text-sm outline-none focus:border-primary/40"
          />
          <textarea
            value={description}
            maxLength={3000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Explique o que aconteceu com o máximo de detalhes possível."
            className="h-32 w-full resize-none rounded-xl border border-zinc-800 bg-black p-4 text-sm outline-none focus:border-primary/40"
          />
          {error && <div role="alert" className="rounded-xl bg-red-950/30 p-3 text-sm text-red-200">{error}</div>}
          {success && (
            <div className="flex items-start gap-2 rounded-xl bg-green-950/30 p-3 text-sm text-green-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              {success}
            </div>
          )}
          <button
            type="button"
            onClick={() => void createTicket()}
            disabled={sending || subject.trim().length < 3 || description.trim().length < 10}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-black text-black disabled:opacity-50"
          >
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            {sending ? "Enviando..." : "Enviar para o suporte"}
          </button>
        </section>

        <section className="space-y-4">
          <h2 className="ml-1 text-xs font-bold uppercase tracking-widest text-primary">Perguntas frequentes</h2>
          <Accordion type="single" collapsible className="space-y-3">
            <AccordionItem value="item-1" className="overflow-hidden rounded-2xl border-zinc-900 bg-zinc-900/20 px-4">
              <AccordionTrigger className="py-4 text-sm font-medium text-zinc-200 hover:no-underline">
                Como acompanho meu pedido?
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-xs leading-relaxed text-zinc-500">
                Abra “Meus Pedidos” e toque no pedido desejado. A timeline, o entregador e o PIN são atualizados pelo backend conforme a operação avança.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2" className="overflow-hidden rounded-2xl border-zinc-900 bg-zinc-900/20 px-4">
              <AccordionTrigger className="py-4 text-sm font-medium text-zinc-200 hover:no-underline">
                Qual forma de pagamento está disponível?
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-xs leading-relaxed text-zinc-500">
                No momento, o checkout utiliza PIX pela integração OpenPix/Woovi. Cartão e dinheiro permanecem desativados até suas conciliações financeiras estarem prontas.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3" className="overflow-hidden rounded-2xl border-zinc-900 bg-zinc-900/20 px-4">
              <AccordionTrigger className="py-4 text-sm font-medium text-zinc-200 hover:no-underline">
                Como altero meu endereço?
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-xs leading-relaxed text-zinc-500">
                Vá em Perfil &gt; Meus Endereços. Você pode adicionar, editar, excluir e escolher o endereço padrão usado no checkout.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-widest text-primary">Meus chamados</h2>
            <span className="text-[10px] text-zinc-600">{tickets.length}</span>
          </div>
          {loading ? (
            <div className="flex h-24 items-center justify-center text-primary">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 text-center text-xs text-zinc-600">
              Nenhum chamado aberto até agora.
            </div>
          ) : (
            tickets.map((ticket) => (
              <article key={ticket.id} className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{ticket.subject}</p>
                    <p className="mt-1 text-[10px] uppercase text-zinc-600">{ticket.category}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                    {statusLabels[ticket.status] ?? ticket.status}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-zinc-500">{ticket.description}</p>
                {ticket.support_messages.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-zinc-900 pt-3">
                    {ticket.support_messages.slice(-3).map((message) => (
                      <div key={message.id} className="rounded-xl bg-zinc-900/60 p-3">
                        <p className="text-xs text-zinc-400">{message.message}</p>
                        <p className="mt-1 text-[9px] text-zinc-700">{new Date(message.created_at).toLocaleString("pt-BR")}</p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-[9px] text-zinc-700">Aberto em {new Date(ticket.created_at).toLocaleString("pt-BR")}</p>
              </article>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
