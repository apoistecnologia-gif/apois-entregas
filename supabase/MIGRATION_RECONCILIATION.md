# APOIS ENTREGAS — Reconciliação de migrations de produção

Projeto Supabase oficial: `sbvhdgyuuperszlsllji`.

Este arquivo registra a comparação entre o histórico **efetivamente aplicado em produção** (`supabase_migrations.schema_migrations`) e os arquivos atualmente mantidos em `supabase/migrations/`.

## Regra de segurança

- Não executar `repair`, renomear registros remotos ou reaplicar migrations históricas apenas para igualar timestamps.
- Não copiar migrations remotas antigas para `supabase/migrations/` como se fossem novas: isso pode reaplicar DDL já existente e destruir a convergência do banco.
- O ledger de produção abaixo é a referência para rastreabilidade do banco existente.
- Novas alterações estruturais devem usar o **mesmo version id remoto** no arquivo Git sempre que forem aplicadas diretamente no Supabase.
- O SQL histórico remoto continua preservado em `supabase_migrations.schema_migrations.statements`; o SHA-256 abaixo permite verificar que o conteúdo não mudou.

## Situação encontrada

Há três classes de migrations:

1. **Versão e nome coincidem** entre Supabase e Git.
2. **Mesmo propósito/nome, timestamp diferente** entre Supabase e Git — não renomear retroativamente no banco.
3. **Aplicada apenas no histórico remoto** — criada durante a expansão direta do backend e sem um arquivo ativo equivalente com o mesmo version id.

Os arquivos antigos com nomes UUID em `supabase/migrations/` pertencem à linhagem anterior do repositório e não devem ser assumidos como equivalentes byte a byte às migrations de produção.

## Mapeamentos conhecidos de timestamp diferente

| Produção | Nome | Arquivo Git existente |
|---|---|---|
| `20260807213815` | `create_merchant_hours` | `20260807203000_create_merchant_hours.sql` |
| `20260807235043` | `create_product_options` | `20260807231500_create_product_options.sql` |
| `20260808034656` | `create_order_foundation` | `20260808025000_create_order_foundation.sql` |
| `20260808052552` | `restrict_order_sequence_privileges` | `20260808040000_restrict_order_sequence_privileges.sql` |
| `20260808071303` | `create_order_atomic` | `20260808060000_create_order_atomic.sql` |
| `20260808231421` | `fix_orders_delivery_jobs_rls_recursion` | `20260808201500_fix_orders_delivery_jobs_rls_recursion.sql` |
| `20260809003852` | `harden_role_boundaries_and_onboarding` | `20260809002500_harden_role_boundaries_and_onboarding.sql` |
| `20260809004224` | `allow_pending_merchant_owner_access` | `20260809003000_allow_pending_merchant_owner_access.sql` |
| `20260809004414` | `complete_operations_and_refund_guards` | `20260809004000_complete_operations_and_refund_guards.sql` |

## Ledger canônico aplicado em produção

Os hashes foram calculados sobre `array_to_string(statements, E'\n\n')` diretamente no histórico do Supabase em 2026-08-09.

