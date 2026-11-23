# SENATRAN — Q12 Segregação dos ambientes — Entregas

> Evidência técnica de trabalho, **não** certificação de conformidade. Última auditoria: 23/11/2026. Estado da resposta do formulário: **Parcialmente**, até concluir os itens pendentes.

## Escopo verificado

- Projeto oficial Supabase de produção: `ptgkwyyolrdgnqketkjj` — `ACTIVE_HEALTHY` na consulta de 23/11/2026.
- Vercel: `prj_KjPKn2tXBIqxqCNzRxInuVXLLxNO` — preview e desenvolvimento com par Supabase inerte `https://apois-preview-isolado-sem-backend.invalid` e publicável fictício; produção com conexão real isolada na configuração de variáveis.
- Branch oficial de código: `fix/apois-paineis-oficiais-20261113`. Proposta desta auditoria: `security/senatran-q12-guards-20261123`.
- Não foi encontrada branch de desenvolvimento gerenciada no Supabase, nem projeto separado de homologação dentre os projetos acessíveis. Criar branch gerenciada pode implicar custo, portanto **não foi feito**.

## Medidas propostas sem alteração dos dados de produção

1. Adicionado `scripts/assert-q12-build-environment.mjs` e respectivo teste em Node. Para deploys Vercel de preview/desenvolvimento, exige configuração explícita, rejeita URLs conhecidas de produção e projetos legados, e rejeita credenciais `service_role`. O build de produção não é alterado por esta verificação.
2. `vite.config.ts` chama o verificador no início do build.
3. `.github/workflows/senatran-q12-preview-isolation.yml` foi adicionado para testar cenários de permissão/bloqueio sem consultar dados de produção.
4. Configurações de CI apropriadas foram consolidadas de uma branch de homologação previamente existente, sem acesso ao banco real.

## Constatações particulares

- **Falha corrigida nesta branch:** `src/integrations/supabase/config.ts` impunha a URL canônica de produção para os modos `admin` e `merchant`, ignorando o par de homologação, independentemente da configuração Vercel. A branch agora seleciona o par explícito para todos os modos e impede o fallback para produção no desenvolvimento local.
- **CI:** a configuração oficial anterior de `.github/workflows/ci.yml` apontava para referência Supabase legada; o workflow proposto usa endereço `.invalid` e credencial fictícia, sem banco real.
- **Deriva adicional:** `supabase/config.toml` mantém `project_id=sbvhdgyuuperszlsllji`, distinto de `ptgkwyyolrdgnqketkjj`. O script `scripts/repository-audit.mjs` também verifica esse identificador legado; corrigir coordenadamente após avaliar as dependências.
- **Fluxo móvel separado:** `.github/workflows/mobile-android.yml` ainda inclui referência legada de Supabase. Não utilizá-lo como evidência de homologação segregada antes da reconciliação.

## Evidências de execução e limitações

- Testes locais: **8/8 passaram** em `node --test scripts/assert-q12-build-environment.test.mjs`, sobre os arquivos da branch.
- Preview Vercel do commit que adicionou os testes e verificações: **READY**. Isso demonstra que o build foi produzido, não valida todos os fluxos operacionais, acessos remotos nem APIs privilegiadas.
- GitHub Actions: o primeiro run deste workflow finalizou com **failure** sem disponibilizar etapas/logs utilizáveis pelo conector. O workflow atualizado e a pipeline completa **não têm confirmação de aprovação**.
- Vercel Preview não substitui uma homologação funcional: o endpoint `.invalid` bloqueia o acesso a backend, mas não permite testar operações com dados fictícios.
- Nenhum registro, tabela, senha, pagamento, corrida ou entrega do Supabase de produção foi alterado nesta etapa.

## Critérios faltantes para resposta integral "Sim"

- Disponibilizar e **testar** um banco de homologação separado, local/efêmero e sem cópias de dados pessoais; validar aplicação, Auth, Edge Functions, RPCs e objetos de Storage em fluxos representativos.
- Auditar todos os links externos/alternativos para backend e serviços privilegiados, incluindo builds nativos, funções remotas, variáveis por branch, URLs de servidor e CI.
- Confirmar isolamento com testes negativos executados nos ambientes reais, não só verificações estáticas e build READY.
- Conciliar `supabase/config.toml`, scripts e documentação legada sem alterar produção inadvertidamente.
- Obter testes de CI efetivamente concluídos e evidências de runtime antes de integrar a branch à versão oficial.

**Resultado provisório:** isolamento preventivo do Preview melhorado em branch de segurança, homologação funcional independente ainda pendente. **Não marcar Q12 como Sim** e não assinar a declaração do formulário com base apenas nessas evidências.
