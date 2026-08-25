-- Isolamento explícito para a migração de Checkout Transparente (Payments API)
-- para Orders API no fluxo de PIX do estabelecimento (create-merchant-mercadopago-pix).
--
-- Por padrão (`false`), TODA conta de estabelecimento conectada — incluindo
-- estabelecimentos reais já operando, como "Bolos Da Nay" — continua usando
-- exatamente o código legado (/v1/payments) sem nenhuma mudança de
-- comportamento. Somente contas explicitamente marcadas com
-- `orders_api_enabled = true` (a conta de teste desta homologação) passam a
-- usar a Orders API. Isso permite validar a migração em produção com uma
-- conta de teste isolada antes de estender para estabelecimentos reais.
alter table public.merchant_mercadopago_accounts
  add column if not exists orders_api_enabled boolean not null default false;

comment on column public.merchant_mercadopago_accounts.orders_api_enabled is
  'Feature flag por conta: quando true, create-merchant-mercadopago-pix usa a Orders API (/v1/orders) em vez da Payments API legada (/v1/payments). Default false preserva o comportamento atual para todos os estabelecimentos já conectados.';
