# APOIS ENTREGAS — Reconciliação de migrations de produção

Projeto Supabase oficial: `sbvhdgyuuperszlsllji`.

Este documento registra a reconciliação entre o histórico efetivamente aplicado em produção (`supabase_migrations.schema_migrations`) e os arquivos mantidos em `supabase/migrations/`.

## Regra de segurança

- Não executar `migration repair`, renomear registros remotos ou reaplicar migrations históricas apenas para igualar timestamps.
- Não copiar migrations antigas para a pasta ativa como se fossem novas: isso pode reaplicar DDL já executado.
- O ledger de produção é a fonte de verdade para o que já foi aplicado.
- O SQL histórico permanece preservado no campo `statements` de `supabase_migrations.schema_migrations`.
- A partir de `20260809153337`, toda migration aplicada diretamente no projeto oficial deve ser versionada no Git com o mesmo `version id` remoto.
- Alterações novas de schema devem continuar sendo reproduzíveis, não destrutivas e rastreáveis.

## Situação encontrada em 2026-08-09

Existem três classes de migrations:

1. versão/nome coincidentes entre Supabase e Git;
2. mesmo propósito/nome com timestamp histórico diferente;
3. migrations criadas durante a expansão direta do backend e preservadas no ledger remoto, sem arquivo ativo histórico com o mesmo `version id`.

Os arquivos antigos com nomes UUID em `supabase/migrations/` pertencem à linhagem anterior do repositório e não devem ser presumidos como equivalentes byte a byte às migrations de produção.

## Mapeamentos conhecidos com timestamp histórico diferente

- Produção `20260807213815`, `create_merchant_hours` → Git `20260807203000_create_merchant_hours.sql`.
- Produção `20260807235043`, `create_product_options` → Git `20260807231500_create_product_options.sql`.
- Produção `20260808034656`, `create_order_foundation` → Git `20260808025000_create_order_foundation.sql`.
- Produção `20260808052552`, `restrict_order_sequence_privileges` → Git `20260808040000_restrict_order_sequence_privileges.sql`.
- Produção `20260808071303`, `create_order_atomic` → Git `20260808060000_create_order_atomic.sql`.
- Produção `20260808231421`, `fix_orders_delivery_jobs_rls_recursion` → Git `20260808201500_fix_orders_delivery_jobs_rls_recursion.sql`.
- Produção `20260809003852`, `harden_role_boundaries_and_onboarding` → Git `20260809002500_harden_role_boundaries_and_onboarding.sql`.
- Produção `20260809004224`, `allow_pending_merchant_owner_access` → Git `20260809003000_allow_pending_merchant_owner_access.sql`.
- Produção `20260809004414`, `complete_operations_and_refund_guards` → Git `20260809004000_complete_operations_and_refund_guards.sql`.

Esses registros não devem ser “corrigidos” retroativamente no banco. A divergência é documental e está explicitamente mapeada aqui.

## Ledger de produção observado

