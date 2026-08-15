# APOIS ENTREGAS

Ecossistema de delivery da APOIS com quatro produtos isolados — Cliente, Estabelecimento, Entregador e Administração — integrados ao mesmo backend Supabase.

Projeto Supabase oficial: `sbvhdgyuuperszlsllji` (**APOIS ENTREGA - PRODUÇÃO**).

## Arquitetura

Frontend e aplicações:

- React 19 + TypeScript
- TanStack Start / Router / Query
- Vite 8
- Tailwind CSS 4
- Capacitor 8 para os aplicativos Android
- Google Maps Platform

Backend:

- Supabase Auth
- PostgreSQL
- Row Level Security
- Realtime
- Storage
- RPCs PostgreSQL
- Edge Functions
- pg_net
- Supabase Cron / pg_cron para retentativas operacionais

Produtos:

- **APOIS Cliente** — app mobile do cliente.
- **APOIS Estabelecimento** — painel web do restaurante/loja, modo `merchant`.
- **APOIS Entregador** — app mobile do entregador, modo `courier`.
- **APOIS Administração** — painel web administrativo, modo `admin`.

A separação dos produtos é aplicada pelo build e pelo roteamento; um produto não deve expor a navegação operacional de outro.

## Instalação

```sh
git clone https://github.com/franciel046631/apois-entregas.git
cd apois-entregas
cp .env.example .env
bun install --frozen-lockfile
bun run dev
```

## Variáveis de ambiente

Use `.env.example` como referência. Valores públicos do frontend usam somente chaves publicáveis/restritas:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_GOOGLE_MAPS_BROWSER_KEY=
VITE_GOOGLE_MAPS_MAP_ID=
VITE_APOIS_PRODUCT_MODE=customer
```

Nunca exponha `service_role`, token de pagamento, segredo de webhook, chave privada Firebase ou credencial server-side em variáveis `VITE_*`.

### Google Maps

- `VITE_GOOGLE_MAPS_BROWSER_KEY`: chave de navegador/Android conforme o produto, com restrições apropriadas.
- `VITE_GOOGLE_MAPS_MAP_ID`: Map ID usado pela interface.
- `GOOGLE_MAPS_API_KEY`: chave server-side para geocodificação/serviços protegidos, nunca enviada ao navegador.

### OpenPix / Woovi

O provedor atual de pagamento de pedidos é **OpenPix**, selecionado em `platform_settings.order_payment_provider`.

```text
OPENPIX_ENVIRONMENT=sandbox
OPENPIX_APP_ID_SANDBOX=
OPENPIX_APP_ID_PRODUCTION=
OPENPIX_WEBHOOK_SECRET_SANDBOX=
OPENPIX_WEBHOOK_SECRET_PRODUCTION=
```

O ambiente oficial continua em `sandbox` enquanto a homologação/produção não for liberada. Não alterar para produção sem credenciais e webhook reais.

### Firebase / chamadas nativas do Entregador

O Entregador possui arquitetura nativa de push baseada em Capacitor Push Notifications + Firebase Cloud Messaging HTTP v1.

Secrets server-side da Edge Function `dispatch-push-outbox`:

```text
PUSH_DISPATCH_WEBHOOK_SECRET=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

Secret do GitHub Actions para empacotar o Android do entregador:

```text
FIREBASE_COURIER_GOOGLE_SERVICES_JSON_BASE64=
```

Esse valor é o `google-services.json` do Firebase, codificado em base64 e registrado especificamente para o package Android `br.com.apois.entregador`.

O build Android do Entregador falha de propósito se a configuração Firebase obrigatória estiver ausente. Não publique APK do Entregador sem esse gate.

## Banco e migrations

Migrations rastreáveis ficam em `supabase/migrations/`. Mudanças estruturais, policies, índices, constraints e RPCs devem ser representadas por migration.

```sh
supabase db push
```

Antes de qualquer push, confirme o project ref `sbvhdgyuuperszlsllji`.

