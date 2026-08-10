# APOIS ENTREGAS

Ecossistema de delivery da APOIS com cliente, estabelecimento, entregador e administração integrados ao mesmo backend Supabase.

## Arquitetura

O frontend utiliza React 19, TypeScript, TanStack Start/Router, Vite 8 e Tailwind CSS 4. O backend operacional utiliza Supabase Auth, PostgreSQL, Row Level Security, Realtime, Storage, RPCs e Edge Functions. O pagamento PIX utiliza Mercado Pago Checkout Transparente / Orders API.

Projeto Supabase oficial de produção: `sbvhdgyuuperszlsllji`.

As áreas principais são protegidas por autenticação e autorização no banco/backend:

- Cliente: início, busca, estabelecimento, sacola, checkout, pedidos, perfil, endereços, notificações, suporte e avaliações.
- Estabelecimento: workspace `/merchant` com pedidos em tempo real, cardápio, adicionais, horários, promoções, cupons, clientes, avaliações, financeiro, relatórios e configurações.
- Entregador: workspace `/courier` com cadastro/aprovação, disponibilidade, GPS, ofertas, aceite atômico, ciclo da entrega, PIN, rota, histórico, carteira e saque.
- Administração: workspace `/admin` com operação, usuários, parceiros, pedidos, cobertura, taxas, financeiro, suporte, auditoria, configurações e relatórios.

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
- Google Maps Platform diretamente, sem gateway do Lovable

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
VITE_GOOGLE_MAPS_MAP_ID=
```

Secrets usados apenas no Supabase/servidor:

```text
APOIS_SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_MAPS_API_KEY=
MERCADO_PAGO_ENVIRONMENT=test
MERCADO_PAGO_API_URL=https://api.mercadopago.com
MERCADO_PAGO_ACCESS_TOKEN_TEST=
MERCADO_PAGO_ACCESS_TOKEN_PRODUCTION=
MERCADO_PAGO_WEBHOOK_SECRET_TEST=
MERCADO_PAGO_WEBHOOK_SECRET_PRODUCTION=
```

A chave `VITE_GOOGLE_MAPS_BROWSER_KEY` deve ser uma chave de navegador restrita aos domínios oficiais e às APIs necessárias. `GOOGLE_MAPS_API_KEY` é a credencial server-side usada pela busca/geocodificação de endereços e nunca deve ser exposta como `VITE_*`. A aplicação chama a Google Maps Platform diretamente e não depende do connector gateway do Lovable.

`APOIS_SUPABASE_SERVICE_ROLE_KEY` é usada exclusivamente pelo runtime server-side da aplicação em `src/integrations/supabase/client.server.ts`; nunca deve ser enviada ao navegador nem prefixada com `VITE_`. Nas Edge Functions, `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidos pelo ambiente do Supabase. Nunca coloque `service_role`, tokens do Mercado Pago ou webhook secrets em variáveis `VITE_*`, no navegador ou no Git.

## Banco e migrations

As migrations rastreáveis ficam em `supabase/migrations/`. Mudanças estruturais, policies, índices, constraints, RPCs e hardenings devem ser aplicadas por migration, nunca por alteração manual sem rastreabilidade.

Com Supabase CLI conectado ao projeto correto:

```sh
supabase db push
```

Antes de aplicar em produção, confira sempre o project ref e o ambiente alvo.

### Regras críticas implementadas no banco

- RLS nas tabelas públicas sensíveis e autorização por usuário/papel no servidor.
- Criação idempotente de pedidos e pagamentos.
- State machines e validações para transições críticas de pedido/entrega.
- Aceite atômico de oferta pelo entregador.
- Validação server-side de cidade, zona, coordenadas e distância da entrega.
- Coordenadas exatas do estabelecimento obrigatórias para despacho e aprovação operacional.
- Cálculo server-side de taxa de entrega, taxa de serviço, comissão, ganho do entregador, repasse do estabelecimento e receita da plataforma.
- Carteiras e lançamentos financeiros idempotentes.
- Saques com reserva de saldo e proteção contra repetição.
- Estornos, webhooks e conciliação protegidos contra processamento duplicado.
- PIN de confirmação de entrega armazenado fora das leituras públicas do pedido.
- Acesso operacional do estabelecimento condicionado à mensalidade vigente.

## Edge Functions

As funções versionadas ficam em `supabase/functions/`. Entre os fluxos principais estão criação do pedido, criação/reconciliação do PIX, cobrança da mensalidade do estabelecimento, webhook do Mercado Pago, estorno e APIs autenticadas do cliente/suporte.

Exemplo de deploy:

```sh
supabase functions deploy create-order
supabase functions deploy create-pix-charge
supabase functions deploy merchant-subscription
supabase functions deploy sync-payment-status
supabase functions deploy process-refund
supabase functions deploy customer-support
supabase functions deploy mercadopago-webhook --no-verify-jwt
```

O webhook do Mercado Pago não usa JWT do usuário porque recebe chamadas externas do provedor; ele valida a autenticidade da notificação na própria função. Funções de usuário exigem autenticação quando aplicável.

## Pagamentos e financeiro

Em homologação, `MERCADO_PAGO_ENVIRONMENT=test` seleciona as credenciais de teste. Em produção, configure separadamente as credenciais de produção e altere explicitamente o ambiente para `production` somente depois do webhook e dos secrets de produção estarem prontos.

O frontend nunca confirma pagamento por conta própria. A fonte de verdade é o gateway consultado pelo backend/webhook, com persistência idempotente no banco.

