# APOIS — SENATRAN 28 respostas, avaliação técnica conservadora (23/11/2026)

**Empresa:** APOIS TECNOLOGIA E MOBILIDADE LTDA — CNPJ 68.290.710/0001-37. **Não protocolado, não assinado.**

| Questão | Resposta de conferência | Razão principal                                                                                                                             |
| ------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1      | Parcialmente            | PSI em minuta; aprovação pendente                                                                                                           |
| Q2      | Parcialmente            | matriz de riscos inicial; periodicidade não demonstrada                                                                                     |
| Q3      | Parcialmente            | inventário inicial; terceiros e dispositivos faltam                                                                                         |
| Q4      | Sim                     | RLS/RBAC por perfis observados                                                                                                              |
| Q5      | Sim                     | identidade individual Supabase Auth                                                                                                         |
| Q6      | Parcialmente            | AAL2 ativo com testes SQL: AAL1 rejeitado e AAL2 aceito nos dois bancos; fluxos alternativos ainda não integralmente auditados              |
| Q7      | Parcialmente            | revisão inicial; ciclos periódicos não demonstrados                                                                                         |
| Q8      | Parcialmente            | revogações específicas; SLA e cobertura a validar                                                                                           |
| Q9      | Sim                     | Supabase produção gerenciado e controlado                                                                                                   |
| Q10     | Parcialmente            | criptografia Supabase comprovada pelo provedor; outras cópias pendentes                                                                     |
| Q11     | Parcialmente            | TLS nos provedores; integrações de ponta a ponta pendentes                                                                                  |
| Q12     | Parcialmente            | Preview isolado com endpoint inerte e guarda mobile homologação (9 testes novos); backend funcional isolado ainda não comprovado            |
| Q13     | Parcialmente            | controle de cópias não integralmente documentado                                                                                            |
| Q14     | Parcialmente            | retenção proposta; prazos não aprovados                                                                                                     |
| Q15     | Parcialmente            | branches/PR/revisões; ciclo formal não completo                                                                                             |
| Q16     | Parcialmente            | testes locais 8/8; CI Actions falhou                                                                                                        |
| Q17     | Parcialmente            | correção TanStack e RPC; advisories ainda abertos                                                                                           |
| Q18     | Sim                     | logs principais em ambas as plataformas                                                                                                     |
| Q19     | Parcialmente            | RLS, revogação de DML e gatilho append-only testado; SHA-256 externo verificado; retenção, alertas e proteção de todos os eventos pendentes |
| Q20     | Parcialmente            | logs disponíveis; rotina de monitoramento não demonstrada                                                                                   |
| Q21     | Não                     | Free sem backup automático; scripts de exportação criptografada preparados, sem backup real                                                 |
| Q22     | Não                     | restauração de backup não testada                                                                                                           |
| Q23     | Parcialmente            | plano proposto, não aprovado                                                                                                                |
| Q24     | Não                     | registro operacional de incidentes não comprovado                                                                                           |
| Q25     | Parcialmente            | plano proposto; exercício e RTO/RPO ausentes                                                                                                |
| Q26     | Parcialmente            | ROPA inicial incompleto                                                                                                                     |
| Q27     | Parcialmente            | RLS e buckets privados; outras medidas a validar                                                                                            |
| Q28     | Não                     | nenhum treinamento realizado comprovado                                                                                                     |

Cálculo: score ponderado 0,520833; nota contínua 3,083333; arredondamento 3; devido a Q6/Q10/Q12/Q19 < Sim, **nível aplicado 1** até comprovação integral. Pontuação estimativa interna, classificação final realizada pela Senatran. Não confundir criação de política com aprovação, build Vercel READY com teste funcional ou banco PostgreSQL do CI com backup de produção.

Referências: PR Entregas #14, PR Corridas #11; docs/security/SENATRAN_POLITICA_CONTROLES_MINUTA_20261123.md; docs/security/SENATRAN_RISCOS_INVENTARIO_ROPA_20261123.md; docs/security/SENATRAN_INCIDENTES_CONTINUIDADE_BACKUP_TREINAMENTO_20261123.md.