### Regras críticas auditadas

- RLS nas tabelas públicas sensíveis.
- Usuário comum não pode executar ações administrativas.
- Cliente não lê perfil/pedido de outro cliente.
- Frontend não consegue marcar pagamento como pago diretamente.
- Frontend não consegue atribuir entregador diretamente.
- Aceite da oferta do entregador é atômico.
- Uma entrega ativa por entregador é protegida pelo banco.
- Transições inválidas de entrega são bloqueadas no backend.
- Entrega exige PIN seguro para conclusão.
- Liquidação financeira é idempotente.
- Carteiras de estabelecimento, entregador e plataforma são isoladas.
- Documentos de entregador/estabelecimento e anexos de suporte ficam em buckets privados.
- Endereço exato do cliente permanece protegido antes do aceite da oferta.
- Entregador somente recebe oferta dentro do raio operacional configurado.
- Localização do estabelecimento é confirmada atomicamente com endereço, cidade e coordenadas.
- Ponto do estabelecimento deve cair dentro da área de atendimento configurada no backend.

## Geolocalização e despacho

Para delivery operar:

1. o estabelecimento precisa pertencer a uma cidade ativa;
2. precisa possuir endereço e ponto físico confirmados pelo mapa;
3. o ponto precisa estar dentro de zona/raio ativo de atendimento;
4. o entregador precisa estar aprovado, ativo e online;
5. a localização do entregador precisa ser recente;
6. o entregador precisa estar dentro do raio de busca da coleta;
7. o backend cria ofertas, nunca o frontend atribui o entregador diretamente.

O despacho falha fechado quando a geografia necessária não está configurada.

## Pagamentos

O fluxo de pedido PIX usa OpenPix no estado atual.

A fonte de verdade do pagamento é backend/gateway/webhook. O frontend nunca transforma um pagamento pendente em pago por decisão própria.

Em `sandbox`, o provedor pode simular/confirmar cobranças automaticamente durante testes. Isso não equivale a um pagamento real de produção.

O projeto ainda preserva código legado/auxiliar do Mercado Pago para fluxos que não foram removidos, mas o pagamento de **pedidos** é selecionado atualmente por `order_payment_provider=openpix`.

## Financeiro

O backend calcula e persiste valores financeiros; não confia no navegador para subtotal, taxas, comissão, ganho do entregador ou repasse.

A liquidação de pedidos entregues usa chaves idempotentes e foi validada contra repetição. Saques usam reserva de saldo e controles contra duplicidade; payout externo só deve ser ativado com provedor/credencial real.

## Notificações e push

A camada de notificações persiste eventos na tabela `notifications`.

Para chamadas nativas:

1. o Android registra o token FCM em `push_devices`;
2. uma notificação elegível entra em `notification_push_outbox`;
3. o banco chama `dispatch-push-outbox` via pg_net;
4. a Edge Function envia FCM HTTP v1;
5. falhas temporárias permanecem no outbox;
6. um cron server-side reativa pendências periodicamente;
7. token FCM inválido é desativado.

O Entregador nativo não deve ficar online sem permissão/registro de notificações funcionando.

## Edge Functions

As funções versionadas ficam em `supabase/functions/`.

Exemplos principais:

```sh
supabase functions deploy create-order
supabase functions deploy create-pix-charge
supabase functions deploy sync-payment-status
supabase functions deploy openpix-webhook --no-verify-jwt
supabase functions deploy process-refund
supabase functions deploy dispatch-push-outbox --no-verify-jwt
```

`dispatch-push-outbox` não usa JWT Supabase porque é chamada internamente pelo banco; ela exige um segredo dedicado no header `x-apois-push-dispatch-key`. O repositório audita explicitamente esse contrato.

Endpoints históricos de homologação que permanecem publicados devem retornar `410` quando aposentados. Não reutilize endpoints de teste como integração produtiva.

## Storage

Buckets sensíveis auditados como privados incluem:

