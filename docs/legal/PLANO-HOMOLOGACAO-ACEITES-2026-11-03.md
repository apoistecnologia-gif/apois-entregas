# APOIS Entregas — Aceites jurídicos versionados (homologação isolada)
Data: 2026-11-03.

## Status e proteção da operação
- Branch: `legal/aceites-homolog-base-estavel-20261103`, derivada de `fix/apois-merchant-cash-qa-20261029`, versão que já compilava nas prévias Vercel.
- Não houve migração aplicada ao banco de produção, deploy de Edge Function ou alteração de APK.
- Fluxo vigente de cadastro e tabela `legal_acceptances` anteriores foram preservados. **NÃO** tratar essa base legada como aceite dos contratos de novembro.
- Rota `/aceites` bloqueada por `VITE_APOIS_LEGAL_ACCEPTANCE_V2` (desligada por padrão); também exige sessão autenticada.
- Ao acessar documentos publicados, o usuário verá o texto integral do servidor, hash SHA-256 e um ato afirmativo específico. A política de privacidade recebe evento de **ciência**, não consentimento genérico. Para SENATRAN, utilizar autorização específica quando exigida.
- Não há documentos publicados na nova base: catálogo inicia vazio e não se aceita minuta.

## Arquivos
1. `docs/legal/PROPOSTA-SQL-ACEITES-VERSIONADOS-NAO-EXECUTAR.sql` — script SQL preparatório; **NÃO É MIGRAÇÃO APLICADA**.
2. `supabase/functions/legal-acceptance/index.ts` — Edge Function preparada, **NÃO IMPLANTADA**.
3. `src/routes/aceites.tsx` — visualização/autenticação/aceite por documento, sob feature flag.
4. `src/lib/product-routing.ts` — exceção de rota compartilhada; a autenticação permanece obrigatória na própria rota.
5. `src/routes/termos.tsx` — mostra link para /aceites só quando a flag estiver ativa.

## Portões para ativação
1. Revisar e aprovar texto integral dos documentos, termos comerciais, canal de contato e regulamentação municipal aplicável.
2. No ambiente **separado de homologação**, usar `supabase migration new ...` para gerar arquivo com nome produzido pelo CLI. Inserir a proposta SQL revisada; **não inventar** nome de migration e não executar este arquivo em produção diretamente.
3. Testar dependências: Postgres 17, `sha256(bytea)`, RLS, FK, trigger de imutabilidade de documentos publicados e retenção legítima de eventos; verificar se o procedimento de exclusão de conta permanece operacional.
4. Publicar documento **de teste apenas na base de homologação** com versão e texto congelados, hash gerado pelo banco, aprovação, vigência e audience correto; testar a transição entre versões.
5. Implantar `legal-acceptance` somente na homologação; configurar `APOIS_LEGAL_ALLOWED_ORIGINS` com as origens reais (web, Android WebView/Capacitor, prévia) e manter segredo Supabase apenas na Edge Function.
6. Testar com usuários de teste distintos por perfil e sem PII real.
7. Ativar `VITE_APOIS_LEGAL_ACCEPTANCE_V2=true` **somente no aplicativo de homologação**, verificar UX e deep links de cliente, entregador e estabelecimento.
8. Adicionar, quando aprovado, bloqueio de funções condicionado a aceite do documento vigente e fluxo de reaceite; isso não está implementado nesta fase.
9. Adaptar integração à fonte de verdade de build do superapp/APKs após auditoria de source lock. Não sobrescrever versões Android existentes.
10. Só considerar produção após testes e autorização de publicação, com plano de rollback de feature flag.

## Matriz mínima de testes obrigatórios
| Cenário | Esperado |
|---|---|
| Flag desligada | /aceites retorna ao início sem alterar cadastro vigente |
| Flag ligada, não autenticado | Redirecionamento para login |
| Tabelas/função ainda não implantadas | Falha informada; não registra aceite |
| Catálogo sem documento publicado | Mensagem de ausência; sem aceite presumido |
| Origem não permitida | 403 |
| JWT ausente ou inválido | 401 |
| Ação diferente de "acknowledged" em privacy_notice | 400 |
| Tentativa de cliente aceitar documento courier/merchant sem vínculo | 403 |
| Documento draft, expirado ou retirado | 409; sem evento |
| Hash divergente | 409 e solicitação de recarga |
| Usuário aceita documento vigente após ler | Evento com user id validado e timestamp do servidor |
| Dois envios do mesmo documento | Retorna evidência original, sem duplicar |
| Reutilização do mesmo request_id para documento diferente | 409 |
| Usuário A consulta evidência de B via Data API | Negado por RLS |
| Usuário anônimo tenta INSERT/UPDATE/DELETE na Data API | Negado por grants/RLS |
| Mudança de conteúdo de versão publicada | Recusada por trigger |
| Versão anterior retirada e aceite existente | Titular conserva leitura da sua versão histórica |
| Exclusão de conta após política de retenção legal | Tratamento apropriado ao caso, sem deixar dados pessoais indevidamente |
| Volta a uma versão legada sem flag | Cadastro original funciona e não é reescrito |
| Conta por login social | Necessidade de fluxo específico pós-login, não presumir aceite |
| Registros antigos de `legal_acceptances` | Intactos; não convertidos em aceite dos documentos novos |

## Limitações conhecidas
- A existência de evento eletrônico valida identidade/sessão, versão, ato enviado e horário de servidor, mas não é prova absoluta de leitura integral pelo titular.
- Cadastro legado ainda usa `legal_version: "2026-08-09"` e deve ser migrado **após** homologação do fluxo novo e dos textos definitivos.
- A migração e a função não foram aplicadas/executadas contra a produção; sem teste real de RLS e invocação, o módulo ainda não está pronto para uso.
- Os contratos de Corridas permanecem em repositório/projeto separado e exigem adaptação ao modelo de identidade e tabelas daquele sistema.
- Não foi adicionada automação de GitHub Actions.