- `20260806205622` — `create_user_profile_and_roles`
- `20260806205714` — `secure_has_role_function`
- `20260806213342` — `create_customer_addresses`
- `20260807182915` — `create_catalog_foundation`
- `20260807183027` — `restrict_catalog_table_privileges`
- `20260807213815` — `create_merchant_hours`
- `20260807235043` — `create_product_options`
- `20260808034656` — `create_order_foundation`
- `20260808052552` — `restrict_order_sequence_privileges`
- `20260808071303` — `create_order_atomic`
- `20260808073048` — `partner_identity_foundation`
- `20260808073522` — `delivery_lifecycle`
- `20260808073547` — `delivery_lifecycle_hardening`
- `20260808074323` — `geo_pricing_promotions`
- `20260808074404` — `payments_wallets`
- `20260808074451` — `reviews_notifications_support`
- `20260808074539` — `review_trigger_hardening`
- `20260808075901` — `merchant_catalog_storage_realtime`
- `20260808080655` — `delivery_financial_settlement`
- `20260808080833` — `delivery_auto_dispatch`
- `20260808081310` — `backfill_cities_from_merchants`
- `20260808081755` — `account_blocking_and_members`
- `20260808082034` — `notification_events`
- `20260808082534` — `payment_state_guard`
- `20260808083021` — `idempotency_constraints`
- `20260808083306` — `role_visibility_selfservice`
- `20260808083432` — `operational_indexes`
- `20260808083555` — `customer_order_cancellation`
- `20260808110609` — `harden_internal_function_privileges`
- `20260808111657` — `bootstrap_confirmed_admin`
- `20260808112731` — `customer_favorites`
- `20260808113157` — `notification_preferences`
- `20260808113611` — `harden_customer_table_grants`
- `20260808114110` — `admin_configuration_actions`
- `20260808115640` — `performance_hardening`
- `20260808115909` — `enforce_supported_payment_methods`
- `20260808120038` — `enforce_notification_preferences`
- `20260808130607` — `merchant_manage_all_product_options`
- `20260808231421` — `fix_orders_delivery_jobs_rls_recursion`
- `20260808233849` — `enable_http_for_refund_homologation`
- `20260808233956` — `disable_http_after_refund_homologation`
- `20260809003852` — `harden_role_boundaries_and_onboarding`
- `20260809004224` — `allow_pending_merchant_owner_access`
- `20260809004414` — `complete_operations_and_refund_guards`
- `20260809025502` — `revoke_anonymous_security_definer_execution`
- `20260809025818` — `remove_duplicate_operational_indexes`
- `20260809153337` — `harden_checkout_intent_idempotency`
- `20260809162700` — `enforce_refund_aware_merchant_cancellation`
- `20260809173533` — `courier_online_sessions_and_metrics`
- `20260809174412` — `audit_admin_operational_configuration`
- `20260809175133` — `audit_admin_support_replies`
- `20260809190114` — `enforce_active_accounts_for_courier_finance`
- `20260809190300` — `customer_self_deactivation`
- `20260809191243` — `merchant_split_and_special_hours`
- `20260809192545` — `pickup_coupon_checkout_v2`
- `20260809193044` — `fix_coupon_redemption_conflict`
- `20260809193645` — `secure_pickup_completion_with_pin`
- `20260809194128` — `fix_pin_random_bytes_schema`
- `20260809194317` — `merchant_coupon_redemption_visibility`

## Verificação das migrations novas convergentes

### `20260809153337_harden_checkout_intent_idempotency.sql`

- versão remota: `20260809153337`;
- nome remoto: `harden_checkout_intent_idempotency`;
- bytes do SQL no ledger: `5547`;
- SHA-256 remoto: `2441d15e4cc37fe275d4fc6f1556fe5061f958319ff28924f6f2bacb632dd016`.

### `20260809162700_enforce_refund_aware_merchant_cancellation.sql`

- versão remota: `20260809162700`;
- nome remoto: `enforce_refund_aware_merchant_cancellation`;
- bytes do SQL no ledger: `2468`;
- SHA-256 remoto: `5c19c1162b64a7c51b7c5622a2ea17aa2bbea098f3fde9eaf2bdd0bc4e880d3d`.

### `20260809173533_courier_online_sessions_and_metrics.sql`

- versão remota: `20260809173533`;
- nome remoto: `courier_online_sessions_and_metrics`;
- bytes do SQL no ledger: `7837`;
- SHA-256 remoto: `859bfbab53340d4d9cdad8c1dd6ff4a745679452c52b5e3e16d1dedc44a99c99`.

### `20260809174412_audit_admin_operational_configuration.sql`

- versão remota: `20260809174412`;
- nome remoto: `audit_admin_operational_configuration`;
- bytes do SQL no ledger: `3577`;
- SHA-256 remoto: `a43163118c21bb32a84a38459433e84e884c64739ac8e623314b44cecca39478`.

### `20260809175133_audit_admin_support_replies.sql`

