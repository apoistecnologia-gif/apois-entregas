# APOIS Entregas — prontidão do despacho de estabelecimentos (27/10/2026)

## Diagnóstico comprovado (produção `ptgkwyyolrdgnqketkjj`)

- As funções `merchant_request_courier`, `ensure_delivery_job`, `dispatch_delivery_job_offers`, `get_courier_incoming_offers`, `accept_delivery_offer` e a geração de notificações existem.
- Há 2 entregadores aprovados. Um foi identificado como online com GPS recente e push Android cadastrado; estar online não elimina a verificação de distância até a loja.
- A cidade de Petrolina está ativa, mas `cities.courier_dispatch_radius_km IS NULL`. O despacho bloqueia quando esse valor não é positivo.
- A cidade de Itainópolis possui raio de busca explicitamente configurado, mas seus estabelecimentos de teste estavam com entrega desabilitada e/ou sem coordenadas adequadas.
- O estabelecimento de entregas de Petrolina tinha assinatura encerrada em 10/09/2026, sem evidência de novo período aprovado. A função `merchant_subscription_in_good_standing` bloqueia novos pedidos.
- `merchant_order_payment_provider` aponta para `safe2pay_marketplace`, mas `safe2pay_provider_enabled=false`; cobrança deve permanecer desabilitada até homologação de credenciais e recebedores.
- `courier_payout_mode=merchant_manual`: repasse do estabelecimento ao entregador permanece manual, sem promessa de transferência automatizada.
- A oferta histórica registrada expirou. A existência de código e eventos históricos **não é prova** de entrega ponta a ponta concluída.

## Alterações de código na branch isolada

- `AdminCoveragePanel`: aviso explícito para cidades ativas sem raio de despacho, com acesso direto à edição autenticada.
- `AdminCourierOperationalGates`: leitura pelas RLS administrativas das flags do provedor e dos períodos de assinatura; não cria cobrança, estende mensalidade ou escreve configuração.
- Utilitários e testes de prontidão asseguram que não se copie o raio de entrega do cliente para o raio de coleta nem se considere uma competência mensal vencida como vigente.

## Ações que dependem de dados comerciais reais

1. Administrador escolhe **explicitamente** o raio de busca do entregador para Petrolina e salva pelo painel Cobertura, sem confundir com o raio de entrega do cliente. A alteração fica auditada pelo RPC `admin_update_city`.
2. Estabelecimento quita a mensalidade por meio do provedor oficialmente homologado; o backend deve registrar o novo período confirmado. Não alterar `current_period_end` manualmente.
3. Equipe financeira homologa Safe2Pay com **a conta e o recebedor do estabelecimento real**, chave de produção, webhook e conciliação. Só habilitar `safe2pay_provider_enabled` depois de teste de pagamento/estorno verificado.
4. Usar **um estabelecimento e um entregador aprovado próximos** para homologar uma chamada. Conferir pedido Pix pago, estabelecimento aceitando/preparando, pedido pronto, RPC `merchant_request_courier`, oferta emitida, push entregue, aceite, deslocamento, PIN e entrega finalizada.
5. Validar operações com o app em primeiro plano e em segundo plano, inclusive expiração/recusa e fallback por consulta de ofertas. Conferir também o repasse manual e a ausência de duplo aceite.

## Restrições de segurança

Nenhuma mudança de raio, cobrança, assinatura, segredo, RLS ou produção foi feita por esta alteração. Não gerar APK nem publicar a branch automaticamente. Até a homologação física, manter status **parcial: infraestrutura de chamadas implementada, liberação comercial pendente**.
