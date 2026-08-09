# APOIS ENTREGAS

Ecossistema de delivery da APOIS com aplicações de cliente, estabelecimento, entregador e administração integradas ao mesmo backend Supabase.

## Arquitetura

O frontend utiliza React 19, TypeScript, TanStack Start/Router, Vite 8 e Tailwind CSS 4. O backend operacional utiliza Supabase Auth, PostgreSQL, Row Level Security, Realtime, Storage, RPCs e Edge Functions. A integração de pagamento PIX usa Mercado Pago Checkout Transparente / Orders API.

As áreas principais são expostas pelas rotas da aplicação e protegidas por autenticação e autorização no banco/backend:

- Cliente: início, busca, estabelecimento, sacola, checkout, pedidos, perfil, endereços, notificações, suporte e avaliações.
- Estabelecimento: workspace `/merchant` para pedidos, cardápio, operação, financeiro e configurações autorizadas.
- Entregador: workspace `/courier` para disponibilidade, ofertas, ciclo da entrega, ganhos e operação autorizada.
- Administração: workspace `/admin` para operação, parceiros, pedidos, taxas, financeiro, suporte e auditoria autorizada.

## Stack

- Bun
- React 19
- TypeScript
- TanStack Start / TanStack Router / TanStack Query
- Vite 8
- Tailwind CSS 4
- Supabase JS 2
- Supabase Auth, PostgreSQL, RLS, Realtime, Storage e Edge Functions
- Mercado Pago Orders API para PIX
- Google Maps no frontend

## Instalação

```sh
git clone https://github.com/franciel046631/apois-entregas.git
cd apois-entregas
cp .env.example .env
bun install --frozen-lockfile
bun run dev
```

## Ambiente

Variáveis públicas do frontend:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_GOOGLE_MAPS_BROWSER_KEY=
```

Secrets usados apenas no Supabase/servidor:

```text
MERCADO_PAGO_ENVIRONMENT=test
MERCADO_PAGO_API_URL=https://api.mercadopago.com
MERCADO_PAGO_ACCESS_TOKEN_TEST=
MERCADO_PAGO_ACCESS_TOKEN_PRODUCTION=
MERCADO_PAGO_WEBHOOK_SECRET_TEST=
MERCADO_PAGO_WEBHOOK_SECRET_PRODUCTION=
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidos pelo ambiente das Edge Functions. Nunca coloque `service_role`, tokens do Mercado Pago ou webhook secrets em variáveis `VITE_*`, no navegador ou no Git.

## Banco e migrations

As migrations rastreáveis ficam em `supabase/migrations/`. Mudanças estruturais, policies, índices, constraints, RPCs e hardenings devem ser aplicadas por migration, nunca por alterações manuais não versionadas.

Com Supabase CLI conectado ao projeto correto:

```sh
supabase db push
```

Antes de aplicar em produção, confira o project ref e faça backup conforme o procedimento operacional da conta Supabase.

## Edge Functions

As funções versionadas ficam em `supabase/functions/`. Entre os fluxos principais estão criação do pedido, criação/reconciliação do PIX, webhook do Mercado Pago, estorno e APIs autenticadas do cliente.

Exemplo de deploy:

```sh
supabase functions deploy create-order
supabase functions deploy create-pix-charge
supabase functions deploy sync-payment-status
supabase functions deploy process-refund
supabase functions deploy mercadopago-webhook --no-verify-jwt
```

O webhook do Mercado Pago não usa JWT do usuário porque recebe chamadas externas do provedor; ele valida a autenticidade da notificação dentro da própria função. As demais funções sensíveis devem exigir usuário autenticado quando aplicável.

## Pagamentos

Em homologação, `MERCADO_PAGO_ENVIRONMENT=test` seleciona as credenciais de teste e o fluxo PIX de teste. Em produção, configure separadamente as credenciais de produção e altere explicitamente o ambiente para `production`. O frontend nunca confirma pagamento por conta própria: a fonte de verdade é o gateway consultado pelo backend/webhook, com persistência idempotente no banco.

## Verificação local

```sh
bun install --frozen-lockfile
bun run build
bun run typecheck
bun run test
bun run format:check
bun run lint
```

O workflow `.github/workflows/ci.yml` executa o mesmo conjunto de verificações de release a cada push em `main` e em pull requests. Um commit só deve ser promovido para produção depois que esse gate estiver verde.

## Build e preview

```sh
bun run build
bun run preview
```

O build atual é gerado pelo TanStack Start/Nitro. O artefato de implantação deve ser produzido a partir de um commit cujo CI esteja verde.

## Segurança

- RLS é habilitado nas tabelas públicas sensíveis.
- Autorização administrativa, de estabelecimento e de entregador é validada no backend/banco.
- Operações críticas usam RPCs/functions e regras atômicas quando necessário.
- Pagamentos, estornos e webhooks são tratados de forma idempotente.
- `.env` e variantes permanecem ignorados pelo Git; somente `.env.example` é versionado.
- Funções temporárias de diagnóstico não devem expor credenciais e permanecem desativadas fora da homologação.

## Deploy de produção

1. Garanta CI verde no commit que será publicado.
2. Confirme migrations aplicadas e funções na versão esperada.
3. Configure somente no ambiente seguro os secrets de produção.
4. Configure o webhook de produção do Mercado Pago e seu secret correspondente.
5. Defina `MERCADO_PAGO_ENVIRONMENT=production` somente depois das credenciais e webhook de produção estarem prontos.
6. Gere o build do mesmo commit aprovado e publique no host escolhido.
7. Execute o smoke test de autenticação, pedido, pagamento, estabelecimento, entrega e administração.
