# APOIS — Nova tabela comercial e implantação segura
**Definição recebida em:** 03/11/2026. **Atualização comercial confirmada:** 13/11/2026 (Estabelecimento R$ 69,90). **Status:** proposta de comercialização futura; ainda não adotada nos ambientes de produção.

| Categoria | Nova mensalidade | Contexto |
|---|---:|---|
| Motorista — APOIS Corridas | R$ 59,90 | Sem comissão da APOIS por corrida, conforme modelo comercial |
| Entregador — APOIS Entregas | R$ 49,90 | Assinatura de acesso, separada do valor recebido por cada entrega |
| Estabelecimento — APOIS Entregas | R$ 69,90 | Assinatura de acesso, separada dos pagamentos pelos pedidos e fretes |

## Estado confirmado pela auditoria
- **Corridas:** em 03/11/2026 o Supabase de produção possuía `app_settings.finance.driver_monthly_fee_cents = 4990` (R$ 49,90). O novo valor definido é **5990 centavos**, mas este repositório NÃO altera esse banco e a atualização não foi aplicada.
- **Entregas/estabelecimentos:** `merchant-subscription` tinha cobrança fixa de R$ 69,90 e validação de 6.990 centavos. A branch corrigida em 13/11 mantém a oferta em **R$ 69,90** para novas assinaturas, usando o valor `merchant_subscriptions.amount` como referência para cobranças de contratos já existentes; a conciliação de PIX deve comparar com o valor real registrado em cada tentativa, não com um valor global fixo.
- **Entregas/entregadores:** não foi encontrado mecanismo de mensalidade do entregador homologado. **Não iniciar cobrança, renovação nem bloqueio por mensalidade** até haver fluxo próprio de contratação, confirmação de pagamento, período de vigência, suporte, estorno e testes. O fluxo de pagamento **do frete** pelo estabelecimento permanece distinto.
- **Entregas/provedor:** a auditoria encontrou `order_payment_provider = "safe2pay_marketplace"`, `courier_payout_mode = "merchant_manual"` e `mercado_pago_environment = "test"`. Não confundir o gateway dos pedidos, o canal de pagamento da mensalidade do estabelecimento e o repasse do frete.

## Requisitos para assinatura do entregador de R$ 49,90
1. Habilitar a contratação apenas após exibir preço, periodicidade, condições de renovação, meio de pagamento, início da vigência, cancelamento e tratamento de inadimplência.
2. Guardar versão dos termos aceitos e evidência da oferta comercial, com data/hora do servidor.
3. Criar cadastro de assinatura do **entregador**, distinto da assinatura do estabelecimento e do pagamento de cada frete.
4. Criar comprovante e conciliação idempotente por evento de pagamento. Nunca considerar assinatura ativa por mero clique em "pagar" nem por comprovante de PIX enviado pelo usuário sem confirmação adequada.
5. Evitar bloqueios por pagamento ausente quando o gateway estiver indisponível ou a funcionalidade de assinatura não estiver homologada.
6. Exigir autorização e transparência para qualquer renovação automática, se um dia for implantada; não presumir que PIX mensal equivale a débito automático.
7. Preservar eventuais acordos antigos e registros financeiros anteriores sem alteração retroativa.

## Requisitos para mensalidade oficial de R$ 69,90 dos estabelecimentos
- New subscriptions: `NEW_MERCHANT_MONTHLY_AMOUNT = 69.9` na branch corrigida.
- Existing subscriptions: usar `merchant_subscriptions.amount` vigente e, para conciliação histórica, `merchant_subscription_payments.amount` do pagamento real, não um valor fixo de 6.990 centavos.
- Não alterar `supabase/migrations/20260810014000_merchant_monthly_subscriptions.sql` retroativamente. Se necessário, gerar migration **forward-only** somente se o DEFAULT divergir dos R$ 69,90 oficiais antes de ativar o novo checkout.
- Não modificar assinaturas existentes com UPDATE em massa; homologar migração de preço por caso/consentimento contratual, se aplicável.
- Validar os dois modos: `test` e `production`, sem ativar produçao a partir desta branch.

## Corridas
- Elaborar migration forward-only para `finance.driver_monthly_fee_cents = 5990` em ambiente isolado e conferir as interfaces do motorista.
- Conferir se o aplicativo mostra o valor antes do pagamento e se não foram oferecidos outros planos ativos que precisem de negociação.
- Não publicar o preço novo como já vigente nem cobrar valores diferentes das propostas aceitas.

## Evidências e testes necessários antes da publicação
| Teste | Esperado |
|---|---|
| Novo estabelecimento sem assinatura | Criar registro de R$ 69,90 |
| Estabelecimento anterior com assinatura de R$ 69,90 | Valor antigo preservado até alteração válida |
| Criação de PIX de nova assinatura | Payload contém R$ 69,90 |
| PIX histórico de R$ 69,90 | Conciliação compara ao valor de sua própria tentativa |
| PIX diferente do valor registrado | Falha sem ativar assinatura |
| Pagamento duplicado/retry | Não gerar cobranças repetidas |
| Entregador sem módulo de assinatura ativo | Nenhuma cobrança ou bloqueio novo |
| Cadastro e aceite | Exibição e registro de preço e versão contratual vigentes |
| Motorista em ambiente de homologação | Mensalidade de R$ 59,90, sem alteração na produção |
| Cancelamento, estorno e indisponibilidade | Informação clara e regra revisada juridicamente |

Nenhum banco de produção foi modificado nesta alteração de código. Homologar pagamentos e acesso a aplicações antes do deploy.