- versão remota: `20260809175133`;
- nome remoto: `audit_admin_support_replies`;
- bytes do SQL no ledger: `2472`;
- SHA-256 remoto: `02a823429ff40098a2872c8b6c4515e0530748d719a92b474566b67c8ba3fe06`.

### `20260809190114_enforce_active_accounts_for_courier_finance.sql`

- versão remota: `20260809190114`;
- nome remoto: `enforce_active_accounts_for_courier_finance`;
- bytes do SQL no ledger: `17051`;
- SHA-256 remoto: `951faae3bb3bada88dd6531ee9f89442a0402a7c1674d5b0c891fe4542cb89d3`.

### `20260809190300_customer_self_deactivation.sql`

- versão remota: `20260809190300`;
- nome remoto: `customer_self_deactivation`;
- bytes do SQL no ledger: `1258`;
- SHA-256 remoto: `9b9a924681fad78d2cda79b6bdc637c80115d73bdf349f909d0b8872e5a1e9fd`.

### `20260809191243_merchant_split_and_special_hours.sql`

- versão remota: `20260809191243`;
- nome remoto: `merchant_split_and_special_hours`;
- bytes do SQL no ledger: `2901`;
- SHA-256 remoto: `2dbfa500e4d9a50a4e03c635b4bdc26cc6cd39e5bd844fdf1c1a62ba99fd638a`.

### `20260809192545_pickup_coupon_checkout_v2.sql`

- versão remota: `20260809192545`;
- nome remoto: `pickup_coupon_checkout_v2`;
- bytes do SQL no ledger: `17628`;
- SHA-256 remoto: `140f625bc12b26b4ef19ffc096d59108547a73583ecb2c92de3b92ece261637d`.

### `20260809193044_fix_coupon_redemption_conflict.sql`

- versão remota: `20260809193044`;
- nome remoto: `fix_coupon_redemption_conflict`;
- bytes do SQL no ledger: `803`;
- SHA-256 remoto: `69c2a97def931f267781f84e232eda60b1af28b7582ff2d13ac09749c29de221`.

### `20260809193645_secure_pickup_completion_with_pin.sql`

- versão remota: `20260809193645`;
- nome remoto: `secure_pickup_completion_with_pin`;
- bytes do SQL no ledger: `5561`;
- SHA-256 remoto: `5bd0a9537ca25de589d29f41bcfa55fcec138f041124d9b0c38b91bbf637f037`.

### `20260809194128_fix_pin_random_bytes_schema.sql`

- versão remota: `20260809194128`;
- nome remoto: `fix_pin_random_bytes_schema`;
- bytes do SQL no ledger: `673`;
- SHA-256 remoto: `caf1ccf881120077851e59b6e76b47d72ceb45890e15ba77b956c82ba4bad96f`.

### `20260809194317_merchant_coupon_redemption_visibility.sql`

- versão remota: `20260809194317`;
- nome remoto: `merchant_coupon_redemption_visibility`;
- bytes do SQL no ledger: `362`;
- SHA-256 remoto: `fc1eccf8a7313ab59f4fbf8b3a91fec3498abcd8ebbdae6ba8cb4e18d97bb4ad`.

O commit histórico `b9a06ac99970f622838be081df908bc323b202bd` preserva a primeira captura completa de hashes do ledger remoto. As migrations posteriores a `20260809153337` passam a usar o mesmo `version id` no Supabase e no Git.

## Convergência daqui em diante

Para toda nova alteração de schema:

1. diagnosticar o schema atual;
2. criar migration reproduzível;
3. aplicar no Supabase oficial;
4. versionar imediatamente com o mesmo `version id` remoto;
5. validar o ledger após a aplicação;
6. não manipular o histórico remoto para “embelezar” timestamps antigos.

Assim, a divergência legada permanece documentada sem risco de reaplicação ou perda de dados, e as migrations novas passam a convergir de forma determinística entre Git e produção.