A mensalidade do estabelecimento é de **R$ 69,90 por mês**, sem comissão sobre pedidos e sem taxa de serviço para o cliente. O fluxo atual gera um PIX mensal de R$ 69,90 pelo Mercado Pago. O pagamento aprovado abre um período operacional de um mês; quando o período termina sem nova mensalidade paga, os helpers de autorização e a criação de novos pedidos bloqueiam automaticamente o estabelecimento até a regularização. O painel também reconcilia a cobrança com o provedor ao abrir, ao voltar ao foco e enquanto um PIX pendente está na tela.

As regras financeiras podem ser configuradas pelo admin por cidade/estabelecimento. O checkout consulta a taxa de serviço real do backend. A liquidação de pedido entregue calcula e credita as carteiras de estabelecimento, entregador e plataforma sem criar saldo artificial.

O pedido de saque já possui fluxo interno de carteira, reserva, idempotência e liquidação administrativa. A transferência PIX automática para a conta externa do favorecido só deve ser habilitada quando um provedor de payout estiver formalmente escolhido e configurado; não há fallback que finja transferência externa.

## Geolocalização e despacho

- Endereços de entrega precisam de coordenadas válidas para a cotação operacional.
- Estabelecimentos precisam registrar a posição exata da loja antes de operar delivery.
- Entregador aprovado precisa estar online e enviar localização fresca.
- Ao receber a primeira localização fresca, o backend reavalia entregas aguardando entregador.
- Mapas, rotas, autocomplete e geocodificação usam Google Maps Platform diretamente, sem dependência de runtime do Lovable.
- Falha no desenho da rota não altera o estado financeiro ou operacional da entrega.

## Suporte e anexos

Chamados de suporte possuem conversa em tempo real e anexos privados. O bucket `support-attachments` é privado; arquivos são limitados por quantidade/tamanho/tipo, vinculados ao usuário e ao chamado e abertos por URL assinada temporária. O admin também visualiza os anexos autorizados pelo mesmo bucket privado.

## Relatórios

O painel do estabelecimento possui relatórios operacionais e exportação CSV do período permitido. O painel administrativo possui filtros por período e exportação de dados operacionais para auditoria/análise.

## Aplicativos móveis

As experiências de Cliente e Entregador já existem como interfaces mobile-first dentro do projeto e compartilham o backend real. O empacotamento nativo Android/iOS, assinatura, ícones/splash, permissões finais e publicação nas lojas são uma etapa separada de release. Não trate a aplicação web responsiva como APK/AAB/IPA concluído.

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

O build é gerado pelo TanStack Start/Nitro. O artefato de implantação deve ser produzido a partir do mesmo commit aprovado nos gates de release.

## Segurança

- RLS é habilitado nas tabelas públicas sensíveis.
- Autorização administrativa, de estabelecimento e de entregador é validada no backend/banco.
- Operações críticas usam RPCs/functions e transações/locks quando necessário.
- Pagamentos, estornos, saques e webhooks são tratados de forma idempotente.
- Buckets de documentos e suporte são privados; acesso é controlado por policies/URLs assinadas.
- `.env` e variantes permanecem ignorados pelo Git; somente `.env.example` é versionado.
- Nenhuma chave `service_role` ou credencial de gateway deve aparecer no frontend.

### Gate manual do Supabase Auth

Antes do go-live, ative **Leaked Password Protection** no painel do Supabase Auth. Esse ajuste é configuração da conta/plataforma e não deve ser simulado por migration de aplicação.

## Pendências externas para go-live real

Estas pendências não devem ser resolvidas com valores inventados no código:

1. Chaves de produção do Google Maps Platform: chave de navegador restrita, Map ID e chave server-side restrita às APIs utilizadas.
2. Credenciais reais do Mercado Pago (`MERCADO_PAGO_ACCESS_TOKEN_PRODUCTION`) e webhook secret de produção.
3. Alteração explícita para `MERCADO_PAGO_ENVIRONMENT=production` e smoke test PIX real de baixo valor, incluindo a mensalidade do estabelecimento.
4. Provedor/credencial de payout para automatizar a transferência externa dos saques; o ledger e o fluxo interno já estão protegidos.
5. Ativação manual de Leaked Password Protection no Supabase Auth.
6. Caso seja exigido push fora da aplicação, configurar o provedor/credenciais de push antes de habilitar entrega externa; o sistema não inventa um provedor.
7. Homologação física ponta a ponta em aparelhos reais: cliente → pagamento → estabelecimento → entregador → PIN → entrega → liquidação.
8. Empacotamento e assinatura dos aplicativos Cliente e Entregador para Android/iOS, seguido da publicação nas lojas.

## Deploy de produção

1. Garanta CI verde no commit que será publicado.
2. Confirme migrations aplicadas e Edge Functions na versão esperada no projeto `sbvhdgyuuperszlsllji`.
3. Confirme que estabelecimentos ativos de delivery possuem coordenadas reais.
4. Configure somente no ambiente seguro as chaves Google Maps e os demais secrets de produção.
5. Configure o webhook de produção do Mercado Pago e seu secret correspondente.
6. Ative Leaked Password Protection no Supabase Auth.
7. Defina `MERCADO_PAGO_ENVIRONMENT=production` somente depois das credenciais e webhook estarem prontos.
8. Gere o build do mesmo commit aprovado e publique no host escolhido.
9. Execute smoke test de autenticação, pedido, pagamento, mensalidade, estabelecimento, despacho, coleta, PIN, entrega, liquidação, avaliação, suporte e administração.
