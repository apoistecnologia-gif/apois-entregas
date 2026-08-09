import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/privacidade")({
  component: PrivacidadePage,
  head: () => ({
    meta: [
      { title: "Política de Privacidade | APOIS ENTREGA" },
      {
        name: "description",
        content: "Política de Privacidade e proteção de dados do APOIS ENTREGA.",
      },
    ],
  }),
});

const sections = [
  {
    title: "1. Objetivo e abrangência",
    paragraphs: [
      "Esta Política explica como o APOIS ENTREGA trata dados pessoais de clientes, representantes de estabelecimentos e entregadores que utilizam a plataforma.",
      "O tratamento deve observar a legislação brasileira aplicável, em especial a Lei Geral de Proteção de Dados Pessoais — LGPD (Lei nº 13.709/2018) e o Marco Civil da Internet (Lei nº 12.965/2014).",
    ],
  },
  {
    title: "2. Dados tratados",
    paragraphs: [
      "Conforme o perfil e a funcionalidade utilizada, podem ser tratados dados de cadastro e conta, como nome, e-mail, telefone, data de nascimento, foto de perfil e identificadores internos; endereços e coordenadas informadas para entrega; dados de pedidos, itens, valores, status, avaliações e suporte; registros técnicos e de segurança necessários ao funcionamento da aplicação.",
      "Para estabelecimentos e entregadores, também podem ser tratados dados cadastrais, documentos de habilitação ou regularidade, informações do veículo, dados operacionais, localização durante a atividade, carteira, chave PIX e registros de pagamentos ou saques, de acordo com a funcionalidade utilizada.",
      "Dados completos de cartão não fazem parte do checkout atualmente habilitado. O pagamento disponível na operação atual é PIX processado pelo provedor de pagamento integrado.",
    ],
  },
  {
    title: "3. Localização",
    paragraphs: [
      "A localização pode ser utilizada para selecionar ou validar endereços, calcular rotas e distâncias, estimar entrega, localizar entregadores disponíveis e acompanhar uma entrega em andamento.",
      "A localização do entregador é atualizada durante o período em que ele está online e autorizado a operar. O acesso à geolocalização depende da permissão concedida no dispositivo ou navegador.",
    ],
  },
  {
    title: "4. Finalidades do tratamento",
    paragraphs: [
      "Os dados são utilizados para criar e proteger contas; executar pedidos e entregas; processar e conciliar pagamentos e estornos; prevenir fraude e abuso; atender solicitações de suporte; permitir avaliações; administrar estabelecimentos, entregadores e áreas autorizadas; cumprir obrigações legais e regulatórias; produzir registros de auditoria; exercer direitos em processos ou disputas; e aprimorar segurança e confiabilidade da operação.",
      "Comunicações promocionais e novidades respeitam as preferências registradas pelo usuário quando a funcionalidade estiver habilitada para sua conta.",
    ],
  },
  {
    title: "5. Bases legais",
    paragraphs: [
      "A base legal aplicável depende da finalidade e do contexto do tratamento. Podem ser utilizadas, conforme o caso, execução de contrato ou procedimentos preliminares relacionados ao serviço solicitado, cumprimento de obrigação legal ou regulatória, exercício regular de direitos, legítimo interesse quando cabível e consentimento quando a legislação o exigir.",
      "O consentimento, quando utilizado como base legal, pode ser revogado pelos meios disponibilizados, sem afetar tratamentos anteriores legitimamente realizados e sem impedir conservações autorizadas por lei.",
    ],
  },
  {
    title: "6. Compartilhamento e operadores",
    paragraphs: [
      "Os dados podem ser compartilhados na medida necessária para a execução do serviço entre cliente, estabelecimento e entregador responsável pela operação. A plataforma também utiliza fornecedores de infraestrutura e serviços tecnológicos, como hospedagem e banco de dados Supabase, mapas e geolocalização Google Maps e processamento de PIX Mercado Pago, dentro da finalidade de cada integração.",
      "Também pode haver compartilhamento quando necessário para cumprir obrigação legal, ordem de autoridade competente, prevenção de fraude, proteção de direitos ou resposta a incidentes de segurança.",
    ],
  },
  {
    title: "7. Segurança",
    paragraphs: [
      "A plataforma adota controles de autenticação, autorização por perfil, políticas de acesso no banco de dados, armazenamento privado para documentos sensíveis, trilhas de auditoria, validação de transições operacionais e mecanismos de idempotência e conciliação para operações financeiras.",
      "Nenhum sistema é completamente imune a incidentes. Caso seja identificado um evento de segurança relevante, serão adotadas medidas de contenção, investigação e comunicação compatíveis com a legislação e com a natureza do incidente.",
    ],
  },
  {
    title: "8. Retenção e eliminação",
    paragraphs: [
      "Os dados são mantidos pelo tempo necessário para as finalidades informadas e podem permanecer armazenados quando houver obrigação legal ou regulatória, necessidade de prevenção a fraude, segurança, auditoria, solução de disputas ou exercício regular de direitos.",
      "A desativação da conta interrompe o acesso e as novas operações da conta, mas não implica apagamento automático de registros que devam ser conservados legitimamente. Solicitações relacionadas a eliminação ou outros direitos podem ser encaminhadas pelo suporte.",
    ],
  },
  {
    title: "9. Direitos do titular",
    paragraphs: [
      "Nos termos da LGPD, o titular pode solicitar, conforme aplicável, confirmação da existência de tratamento, acesso, correção de dados incompletos ou desatualizados, informações sobre compartilhamento, anonimização, bloqueio ou eliminação nas hipóteses legais, portabilidade quando regulamentada e cabível, revogação do consentimento e revisão ou explicação de decisões automatizadas que afetem seus interesses.",
      "O exercício de direitos pode exigir verificação de identidade para proteger a conta e os dados contra pedidos fraudulentos. Algumas solicitações podem não resultar em eliminação imediata quando houver fundamento legal para conservação.",
    ],
  },
  {
    title: "10. Como exercer seus direitos",
    paragraphs: [
      "O canal operacional disponível é Ajuda e Suporte dentro da plataforma. O pedido deve identificar de forma suficiente a conta e o direito que se pretende exercer. O atendimento poderá solicitar informações adicionais estritamente necessárias para confirmar a identidade do titular.",
      "Caso um direito não seja atendido de forma satisfatória, o titular pode utilizar os mecanismos previstos na legislação, inclusive os canais da Autoridade Nacional de Proteção de Dados — ANPD e, quando aplicável, os órgãos de defesa do consumidor.",
    ],
  },
  {
    title: "11. Atualizações desta Política",
    paragraphs: [
      "Esta Política pode ser atualizada para refletir mudanças na plataforma, fornecedores, práticas de segurança ou requisitos legais. Alterações relevantes poderão ser comunicadas na própria aplicação e, quando necessário, submetidas a nova ciência ou consentimento.",
      "Versão operacional: 09 de agosto de 2026. A identificação societária completa do controlador e o contato institucional de privacidade deverão acompanhar a publicação comercial definitiva da plataforma.",
    ],
  },
];

function PrivacidadePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-zinc-900 bg-black/90 p-4 backdrop-blur">
        <button
          type="button"
          onClick={() =>
            window.history.length > 1 ? window.history.back() : navigate({ to: "/" })
          }
          className="rounded-full bg-zinc-900 p-2"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
            APOIS ENTREGA
          </p>
          <h1 className="font-black">Política de Privacidade</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 p-5 pb-12">
        <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <ShieldCheck className="h-7 w-7 text-emerald-400" />
          <h2 className="mt-3 text-xl font-black">Privacidade e proteção de dados</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Transparência sobre quais dados são usados, por que são necessários e quais direitos
            você pode exercer.
          </p>
        </section>

        {sections.map((section) => (
          <section
            key={section.title}
            className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5"
          >
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