- `courier-documents`
- `merchant-documents`
- `support-attachments`

As policies restringem acesso por usuário, participação, estabelecimento ou função administrativa conforme o recurso.

## Testes e gates

Pipeline mínimo:

```sh
bun install --frozen-lockfile
bun run audit:repo
bun run format:check
bun run typecheck
bun run test
bun run lint
bun run build:customer
bun run build:merchant
bun run build:courier
bun run build:admin
```

O CI executa verificação do repositório e builds isolados dos quatro produtos. Um build verde é necessário, mas não é suficiente para declarar o sistema pronto: backend, banco, autorização, integrações e E2E também precisam estar validados.

## Android

Package IDs oficiais:

```text
Cliente:     br.com.apois.cliente
Entregador:  br.com.apois.entregador
```

O workflow `.github/workflows/mobile-android.yml` valida package, permissões, assinatura e artefatos.

Para o Entregador ele também exige:

- assinatura de release;
- Firebase `google-services.json` correto;
- plugin nativo de push presente;
- `POST_NOTIFICATIONS`;
- `VIBRATE`;
- ausência de `ACCESS_BACKGROUND_LOCATION` e `MANAGE_EXTERNAL_STORAGE`.

Não gerar/distribuir um APK do Entregador como candidato de homologação enquanto esses gates não estiverem completos.

## Painéis web

O painel do Estabelecimento possui workflow dedicado `.github/workflows/merchant-web-build.yml` e deploy Vercel de produção. O painel Admin deve permanecer separado do Cliente e do Entregador.

## Segurança

- negar por padrão e liberar somente o necessário via RLS/GRANT;
- nenhuma `service_role` no navegador;
- funções críticas validam autenticação/autorização no backend;
- pagamentos e webhooks são idempotentes;
- mudanças financeiras e de estado não dependem do frontend;
- buckets privados permanecem privados;
- funções `SECURITY DEFINER` usam `search_path` controlado;
- helpers internos/trigger-only não devem ficar executáveis publicamente;
- configuração de cidade/zona/localização é validada no banco.

## Estado de homologação / bloqueios reais

O código não deve mascarar os seguintes bloqueios externos/operacionais:

1. **OpenPix está em sandbox.** Produção depende de credenciais/liberação real do provedor.
2. **Firebase Android do Entregador ainda precisa ser configurado no GitHub** via `FIREBASE_COURIER_GOOGLE_SERVICES_JSON_BASE64`.
3. **Secrets Firebase/dispatcher precisam existir no Supabase Edge Runtime**: `PUSH_DISPATCH_WEBHOOK_SECRET`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
4. **A cobertura ativa de Petrolina ainda é uma zona temporária de homologação**, atualmente restrita; cobertura comercial definitiva precisa ser definida antes do go-live.
5. **O estabelecimento de homologação deve confirmar o ponto físico real no mapa** depois que a geografia de produção estiver correta. Sem ponto validado, o backend o mantém impedido de receber novos pedidos de delivery.
6. **Leaked Password Protection** deve ser verificado/ativado no Supabase Auth antes do go-live.
7. Payout externo precisa de provedor e credenciais reais antes de qualquer automação financeira externa.

## Critério de go-live

Não declarar o APOIS ENTREGAS pronto apenas porque compila ou gera APK.

Go-live exige, no mesmo estado aprovado:

- CI verde;
- migrations aplicadas;
- Edge Functions e secrets corretos;
- pagamento em ambiente de produção;
- cobertura/geografia de produção;
- Cliente → pedido → pagamento → Estabelecimento → preparo → Entregador → coleta → PIN → entrega → liquidação → avaliação;
- teste de chamada do Entregador com app em primeiro plano, segundo plano e tela bloqueada;
- testes de RLS/autorização e concorrência;
- painéis web publicados no commit auditado;
- APK/AAB assinados do commit auditado.

Somente depois desse fechamento um APK deve ser oferecido para instalação/homologação final.
