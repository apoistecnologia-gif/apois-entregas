import { Loader2, LockKeyhole, MessageSquareReply } from "lucide-react";
import { Button } from "@/components/ui/button";

const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

const statusClass: Record<string, string> = {
  open: "bg-amber-500/10 text-amber-300",
  in_progress: "bg-blue-500/10 text-blue-300",
  resolved: "bg-emerald-500/10 text-emerald-300",
  closed: "bg-zinc-800 text-zinc-400",
};

const statusLabel: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em atendimento",
  resolved: "Resolvido",
  closed: "Fechado",
};

export function AdminSupportPanel({
  tickets,
  busy,
  onStatus,
  onReply,
}: {
  tickets: any[];
  busy: string | null;
  onStatus: (ticket: any, status: string) => void | Promise<void>;
  onReply: (ticket: any, internal: boolean) => void | Promise<void>;
}) {
  if (tickets.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950 p-10 text-center">
        <MessageSquareReply className="mx-auto h-9 w-9 text-zinc-700" />
        <p className="mt-3 font-black text-white">Sem chamados</p>
        <p className="mt-1 text-sm text-zinc-500">Nenhum chamado de suporte registrado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tickets.map((ticket) => {
        const ticketBusy = busy === `ticket:${ticket.id}` || busy === `ticket-reply:${ticket.id}`;
        const messages = [...(ticket.support_messages ?? [])].sort(
          (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );

        return (
          <article key={ticket.id} className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black uppercase text-primary">
                    {ticket.category}
                  </span>
                  <span className="text-[10px] font-black uppercase text-zinc-600">
                    {ticket.priority}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${statusClass[ticket.status] ?? "bg-zinc-900 text-zinc-400"}`}
                  >
                    {statusLabel[ticket.status] ?? ticket.status}
                  </span>
                </div>
                <h3 className="mt-2 text-base font-black text-white">{ticket.subject}</h3>
                <p className="mt-2 max-w-4xl text-sm leading-relaxed text-zinc-400">
                  {ticket.description}
                </p>
                <p className="mt-2 text-[10px] text-zinc-600">
                  Aberto em {dateTime(ticket.created_at)} · solicitante {ticket.requester_user_id}
                  {ticket.order_id ? ` · pedido ${ticket.order_id.slice(0, 8)}` : ""}
                  {ticket.delivery_job_id ? ` · entrega ${ticket.delivery_job_id.slice(0, 8)}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {ticket.status !== "closed" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      disabled={ticketBusy}
                      onClick={() => void onReply(ticket, false)}
                    >
                      {busy === `ticket-reply:${ticket.id}` ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <MessageSquareReply className="mr-1 h-4 w-4" />
                      )}
                      Responder
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={ticketBusy}
                      onClick={() => void onReply(ticket, true)}
                      className="border-zinc-800"
                    >
                      <LockKeyhole className="mr-1 h-4 w-4" /> Nota interna
                    </Button>
                  </>
                ) : null}
                {ticket.status === "open" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={ticketBusy}
                    onClick={() => void onStatus(ticket, "in_progress")}
                    className="border-zinc-800"
                  >
                    Em atendimento
                  </Button>
                ) : null}
                {["open", "in_progress"].includes(ticket.status) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={ticketBusy}
                    onClick={() => void onStatus(ticket, "resolved")}
                    className="border-emerald-500/20 text-emerald-300"
                  >
                    Resolver
                  </Button>
                ) : null}
                {ticket.status === "resolved" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={ticketBusy}
                    onClick={() => void onStatus(ticket, "closed")}
                    className="border-zinc-800"
                  >
                    Fechar
                  </Button>
                ) : null}
              </div>
            </div>

            <section className="mt-4 rounded-2xl border border-zinc-900 bg-black p-3">
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">
                Conversa
              </p>
              {messages.length === 0 ? (
                <p className="py-3 text-center text-xs text-zinc-600">
                  Ainda não há mensagens adicionais neste chamado.
                </p>
              ) : (
                <div className="space-y-2">
                  {messages.map((message: any) => {
                    const fromRequester = message.sender_user_id === ticket.requester_user_id;
                    return (
                      <div
                        key={message.id}
                        className={`rounded-xl border p-3 ${
                          message.is_internal
                            ? "border-amber-500/20 bg-amber-500/5"
                            : fromRequester
                              ? "border-zinc-900 bg-zinc-950"
                              : "border-primary/15 bg-primary/5"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase text-zinc-400">
                              {message.is_internal
                                ? "Nota interna"
                                : fromRequester
                                  ? "Cliente"
                                  : "Equipe APOIS"}
                            </span>
                            {message.is_internal ? (
                              <LockKeyhole className="h-3 w-3 text-amber-300" />
                            ) : null}
                          </div>
                          <span className="text-[9px] text-zinc-600">
                            {dateTime(message.created_at)}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                          {message.message}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </article>
        );
      })}
    </div>
  );
}
