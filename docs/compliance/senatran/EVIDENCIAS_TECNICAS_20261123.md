# Registro das evidências técnicas observadas — 23/11/2026

**Natureza:** coleta técnica com acesso aos repositórios GitHub, configurações Vercel e bancos Supabase. Este arquivo não é atestado independente nem documento SENATRAN assinado.

## Identidade, acessos e MFA

- A conta `master@apoisbrasil.com.br` foi confirmada como **única administradora** em Entregas e Corridas.
- Entregas: 3 atribuições extras de `admin` removidas, outros papéis operacionais preservados; índice único impede atribuição de um segundo `admin`.
- Corridas: 2 perfis administrativos anteriores foram rebaixados e desativados para o painel, sem exclusão de contas; índice único impede segundo `administrator`.
- Nos dois projetos Supabase, a conta master possui pelo menos um fator `totp` verificado. `private.apois_admin_mfa_enforcement.enforce_aal2 = true` nos dois bancos.
- Usuário comprovou novos logins no domínio oficial com código do autenticador **depois** da exigência AAL2 ser ativada em cada banco.
- Entregas: `public.current_user_is_admin()` consulta `private.apois_admin_mfa_ok()`.
- Corridas: `private.has_permission(text)` consulta `private.apois_admin_mfa_ok()`. Testes de SQL em transação revertida mostraram `aal1` negado e `aal2` permitido para `users.manage`.
- Os testes não demonstram ainda cobertura de todo endpoint externo que possa acessar dados privilegiados.

## Rastreabilidade e proteção de logs

- `public.admin_audit_logs` (Entregas): 89 registros observados, datados entre 10/08/2026 e 15/11/2026.
- `public.audit_logs` (Corridas): 230 registros observados, entre 01/08/2026 e 23/11/2026.
- Nos dois bancos: RLS ativa; `anon` sem SELECT/INSERT/UPDATE/DELETE; `authenticated` com SELECT sujeito a RLS e sem INSERT/UPDATE/DELETE; `service_role` mantém privilégios para operações de backend autorizadas.
- Políticas de SELECT: `current_user_is_admin()` em Entregas e `private.has_permission('audit.read')` em Corridas, ligadas ao MFA.
- **Pendente:** auditar exportação, integridade, rotação, retenção, backups de logs, logs Vercel, serviços de pagamentos e operações que usem `service_role`.

## Proteção de dados

- PostgreSQL em ambos os projetos: `ssl=on` verificado.
- Supabase informa publicamente criptografia em repouso AES-256 e em trânsito TLS. Evidência do fornecedor não substitui verificação das cópias/exportações, terceiros e dispositivos da APOIS.
- Referências públicas: https://supabase.com/security ; https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq

## Ambientes de homologação

- Encontrada conexão de prévias Vercel aos projetos Supabase de produção.
- Foram ativadas restrições Vercel Authentication para as prévias dos projetos `apois-admin`, `apois-corridas-admin` e `apois-corridas-admin-homologacao`.
- As variáveis Supabase de **novas** prévias desses projetos foram direcionadas a URLs sem banco válido (`.invalid`) e chave inerte; valores de produção mantidos somente em escopo `production` nos dois painéis oficiais.
- **Limitações:** deployments anteriores podem conservar suas configurações históricas, embora estejam protegidos por login Vercel; novo backend de homologação plenamente funcional ainda não existe.
- Repositórios receberam PRs de CI testando ambientes sem conexão de produção. Primeiras execuções da automação GitHub Actions falharam; logs não acessíveis pela integração; **não tratar esses testes como aprovados**.

## Backups e recuperação

- Os projetos Supabase são do plano Free. Documentação oficial (atualizada em 2026) diz que **não inclui backups automáticos diários**; recomenda exportação manual `supabase db dump` e cópia fora do provedor.
- Não existe evidência de backup recuperável completo nem de teste real de restauração nesta verificação.
- Fonte: https://supabase.com/kb/faqs/platform/free-plan-backups e https://supabase.com/docs/guides/platform/backups

## Registro de limitações

- Não foi fornecida certificação ISO/IEC 27001.
- As evidências são pontuais, não auditoria independente e não garantem continuidade permanente do controle.
- O formulário original exige avaliação e assinatura do responsável técnico. Não declarar “Sim” integral sem verificar o perímetro completo.
