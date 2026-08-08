# APOIS ENTREGAS — Arquitetura

## Aplicações

- **Cliente (raiz do repositório)** — Vite + React + TypeScript + TanStack Router. Autenticação, perfil, endereços, catálogo, personalizações, carrinho, checkout, pedidos e avaliações.
- **Painel do estabelecimento (`apps/merchant`)** — dashboard operacional web, pedidos em tempo real, cardápio, promoções, financeiro, clientes, avaliações e configurações.
- **App do entregador (`apps/courier`)** — interface mobile-first para cadastro, aprovação, disponibilidade, localização, ofertas, coleta, entrega, carteira, saque e suporte.
- **Painel administrativo (`apps/admin`)** — operação central, pedidos, usuários, parceiros, entregas, financeiro, suporte e configurações.

Todos usam o mesmo projeto Supabase oficial. Nenhuma aplicação cliente recebe `service_role`.

## Backend central

### Supabase Auth

O JWT identifica o usuário. Papéis e vínculos nunca são aceitos do frontend como fonte de autoridade. Administração é validada por `user_roles`; estabelecimento por `merchant_members`; entregador por `couriers`.

### Banco

Principais domínios:

- identidade: `profiles`, `user_roles`;
- estabelecimentos: `merchants`, `merchant_members`, `merchant_hours`, documentos;
- catálogo: categorias, produtos, grupos e opções;
- pedidos: `orders`, `order_items`, `order_status_history`;
- entrega: `couriers`, disponibilidade/localização, `delivery_jobs`, `delivery_offers`, `delivery_events`, segredo de confirmação;
- território: `cities`, `delivery_zones`, `fee_rules`;
- promoções: `promotions`, `coupons`, `coupon_redemptions`;
- financeiro: `payments`, eventos/transações, `refunds`, `wallets`, ledger, `payouts`;
- relacionamento: `reviews`, `notifications`, `push_devices`, suporte;
- governança: `admin_audit_logs`, `platform_settings`.

### Operações críticas

Operações de preço/status/aceite/saque são PostgreSQL Functions/RPCs com transação e locks quando necessário. Exemplos:

- criação atômica do pedido;
- aceite atômico da oferta de entrega;
- state machine do pedido e da entrega;
- confirmação por PIN;
- liquidação da entrega nas carteiras;
- ledger e saque idempotentes;
- bloqueio/aprovação administrativa;
- avaliação única de pedido entregue.

### Edge Functions

- `create-order`: autentica o cliente e cria pedido com preço recalculado no banco;
- `customer-orders`: read model autenticado para histórico/detalhe/PIN do próprio cliente;
- `create-pix-charge`: adaptador de cobrança PIX OpenPix/Woovi, habilitado apenas quando o segredo existe;
- `openpix-webhook`: webhook autenticado e idempotente para confirmação do gateway.

### Realtime

A publicação inclui pedidos, histórico, jobs/ofertas/eventos de entrega, notificações, suporte e disponibilidade/localização. Cada cliente ainda fica sujeito a RLS.

### Storage

Buckets públicos apenas para mídia não sensível (avatar, produto, assets do estabelecimento). Documentos e anexos de suporte são privados e controlados por policy.

## Segurança

- RLS obrigatório nos dados sensíveis;
- deny-by-default + grants mínimos;
- `service_role` somente no servidor;
- preços e totais calculados no banco;
- pagamento online precisa estar confirmado antes do fulfillment;
- contas bloqueadas perdem operação no servidor;
- aceite de entrega e saque são protegidos contra concorrência;
- webhooks e ledger possuem idempotência;
- ações administrativas sensíveis geram auditoria.

## Fluxo operacional

Cliente → pedido → pagamento → estabelecimento → preparo → despacho automático → entregador → coleta → rota → PIN → liquidação financeira → avaliação.
