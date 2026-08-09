import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ShoppingBag,
  CreditCard,
  User,
  MapPin,
  MessageSquare,
  ChevronRight,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";

type SupportCategory = "orders" | "payments" | "account" | "addresses" | "other";
type SupportTicket = {
  id: string;
  category: SupportCategory;
  subject: string;
  description: string;
  priority: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  created_at: string;
  updated_at: string;
};

const categoryLabels: Record<SupportCategory, string> = {
  orders: "Pedidos",
  payments: "Pagamentos",
  account: "Minha Conta",
  addresses: "Endereços",
  other: "Outro assunto",
};

export const Route = createFileRoute("/perfil/ajuda")({
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
  component: AjudaPage,
  head: () => ({ meta: [{ title: "Ajuda e Suporte | APOIS ENTREGA" }] }),
});

function AjudaPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [category, setCategory] = useState<SupportCategory>("other");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const categories: Array<{
    id: SupportCategory;
    icon: typeof ShoppingBag;
    label: string;
    color: string;
  }> = [
    { id: "orders", icon: ShoppingBag, label: "Pedidos", color: "text-orange-400" },
    { id: "payments", icon: CreditCard, label: "Pagamentos", color: "text-emerald-400" },
    { id: "account", icon: User, label: "Minha Conta", color: "text-blue-400" },
    { id: "addresses", icon: MapPin, label: "Endereços", color: "text-red-400" },
  ];

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    setTicketsError(null);
    const { data, error } = await supabase.functions.invoke("customer-support", {
      body: { action: "list" },
    });

    if (error) {
      console.error("Erro ao carregar chamados:", error);
      setTickets([]);
      setTicketsError("Não foi possível carregar seus chamados agora.");
    } else {
      setTickets(Array.isArray(data?.tickets) ? (data.tickets as SupportTicket[]) : []);
    }
    setLoadingTickets(false);
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const openForm = (nextCategory: SupportCategory) => {
    setCategory(nextCategory);
    setSubject("");
    setDescription("");
    setIsFormOpen(true);
  };

  const createTicket = async () => {
    if (submitting) return;
    if (subject.trim().length < 3) {
      toast.error("Informe um assunto com pelo menos 3 caracteres.");
      return;
    }
    if (description.trim().length < 10) {
      toast.error("Descreva o problema com pelo menos 10 caracteres.");
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("customer-support", {
      body: {
        action: "create",
        category,
        subject: subject.trim(),
        description: description.trim(),
        orderId: null,
      },
    });

    if (error || !data?.ticketId) {
      console.error("Erro ao abrir chamado:", error);
      toast.error("Não foi possível abrir o chamado.");
    } else {
      toast.success("Chamado aberto com sucesso.");
      setIsFormOpen(false);
      await loadTickets();
    }
    setSubmitting(false);
  };

  const statusLabel: Record<SupportTicket["status"], string> = {
    open: "Aberto",
    in_progress: "Em atendimento",
    resolved: "Resolvido",
    closed: "Fechado",
  };

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black text-white">
      <header className="z-50 flex shrink-0 items-center justify-between border-b border-zinc-900 bg-black/80 p-4 backdrop-blur-lg">
        <button
          type="button"
          onClick={() => navigate({ to: "/perfil" })}
          className="rounded-full bg-zinc-900 p-2 shadow-lg"
          aria-label="Voltar para o perfil"
        >
          <ArrowLeft className="h-5 w-5 text-zinc-300" />
        </button>
        <h1 className="flex-1 text-center text-xl font-bold text-primary">Ajuda e Suporte</h1>
        <div className="w-9" />
      </header>

      <main className="scrollbar-none flex-1 space-y-8 overflow-y-auto p-6">
        <section className="grid grid-cols-2 gap-3">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openForm(item.id)}
              className="flex flex-col items-center gap-3 rounded-3xl border border-zinc-900/50 bg-zinc-900/40 p-4 transition-all active:scale-95"
            >
              <div className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-3 ${item.color}`}>
                <item.icon className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold text-zinc-300">{item.label}</span>
            </button>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="ml-1 text-xs font-bold uppercase tracking-widest text-primary">
            Perguntas Frequentes
          </h2>
          <Accordion type="single" collapsible className="space-y-3">
            <AccordionItem value="item-1" className="overflow-hidden rounded-2xl border-zinc-900 bg-zinc-900/20 px-4">
              <AccordionTrigger className="py-4 text-sm font-medium text-zinc-200 hover:no-underline">Como acompanho meu pedido?</AccordionTrigger>
              <AccordionContent className="pb-4 text-xs leading-relaxed text-zinc-500">Você acompanha o status em tempo real na aba Pedidos e recebe as atualizações operacionais permitidas pelas suas preferências.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2" className="overflow-hidden rounded-2xl border-zinc-900 bg-zinc-900/20 px-4">
              <AccordionTrigger className="py-4 text-sm font-medium text-zinc-200 hover:no-underline">Qual forma de pagamento está disponível?</AccordionTrigger>
              <AccordionContent className="pb-4 text-xs leading-relaxed text-zinc-500">O checkout atual utiliza PIX. Outras formas só aparecerão quando estiverem efetivamente habilitadas pela plataforma.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3" className="overflow-hidden rounded-2xl border-zinc-900 bg-zinc-900/20 px-4">
              <AccordionTrigger className="py-4 text-sm font-medium text-zinc-200 hover:no-underline">Como altero meu endereço?</AccordionTrigger>
              <AccordionContent className="pb-4 text-xs leading-relaxed text-zinc-500">Vá em Perfil &gt; Meus Endereços. Lá você pode adicionar, editar, excluir e definir o endereço padrão.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="ml-1 text-xs font-bold uppercase tracking-widest text-primary">Meus chamados</h2>
            <button type="button" onClick={() => openForm("other")} className="flex items-center gap-1 text-xs font-bold text-primary"><Plus className="h-4 w-4" />Novo</button>
          </div>

          {loadingTickets ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin text-primary" />Carregando chamados...</div>
          ) : ticketsError ? (
            <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">{ticketsError}</div>
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 text-center text-sm text-zinc-500">Você ainda não abriu nenhum chamado.</div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="rounded-2xl border border-zinc-900 bg-zinc-950 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-sm font-bold text-zinc-200">{ticket.subject}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-600">{categoryLabels[ticket.category]} • {new Date(ticket.created_at).toLocaleDateString("pt-BR")}</p></div>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">{statusLabel[ticket.status] ?? ticket.status}</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-zinc-500">{ticket.description}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="pt-2">
          <button type="button" onClick={() => openForm("other")} className="flex w-full items-center justify-between rounded-3xl bg-primary p-5 font-bold text-black transition-all active:scale-[0.98]">
            <div className="flex items-center gap-4"><div className="rounded-2xl bg-black/10 p-2.5"><MessageSquare className="h-6 w-6" /></div><div className="text-left"><p className="text-sm">Falar com suporte</p><p className="text-[10px] opacity-70">Abra um chamado para nossa equipe</p></div></div><ChevronRight className="h-5 w-5 opacity-40" />
          </button>
        </section>
      </main>

      {isFormOpen ? (
        <div className="fixed inset-0 z-[100] flex items-end bg-black/70 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full rounded-t-3xl border border-zinc-800 bg-zinc-950 p-5 sm:max-w-lg sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-primary">Novo chamado</p><h2 className="mt-1 text-lg font-black">{categoryLabels[category]}</h2></div><button type="button" onClick={() => setIsFormOpen(false)} className="rounded-full bg-zinc-900 p-2" aria-label="Fechar formulário"><X className="h-5 w-5" /></button></div>
            <label className="block text-xs font-bold text-zinc-400">Assunto<input value={subject} maxLength={150} onChange={(event) => setSubject(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-zinc-800 bg-black px-4 text-sm text-white outline-none focus:border-primary" placeholder="Resuma o que aconteceu" /></label>
            <label className="mt-4 block text-xs font-bold text-zinc-400">Descrição<textarea value={description} maxLength={3000} onChange={(event) => setDescription(event.target.value)} className="mt-2 min-h-32 w-full rounded-xl border border-zinc-800 bg-black p-4 text-sm text-white outline-none focus:border-primary" placeholder="Descreva o problema com detalhes" /></label>
            <div className="mt-1 text-right text-[10px] text-zinc-600">{description.length}/3000</div>
            <button type="button" onClick={() => void createTicket()} disabled={submitting || subject.trim().length < 3 || description.trim().length < 10} className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-black uppercase text-black disabled:opacity-50">{submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}{submitting ? "Enviando..." : "Abrir chamado"}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
