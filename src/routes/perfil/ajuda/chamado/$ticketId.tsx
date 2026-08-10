import { createFileRoute, redirect, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, FileText, Loader2, LockKeyhole, Paperclip, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SUPPORT_BUCKET = "support-attachments";
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

type SupportMessage = {
  id: string;
  sender_user_id: string;
  message: string;
  attachment_paths?: string[] | null;
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

function safeFileName(name: string) {
  const sanitized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120);
  return sanitized || "anexo";
}

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [openingAttachment, setOpeningAttachment] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadTicket = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      setErrorMessage(null);
      const { data, error } = await supabase.functions.invoke("customer-support", {
        body: { action: "list" },
      });

      if (error) {
        console.error("Erro ao carregar chamado:", error);
        if (showLoading) {
          setTicket(null);
          setErrorMessage("Não foi possível carregar este chamado agora.");
        }
        setLoading(false);
        return;
      }

      const tickets = Array.isArray(data?.tickets) ? (data.tickets as SupportTicket[]) : [];
      const found = tickets.find((item) => item.id === ticketId) ?? null;
      setTicket(found);
      if (!found) setErrorMessage("Chamado não encontrado.");
      setLoading(false);
    },
    [ticketId],
  );

  useEffect(() => {
    void loadTicket();
  }, [loadTicket]);

  useEffect(() => {
    const channel = supabase
      .channel(`customer_support_${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_messages",
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => void loadTicket(false),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_tickets",
          filter: `id=eq.${ticketId}`,
        },
        () => void loadTicket(false),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadTicket, ticketId]);

  const selectAttachments = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files);
    const accepted: File[] = [];

    for (const file of incoming) {
      if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
        toast.error(`${file.name}: envie JPG, PNG, WEBP ou PDF.`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name}: o limite por arquivo é 15 MB.`);
        continue;
      }
      accepted.push(file);
    }

    setAttachments((current) => {
      const remaining = Math.max(0, MAX_ATTACHMENTS - current.length);
      if (accepted.length > remaining) {
        toast.error(`Você pode enviar no máximo ${MAX_ATTACHMENTS} anexos por mensagem.`);
      }
      return [...current, ...accepted.slice(0, remaining)];
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openAttachment = async (path: string) => {
    if (openingAttachment) return;
    setOpeningAttachment(path);
    const { data, error } = await supabase.storage.from(SUPPORT_BUCKET).createSignedUrl(path, 60);
    setOpeningAttachment(null);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir este anexo.");
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = data.signedUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.click();
  };

  const sendMessage = async () => {
    const trimmed = message.trim();
    if (!ticket || sending || (!trimmed && attachments.length === 0)) return;
    if (ticket.status === "closed" || ticket.status === "resolved") {
      toast.info("Este chamado não aceita novas mensagens.");
      return;
    }
    if (trimmed.length > 3000) {
      toast.error("A mensagem pode ter no máximo 3.000 caracteres.");
      return;
    }

    setSending(true);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      setSending(false);
      toast.error("Sua sessão expirou. Entre novamente.");
      return;
    }

    const uploadedPaths: string[] = [];
    for (const file of attachments) {
      const path = `${user.id}/${ticket.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error } = await supabase.storage.from(SUPPORT_BUCKET).upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (error) {
        if (uploadedPaths.length > 0) {
          await supabase.storage.from(SUPPORT_BUCKET).remove(uploadedPaths);
        }
        setSending(false);
        toast.error(`Não foi possível enviar ${file.name}.`);
        return;
      }
      uploadedPaths.push(path);
    }

    const { error } = await supabase.functions.invoke("customer-support", {
      body: {
        action: "message",
        ticketId: ticket.id,
        message: trimmed,
        attachmentPaths: uploadedPaths,
      },
    });

    if (error) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(SUPPORT_BUCKET).remove(uploadedPaths);
      }
      console.error("Erro ao enviar mensagem ao suporte:", error);
      toast.error("Não foi possível enviar a mensagem.");
    } else {
      setMessage("");
      setAttachments([]);
      toast.success("Mensagem enviada.");
      await loadTicket(false);
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
  const canReply = ticket.status === "open" || ticket.status === "in_progress";

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
          const paths = Array.isArray(item.attachment_paths) ? item.attachment_paths : [];
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
              {paths.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {paths.map((path, index) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => void openAttachment(path)}
                      disabled={openingAttachment === path}
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-black/40 px-3 py-2 text-xs font-bold text-zinc-300 disabled:opacity-50"
                    >
                      {openingAttachment === path ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4 text-primary" />
                      )}
                      Anexo {index + 1}
                    </button>
                  ))}
                </div>
              ) : null}
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
          <div className="space-y-2">
            {attachments.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {attachments.map((file, index) => (
                  <span
                    key={`${file.name}-${file.size}-${index}`}
                    className="inline-flex max-w-full items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] text-zinc-400"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="max-w-44 truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      className="text-zinc-600 hover:text-white"
                      aria-label={`Remover ${file.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(event) => selectAttachments(event.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || attachments.length >= MAX_ATTACHMENTS}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-300 disabled:opacity-40"
                aria-label="Adicionar anexo"
              >
                <Paperclip className="h-5 w-5" />
              </button>
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
                disabled={sending || (!message.trim() && attachments.length === 0)}
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
            <p className="px-1 text-[10px] text-zinc-600">
              Até 4 anexos por mensagem · JPG, PNG, WEBP ou PDF · máximo 15 MB cada.
            </p>
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