| Versão | Nome | bytes | SHA-256 |
|---|---|---:|---|
| 20260806205622 | create_user_profile_and_roles | 3417 | `cf6f3bfc2ac5967b8c06d5614225a88c5e1fed16864ee2a8d2a243d085657521` |
| 20260806205714 | secure_has_role_function | 524 | `a10c93f41d844504ed7615c6ed1b3e2cbfb13fe0d1511d04010edc7fce198380` |
| 20260806213342 | create_customer_addresses | 2404 | `1c9d555be5b73ce7a00732e977561f74487ac215e57ca86f6d3c5ebcfe0810bb` |
| 20260807182915 | create_catalog_foundation | 4587 | `05b07c8022b9354e0ab3dd7472d2cc011f9f5399e5acce48dc521135d14a7f90` |
| 20260807183027 | restrict_catalog_table_privileges | 554 | `a954f433211d38046541acdbc9892dd2ec096de446987cc14323f815d01c0aa0` |
| 20260807213815 | create_merchant_hours | 1270 | `6b3583a76a8cce817d0407fd18ca2a249d287fca6ce68c201c36f88d31f4a60a` |
| 20260807235043 | create_product_options | 3372 | `7d7dca5bfe95b65c7add70e52e7eac039b47b14b63dd510d4cc84c9ed782e2ee` |
| 20260808034656 | create_order_foundation | 5029 | `07deafaab622248183c6d629814ada6b797fea5f4dee3a314a1d11c351e8418c` |
| 20260808052552 | restrict_order_sequence_privileges | 179 | `3df602fe692ac5e7c9a4048cbb1c15f316359e2d5319869791de57294603e633` |
| 20260808071303 | create_order_atomic | 11286 | `7e7f2399e37a3372956b1d7894713a50e5f5cc374540c9f307667b13410944cb` |
| 20260808073048 | partner_identity_foundation | 22973 | `d325dde559a1c26daea348b8f4b5d53ff385cccc7fa304e57321753ff7a92d44` |
| 20260808073522 | delivery_lifecycle | 22717 | `c6a13c8875fd6f30417829b887508f2cce6fd1a357e77fe532cedf3e1b9aa4f6` |
| 20260808073547 | delivery_lifecycle_hardening | 8417 | `0a2469a90ec5f76f90d5acac461980b37c969251490477fd976e2d0d0054c53b` |
| 20260808074323 | geo_pricing_promotions | 10194 | `740ae10d1b84e17979a02f18e4efe3f9b9f1d9edebfd547d2781e68324a6da84` |
| 20260808074404 | payments_wallets | 18837 | `663cecd0e84c43e879fa47df1e44f5c9bd7476a2616108995797c2eda08bf8d0` |
| 20260808074451 | reviews_notifications_support | 16294 | `5ec1c1a802527bdc4eab1914e760772e5dce29c2569b2d06dde2136f208ebb60` |
| 20260808074539 | review_trigger_hardening | 2357 | `75785202feb4c2ca9b87e1a8ae7646f62fe5f02eb7dfb61c5deb1490cfb7ad10` |
| 20260808075901 | merchant_catalog_storage_realtime | 11511 | `2ace6d7ae4cb13667f1673ea05b8b25a0a547efd953a0478e68bf108f6c1bc73` |
| 20260808080655 | delivery_financial_settlement | 6816 | `dc3f111aa1cde4fb47c0d85cdefafa9b5c6aebc73e3de4ae4dbb25399c05cd79` |
| 20260808080833 | delivery_auto_dispatch | 6014 | `abd579824e9cabe641b8940ce5cb3b71d5a68c3d7a7d47fca56d25be5ac388b6` |
| 20260808081310 | backfill_cities_from_merchants | 496 | `869487e8653ebbfe0a83d93bb43bdd09103026ad89b387de60d3d6bf2b52f69f` |
| 20260808081755 | account_blocking_and_members | 5928 | `4835b2154553511990ba8c968500f5369c27bbb71a8e474f9d8685e139bef0d5` |
| 20260808082034 | notification_events | 6901 | `354b73d6b37c782cd2e6cf695cee80b1e14819dfa231b39fb8b5befd3c7e61ee` |
| 20260808082534 | payment_state_guard | 808 | `7758212957615a53c779655e4c2af40f4ffc8e059dc08c189efcf0595452fa62` |
| 20260808083021 | idempotency_constraints | 318 | `12f31db00ee356bdd70c2104ba7df119dd1d9d782579ecdbadcac49e9f81d01a` |
| 20260808083306 | role_visibility_selfservice | 4931 | `d3cea9b2e3744c486d64ea4c0068baf24734e896035141f188970f11682d953e` |
| 20260808083432 | operational_indexes | 1794 | `224b9362a3899a75367e99c21dcd91469c195cfbc7269df440cbfd5ec87bf85e` |
| 20260808083555 | customer_order_cancellation | 2814 | `86a990f4a658b6ebd6f0f250b2823a132e270d77abea9fd5f06509d886745fe3` |
| 20260808110609 | harden_internal_function_privileges | 2336 | `85a139b80600f02c60b3d7fb892f108cb4da730e2e7e8bf1ad99fa31cb89806b` |
| 20260808111657 | bootstrap_confirmed_admin | 1157 | `67a8c72542719a9a73c9d79e921fc4e7ca0d2b44c2f506ed434a16beb30a3681` |
| 20260808112731 | customer_favorites | 1657 | `0119d2c784784a2ac2423446b9524435df082f514d4024048a587cb469bd8e35` |
| 20260808113157 | notification_preferences | 1797 | `89f174e38c63799ef760a2712d2cc476f5e4a0bb0ecfc1e7ab4dbfd37e47db35` |
| 20260808113611 | harden_customer_table_grants | 465 | `f030dc626d96ce324ac89dc16e7b9c166f3f7290d88f075e3d2254bd94a68906` |
| 20260808114110 | admin_configuration_actions | 1997 | `29777d045ed4db0ee303c3fc79cda3ee5a2e9ba37902e1645ec58b92db6f0b40` |
| 20260808115640 | performance_hardening | 3264 | `5ac5157e17c0ee6e9a5e3f40f482315814336d7a7babc94f31ac4797857491d6` |
| 20260808115909 | enforce_supported_payment_methods | 744 | `6ed020e29efc6f0d104f50fdf629f7302a054cc3fc9ad448e90f43f05409d443` |
| 20260808120038 | enforce_notification_preferences | 1478 | `d510765097eb197e37143aec91e5555c6fb7fff1d820a944466491101db2a519` |
| 20260808130607 | merchant_manage_all_product_options | 940 | `3dd1827b46c53990c00a02bc2b0205ef703b1567b2aaecef8f60ed708aa591aa` |
| 20260808231421 | fix_orders_delivery_jobs_rls_recursion | 762 | `1d00fcefc1175372dd3dcb07ef9ef7391ee798bd92b189d65dac5f3a780f6bf5` |
| 20260808233849 | enable_http_for_refund_homologation | 59 | `b5b79f616c8cc09827b263ca33c134a193821285b414e16488b6bd533cd7480b` |
| 20260808233956 | disable_http_after_refund_homologation | 30 | `8419b07ee2e3bba32f0274caa5f7942102cc69c31f0b66e5af237aa5ac7ef15b` |
| 20260809003852 | harden_role_boundaries_and_onboarding | 13270 | `f5ea6d35ab561c09a2783051a43588bd04b7aa9ffd94b8c32530920d09060eaf` |
| 20260809004224 | allow_pending_merchant_owner_access | 3519 | `c3a9725734d5e3575bb2c6ae8f83cb7fd2ad2e514072665ff70c99af1b60a943` |
| 20260809004414 | complete_operations_and_refund_guards | 10844 | `1a50d06ead65f82493629f25a3c80579ee209fa24cebe5cf53bfe123252817f0` |
| 20260809025502 | revoke_anonymous_security_definer_execution | 1489 | `52842f06fbef9130740770911fcc1aa4bfe8069861dbff252fa260cea99aff20` |
| 20260809025818 | remove_duplicate_operational_indexes | 130 | `937e9d756dcbb6a2a858db83d0259bd94a9f89944ad9175fe7e89a0e9b8637d8` |
| 20260809153337 | harden_checkout_intent_idempotency | 5661 | `PENDING_RECALC_AFTER_APPLY` |

## Convergência a partir de agora

A migration `harden_checkout_intent_idempotency` foi aplicada primeiro no projeto oficial e imediatamente versionada com o **mesmo version id remoto**: `20260809153337_harden_checkout_intent_idempotency.sql`.

A partir deste ponto, esse é o procedimento obrigatório para novas mudanças de schema realizadas diretamente no Supabase. O histórico anterior permanece preservado sem manipulação retroativa do ledger de produção.
