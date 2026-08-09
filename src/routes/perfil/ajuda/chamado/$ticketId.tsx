import { createFileRoute, redirect, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Loader2, LockKeyhole, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SupportMessage = {
  id: string;
  sender_user_id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
};

type SupportTicket = {
  id: string;
  requester_user_id: string;
  category: string;
  subject: string;
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  created_at: string;
  updated_at: string;
  support_messages?: SupportMessage[];
};

const statusLabels: Record<SupportTicket["status"], string> = {
  open: "Aberto",
  in_progress: "Em atendimento",
  resolved: "Resolvido",
  closed: "Fechado",
};

export const Route = createFileRoute("/perfil/ajuda/chamado/$ticketId")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
    return { session };
  },
  component: SupportConversationPage,
  head: () => ({ meta: [{ title: "Chamado de suporte | APOIS ENTREGA" }] }),
});

function SupportConversationPage() {
  const navigate = useNavigate();
  const { ticketId } = useParams({ from: "/perfil/ajuda/chamado/$ticketId" });
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadTicket = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const { data, error } = await supabase.functions.invoke("customer-support", {
      body: { action: "list" },
    });

    if (error) {
      console.error("Erro ao carregar chamado:", error);
      setTicket(null);
      setErrorMessage("Não foi possível carregar este chamado agora.");
      setLoading(false);
      return;
    }

    const tickets = Array.isArray(data?.tickets) ? (data.tickets as SupportTicket[]) : [];
    const found = tickets.find((item) => item.id === ticketId) ?? null;
    setTicket(found);
    if (!found) setErrorMessage("Chamado não encontrado.");
    setLoading(false);
  }, [ticketId]);

  useEffect(() => {
    void loadTicket();
  }, [loadTicket]);

  const sendMessage = async () => {
    const trimmed = message.trim();
    if (!ticket || sending || !trimmed) return;
    if (ticket.status === "closed") {
      toast.info("Este chamado está fechado.");
      return;
    }
    if (trimmed.length > 3000) {
      toast.error("A mensagem pode ter no máximo 3.000 caracteres.");
      return;
    }

    setSending(true);
    const { error } = await supabase.functions.invoke("customer-support", {
      body: {
        action: "message",
        ticketId: ticket.id,
        message: trimmed,
      },
    });

    if (error) {
      console.error("Erro ao enviar mensagem ao suporte:", error);
      toast.error("Não foi possível enviar a mensagem.");
    } else {
      setMessage("");
      toast.success("Mensagem enviada.");
      await loadTicket();
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!ticket || errorMessage) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-black p-6 text-center text-white">
        <h1 className="text-xl font-black">Chamado indisponível</h1>
        <p className="mt-2 text-sm text-zinc-500">{errorMessage || "Chamado não encontrado."}</p>
        <button
          type="button"
          onClick={() => navigate({ to: "/perfil/ajuda" })}
          className="mt-5 rounded-xl bg-primary px-6 py-3 font-black text-black"
        >
          Voltar para ajuda
        </button>
      </div>
    );
  }

  const messages = [...(ticket.support_messages ?? [])]
    .filter((item) => !item.is_internal)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const canReply = ticket.status !== "closed";

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="z-50 flex shrink-0 items-center gap-3 border-b border-zinc-900 bg-black/95 p-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => navigate({ to: "/perfil/ajuda" })}
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar para ajuda"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-black">{ticket.subject}</p>
          <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-primary">
            {statusLabels[ticket.status] ?? ticket.status}
          </p>
        </div>
      </header>

      <main className="flex-1 space-y-3 overflow-y-auto p-4">
        <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-600">
            Mensagem inicial
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {ticket.description}
          </p>
          <p className="mt-3 text-[10px] text-zinc-600">
            {new Date(ticket.created_at).toLocaleString("pt-BR")}
          </p>
        </section>

        {messages.map((item) => {
          const mine = item.sender_user_id === ticket.requester_user_id;
          return (
            <section
              key={item.id}
              className={`max-w-[88%] rounded-2xl border p-4 ${
                mine
                  ? "ml-auto border-primary/20 bg-primary/10"
                  : "mr-auto border-zinc-800 bg-zinc-950"
              }`}
            >
              <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">
                {mine ? "Você" : "Equipe APOIS"}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
                {item.message}
              </p>
              <p className="mt-2 text-[9px] text-zinc-600">
                {new Date(item.created_at).toLocaleString("pt-BR")}
              </p>
            </section>
          );
        })}

        {messages.length === 0 ? (
          <div className="py-5 text-center text-xs text-zinc-600">
            A equipe ainda não adicionou novas mensagens a este chamado.
          </div>
        ) : null}
      </main>

      <footer className="shrink-0 border-t border-zinc-900 bg-black p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {canReply ? (
          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor="support-message">
              Mensagem para o suporte
            </label>
            <textarea
              id="support-message"
              value={message}
              maxLength={3000}
              rows={2}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Escreva sua mensagem..."
              className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={sending || !message.trim()}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-black disabled:opacity-50"
              aria-label="Enviar mensagem"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-900 bg-zinc-950 p-3 text-xs font-bold text-zinc-500">
            <LockKeyhole className="h-4 w-4" />
            Este chamado está fechado para novas mensagens.
          </div>
        )}
      </footer>
    </div>
  );
}
