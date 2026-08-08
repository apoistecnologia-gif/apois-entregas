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

Integração PIX OpenPix/Woovi:

```env
OPENPIX_APP_ID=
OPENPIX_WEBHOOK_SECRET=
# opcional; usa o endpoint oficial padrão quando ausente
OPENPIX_API_URL=
```

O webhook deve ser configurado no provedor apontando para a Edge Function `openpix-webhook` e enviar o mesmo segredo por `Authorization`, `Authorization: Bearer ...` ou `x-webhook-secret`.

## Push

A persistência interna de notificações e dispositivos já existe. O provedor externo de push ainda deve ser definido/configurado antes da publicação móvel. O segredo deve ficar somente no backend.

## Mobile / lojas

A publicação final Android/iOS exige credenciais de assinatura e contas das lojas. Elas não pertencem ao Git e devem ficar em secret store/CI.
