# Primeira avaliação documentada de riscos — 23/11/2026

**Estado:** levantamento técnico inicial; revisão periódica ainda não comprovada. Prioridade definida pela combinação qualitativa de impacto e probabilidade observados. Reavaliar até 23/02/2027 ou antes, se ocorrer incidente.

| ID | Risco / achado | Impacto | Situação e mitigação | Próxima evidência |
|---|---|---|---|---|
| R01 | Prévia Vercel acessava banco de produção (Q12) | Crítico | Acesso às prévias protegido por autenticação Vercel; futuras prévias com Supabase inerte e produção em escopo próprio | Provisionar **backend real isolado** com dados sintéticos e executar E2E sem produção |
| R02 | Ausência de backups automáticos no Supabase Free (Q21/22) | Crítico | Política e procedimento de exportação/restauração propostos | **Primeiro dump cifrado, verificado e restauração sem produção** |
| R03 | Revisão de acesso não sistematizada (Q7) | Alto | Administrador único e restrição por índice já confirmados | Registro assinado da revisão trimestral e solução de recuperação de MFA |
| R04 | Logs com grants excessivos (Q19) | Alto | Grants removidos nas duas tabelas de auditoria; RLS e MFA verificados | Definir retenção, integridade e proteger logs externos e `service_role` |
| R05 | Criptografia fora do Supabase não inventariada (Q10) | Alto | Supabase confirma AES-256; SSL ligado nos bancos | Verificar armazenamentos em outros provedores, exports e dispositivos |
| R06 | Funcionalidades de pagamentos, mapas e webhooks externas | Alto | Edge Functions inicialmente inventariadas, sem auditoria universal | Revisão por função, assinatura de webhook, secrets e mínimo privilégio |
| R07 | Política e procedimentos sem aprovação (Q1/Q14/Q23/Q25) | Alto | Minutas elaboradas | Aprovação da administração e divulgação interna |
| R08 | Incidentes, treinamento e avaliação de restauração sem registros completos | Alto | Modelos/procedimentos elaborados | Simulado, evidência de participação e ata de restauração |
| R09 | Dependência de um único autenticador master | Alto | MFA em operação nos dois bancos | Cofre seguro de recuperação, segundo fator, procedimento de contingência auditável |
| R10 | Dados pessoais em logs e exportações de suporte | Alto | Revisão ampla ainda pendente | Política de minimização, testes de vazamento e retenção |

**Responsável por acompanhar:** a designar formalmente.  
**Aprovação e aceitação de risco:** pendentes.  
**A data desta primeira avaliação não comprova que haja avaliações periódicas anteriores.**
