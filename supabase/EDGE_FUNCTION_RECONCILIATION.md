# APOIS ENTREGAS — Reconciliação de Edge Functions

Projeto Supabase oficial: `sbvhdgyuuperszlsllji`.
Revisão: 2026-08-09.

## Estado validado

- `create-order`: JWT obrigatório. Reconciliada com o Git em 2026-08-09 para tratar também `DELIVERY_ADDRESS_UNAVAILABLE` na validação de cobertura.
- `create-pix-charge`: JWT obrigatório. Mercado Pago é o gateway atual. A homologação mantém temporariamente cobrança de R$ 50,00 no ambiente de teste. Não remover esse override até o fechamento da homologação e não usar pagamento real.
- `mercadopago-webhook`: endpoint público do provedor, sem JWT Supabase, mas com validação criptográfica própria da notificação e reconciliação do recurso no Mercado Pago. Eventos são persistidos de forma idempotente.
- `sync-payment-status`: JWT obrigatório. Só reconcilia pedido do usuário autenticado e confirma ID, referência externa e valor diretamente no provedor.
- `process-refund`: JWT obrigatório. Processa apenas refund previamente registrado e vinculado ao pedido/pagamento, com autorização e idempotência.
- `customer-orders`, `customer-favorites`, `customer-notifications` e `customer-support`: continuam ativos nos fluxos do produto.

## Provedor legado

`openpix-webhook` está neutralizada, retorna HTTP 410 e mantém JWT obrigatório. Nenhum fluxo atual do repositório referencia esse endpoint.

## Endpoints temporários neutralizados

Como a manutenção disponível não expunha exclusão física de Edge Function, os slugs abaixo foram redeployados como endpoints inertes, com JWT obrigatório e resposta HTTP 410:

- `apois-pix-auto-homol-8f4c3e9a`;
- `apois-refund-homol-8-7c2f`;
- `mercadopago-credential-diagnostic`.

Eles não devem voltar a conter lógica privilegiada de homologação.

## Fechamento de homologação

Antes da produção definitiva:

1. concluir o ciclo ponta a ponta em sandbox;
2. confirmar webhook, reconciliação e reembolso sem pagamento real;
3. remover cuidadosamente o override temporário de R$ 50,00 de `create-pix-charge`;
4. republicar a função;
5. executar novamente CI e os testes finais;
6. confirmar que endpoints temporários continuam inertes.
