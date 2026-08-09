import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  HelpCircle,
  ShoppingBag,
  CreditCard,
  User,
  MapPin,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
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
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }
    return { session };
  },
  component: AjudaPage,
});

function AjudaPage() {
  const navigate = useNavigate();

  const categories = [
    { icon: ShoppingBag, label: "Pedidos", color: "text-orange-400" },
    { icon: CreditCard, label: "Pagamentos", color: "text-emerald-400" },
    { icon: User, label: "Minha Conta", color: "text-blue-400" },
    { icon: MapPin, label: "Endereços", color: "text-red-400" },
  ];

  return (
    <div className="flex h-screen w-full flex-col bg-black text-white overflow-hidden relative">
      <header className="shrink-0 z-50 flex items-center justify-between p-4 bg-black/80 backdrop-blur-lg border-b border-zinc-900">
        <button
          onClick={() => navigate({ to: "/perfil" })}
          className="p-2 rounded-full bg-zinc-900 shadow-lg"
        >
          <ArrowLeft className="w-5 h-5 text-zinc-300" />
        </button>
        <h1 className="text-xl font-bold text-primary text-center flex-1">Ajuda e Suporte</h1>
        <div className="w-9" />
      </header>

      <main className="flex-1 overflow-y-auto p-6 scrollbar-none space-y-8">
        {/* Search / Categories */}
        <section className="grid grid-cols-2 gap-3">
          {categories.map((cat, i) => (
            <button
              key={i}
              className="flex flex-col items-center gap-3 p-4 rounded-3xl bg-zinc-900/40 border border-zinc-900/50 active:scale-95 transition-all"
            >
              <div className={`p-3 rounded-2xl bg-zinc-900 border border-zinc-800 ${cat.color}`}>
                <cat.icon className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold text-zinc-300">{cat.label}</span>
            </button>
          ))}
        </section>

        {/* FAQs */}
        <section className="space-y-4">
          <h2 className="text-xs font-bold text-primary uppercase tracking-widest ml-1">
            Perguntas Frequentes
          </h2>
          <Accordion type="single" collapsible className="space-y-3">
            <AccordionItem
              value="item-1"
              className="border-zinc-900 bg-zinc-900/20 rounded-2xl px-4 overflow-hidden"
            >
              <AccordionTrigger className="text-sm font-medium hover:no-underline py-4 text-zinc-200">
                Como acompanho meu pedido?
              </AccordionTrigger>
              <AccordionContent className="text-xs text-zinc-500 leading-relaxed pb-4">
                Você pode acompanhar o status em tempo real na aba "Pedidos". Avisaremos via
                notificação cada mudança de status.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem
              value="item-2"
              className="border-zinc-900 bg-zinc-900/20 rounded-2xl px-4 overflow-hidden"
            >
              <AccordionTrigger className="text-sm font-medium hover:no-underline py-4 text-zinc-200">
                Quais formas de pagamento aceitam?
              </AccordionTrigger>
              <AccordionContent className="text-xs text-zinc-500 leading-relaxed pb-4">
                Aceitamos Pix, Cartões de Crédito/Débito (Visa, Master, Elo) e Dinheiro na entrega.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem
              value="item-3"
              className="border-zinc-900 bg-zinc-900/20 rounded-2xl px-4 overflow-hidden"
            >
              <AccordionTrigger className="text-sm font-medium hover:no-underline py-4 text-zinc-200">
                Como altero meu endereço?
              </AccordionTrigger>
              <AccordionContent className="text-xs text-zinc-500 leading-relaxed pb-4">
                Vá em Perfil &gt; Meus Endereços. Lá você pode adicionar novos, editar ou excluir
                endereços existentes.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Contact Support */}
        <section className="pt-4">
          <button className="w-full flex items-center justify-between p-5 rounded-3xl bg-primary text-black font-bold active:scale-[0.98] transition-all">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-2xl bg-black/10">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-sm">Falar com suporte</p>
                <p className="text-[10px] opacity-70">Estamos online para te ajudar</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 opacity-40" />
          </button>
        </section>
      </main>
    </div>
  );
}
