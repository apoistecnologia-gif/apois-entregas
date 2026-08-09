import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileText } from "lucide-react";

export const Route = createFileRoute("/termos")({
  component: TermosPage,
  head: () => ({
    meta: [
      { title: "Termos de Uso | APOIS ENTREGA" },
      {
        name: "description",
        content: "Termos de Uso da plataforma APOIS ENTREGA.",
      },
    ],
  }),
});

const sections = [
  {
    title: "1. Sobre a plataforma",
    paragraphs: [
      "O APOIS ENTREGA é uma plataforma de tecnologia que aproxima clientes, estabelecimentos parceiros e entregadores independentes para viabilizar pedidos, pagamentos, acompanhamento e entrega de produtos.",
      "Ao criar uma conta ou utilizar os serviços, você declara que leu e aceita estes Termos, além da Política de Privacidade vigente.",
    ],
  },
  {
    title: "2. Conta e segurança",
    paragraphs: [
      "Você deve fornecer informações verdadeiras, manter seus dados atualizados e proteger sua senha e seus códigos de confirmação. A conta é pessoal e não deve ser compartilhada para contornar regras de segurança, bloqueios ou verificações.",
      "A plataforma pode limitar ou bloquear funcionalidades quando houver risco de fraude, violação destes Termos, obrigação legal, solicitação de autoridade competente ou necessidade de proteger clientes, parceiros, entregadores e a própria operação.",
    ],
  },
  {
    title: "3. Pedidos, preços e disponibilidade",
    paragraphs: [
      "Produtos, preços, estoque, horários, pedido mínimo, prazo estimado e taxa de entrega são exibidos conforme os dados vigentes no momento do pedido. A disponibilidade pode mudar até a confirmação operacional do estabelecimento.",
      "Antes de finalizar, o cliente deve revisar itens, adicionais, endereço, observações, valores e demais informações apresentadas no checkout.",
    ],
  },
  {
    title: "4. Pagamento",
    paragraphs: [
      "O checkout atualmente habilitado utiliza PIX por meio do provedor de pagamento integrado. Um pedido somente deve ser tratado como pago após a confirmação eletrônica do provedor recebida e validada pela plataforma.",
      "A eventual disponibilização de outras formas de pagamento será informada na própria interface quando estiver efetivamente habilitada.",
    ],
  },
  {
    title: "5. Cancelamentos e estornos",
    paragraphs: [
      "Pedidos podem ter regras diferentes de cancelamento conforme a etapa operacional. Quando um pedido pago for cancelado em hipótese que gere devolução, o estorno seguirá o fluxo do provedor de pagamento e ficará registrado no histórico financeiro da plataforma.",
      "A plataforma não considera uma devolução concluída apenas pela alteração visual do pedido: o resultado do provedor de pagamento deve ser conciliado antes da confirmação final do estorno.",
    ],
  },
  {
    title: "6. Entrega e confirmação por PIN",
    paragraphs: [
      "Quando houver entrega, o acompanhamento poderá usar a localização do entregador durante a operação. Na etapa final, o cliente poderá receber um PIN de confirmação. O PIN deve ser informado somente ao entregador responsável quando o pedido estiver sendo efetivamente entregue.",
      "Tentativas inválidas de PIN podem ser temporariamente bloqueadas como medida de segurança.",
    ],
  },
  {
    title: "7. Estabelecimentos e entregadores",
    paragraphs: [
      "Estabelecimentos são responsáveis pelas informações do catálogo, preparo, qualidade, disponibilidade e regularidade dos produtos que oferecem. Entregadores atuam na execução logística conforme seu cadastro, aprovação e regras operacionais da plataforma.",
      "O APOIS ENTREGA mantém mecanismos de cadastro, aprovação, suporte, histórico e auditoria para reduzir riscos e permitir o tratamento de ocorrências, sem eliminar as responsabilidades próprias de cada participante da operação.",
    ],
  },
  {
    title: "8. Condutas proibidas",
    paragraphs: [
      "Não é permitido usar a plataforma para fraude, falsidade cadastral, abuso, assédio, violação de direitos, manipulação de pagamentos, exploração de falhas, interferência no serviço ou qualquer finalidade ilícita.",
      "Também é proibido tentar acessar dados, contas, pedidos, documentos, carteiras ou áreas administrativas de terceiros sem autorização.",
    ],
  },
  {
    title: "9. Suporte, avaliações e registros",
    paragraphs: [
      "Clientes, estabelecimentos e entregadores podem utilizar os canais internos de suporte para relatar problemas. Mensagens e registros operacionais relacionados ao atendimento podem ser mantidos para solução do caso, prevenção a fraudes, auditoria e exercício regular de direitos.",
      "Avaliações devem refletir experiências reais e não podem conter conteúdo ilícito, ofensivo, fraudulento ou destinado a manipular a reputação de terceiros.",
    ],
  },
  {
    title: "10. Privacidade e legislação aplicável",
    paragraphs: [
      "O tratamento de dados pessoais é descrito na Política de Privacidade e deve observar a legislação brasileira aplicável, incluindo a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018), o Marco Civil da Internet (Lei nº 12.965/2014) e, quando aplicável, as normas de proteção e defesa do consumidor.",
      "Nenhuma disposição destes Termos pretende afastar direitos que sejam inderrogáveis pela legislação aplicável.",
    ],
  },
  {
    title: "11. Alterações e vigência",
    paragraphs: [
      "Estes Termos podem ser atualizados para refletir mudanças legais, de segurança, operação ou funcionalidades. Quando uma alteração exigir nova ciência ou consentimento, a plataforma poderá solicitar uma nova confirmação.",
      "Versão operacional: 09 de agosto de 2026. Para dúvidas ou solicitações, utilize Ajuda e Suporte dentro da plataforma.",
    ],
  },
];

function TermosPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-zinc-900 bg-black/90 p-4 backdrop-blur">
        <button
          type="button"
          onClick={() => window.history.length > 1 ? window.history.back() : navigate({ to: "/" })}
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">APOIS ENTREGA</p>
          <h1 className="font-black">Termos de Uso</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 p-5 pb-12">
        <section className="rounded-3xl border border-primary/20 bg-primary/5 p-5">
          <FileText className="h-7 w-7 text-primary" />
          <h2 className="mt-3 text-xl font-black">Regras para utilização da plataforma</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Este documento descreve as condições operacionais aplicáveis aos serviços digitais do APOIS ENTREGA.
          </p>
        </section>

        {sections.map((section) => (
          <section key={section.title} className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
            <h2 className="font-black text-primary">{section.title}</h2>
            <div className="mt-3 space-y-3 text-sm leading-6 text-zinc-400">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
