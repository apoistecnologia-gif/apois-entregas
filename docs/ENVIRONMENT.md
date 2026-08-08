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

O `MERCADO_PAGO_ACCESS_TOKEN` é privado e deve existir somente nas Edge Functions. A cobrança PIX é criada pela Edge Function `create-pix-charge` usando a Orders API e uma chave de idempotência por pedido.

O webhook do Mercado Pago deve apontar para:

```text
https://sbvhdgyuuperszlsllji.supabase.co/functions/v1/mercadopago-webhook
```

Configure notificações do tópico **Order**. A Edge Function `mercadopago-webhook` não exige JWT do aplicativo porque é chamada pelo provedor; em vez disso, valida `x-signature`/`x-request-id` com HMAC-SHA256 usando `MERCADO_PAGO_WEBHOOK_SECRET` e consulta a order diretamente na API do Mercado Pago antes de alterar o estado local.

A antiga integração OpenPix/Woovi permanece apenas no histórico do repositório e não é o gateway ativo.

## Push

A persistência interna de notificações e dispositivos já existe. O provedor externo de push ainda deve ser definido/configurado antes da publicação móvel. O segredo deve ficar somente no backend.

## Mobile / lojas

A publicação final Android/iOS exige credenciais de assinatura e contas das lojas. Elas não pertencem ao Git e devem ficar em secret store/CI.
