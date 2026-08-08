# APOIS ENTREGAS — Ambiente e segredos

Nunca versionar valores reais.

## Frontends

Todas as aplicações web/mobile precisam de:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

App Cliente também usa:

```env
VITE_GOOGLE_MAPS_BROWSER_KEY=
```

A chave do Maps deve ser restrita por domínio/app e API. Não usar chave de servidor no navegador.

## Supabase Edge Functions

Segredos internos fornecidos automaticamente pelo Supabase ou configurados no projeto:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Integração PIX atual — Mercado Pago Checkout Transparente / Orders API:

```env
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=
# opcional; usa https://api.mercadopago.com quando ausente
MERCADO_PAGO_API_URL=
```

O `MERCADO_PAGO_ACCESS_TOKEN` é privado e deve existir somente nas Edge Functions.

### Cobrança PIX

A Edge Function `create-pix-charge`:

- exige JWT válido do cliente;
- confirma que o pedido pertence ao usuário autenticado;
- usa o total calculado no servidor;
- cria uma Order PIX no Mercado Pago;
- envia `X-Idempotency-Key` estável por pedido;
- salva QR Code, copia-e-cola, identificadores do provedor e estado local em `payments`/`payment_transactions`;
- não considera o pagamento quitado apenas porque a API respondeu: somente `processed + accredited` vira `paid`.

### Webhook

Configure o Mercado Pago para enviar notificações do tópico **Order** para:

```text
https://sbvhdgyuuperszlsllji.supabase.co/functions/v1/mercadopago-webhook
```

A Edge Function `mercadopago-webhook` não exige JWT do aplicativo porque é chamada pelo provedor. Ela:

- valida `x-signature` e `x-request-id` com HMAC-SHA256 usando `MERCADO_PAGO_WEBHOOK_SECRET`;
- consulta a Order diretamente no Mercado Pago antes de alterar o banco;
- compara `external_reference`, pedido e valor;
- persiste o evento de forma idempotente;
- concilia `payments`, `orders`, `refunds` e `payment_transactions`.

### Estornos

A Edge Function `process-refund`:

- exige JWT;
- permite somente o cliente dono do pedido/solicitante do estorno ou um administrador;
- processa o estorno total pela Order original do Mercado Pago;
- usa chave de idempotência estável por `refund.id`;
- consulta novamente a Order quando uma tentativa retorna erro, evitando duplicar devoluções;
- mantém o estorno em `pending/processing/failed` quando ainda não há confirmação do provedor;
- somente após confirmação atualiza `refunds`, `payments`, `orders`, histórico do pedido e ledger financeiro.

O cancelamento do cliente tenta `process-refund` automaticamente quando o backend cria um estorno. Se o gateway estiver indisponível, o cancelamento continua registrado e a central administrativa permite tentar o estorno novamente.

A antiga integração OpenPix/Woovi foi retirada do código ativo. A Edge Function antiga em produção responde `410 Gone` e não processa eventos. O histórico do Git continua permitindo restaurar o adaptador futuramente sem reescrever o domínio financeiro.

## Push

A persistência interna de notificações e dispositivos já existe. O provedor externo de push ainda deve ser definido/configurado antes da publicação móvel. O segredo deve ficar somente no backend.

## Mobile / lojas

A publicação final Android/iOS exige credenciais de assinatura e contas das lojas. Elas não pertencem ao Git e devem ficar em secret store/CI.
