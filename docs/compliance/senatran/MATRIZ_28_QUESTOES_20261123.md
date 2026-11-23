# Matriz de evidências das 28 perguntas — Formulário SENATRAN v1.0

**Requerente:** APOIS TECNOLOGIA E MOBILIDADE LTDA — CNPJ 68.290.710/0001-37.  
**Data-base:** 23/11/2026.  
**NÃO é o formulário preenchido ou declaração oficial.** A coluna indica situação da comprovação no perímetro analisado, não substitui marcação assinada de Sim / Parcialmente / Não. Em especial, os quatro quesitos eliminatórios Q6, Q10, Q12 e Q19 exigem resposta **Sim integral** para escapar do nível 1.

| Questão | Texto oficial resumido | Situação documentada | Falta para marcar “Sim” integral |
|---|---|---|---|
| Q1 | Política formal de segurança? | Minuta de política elaborada | Aprovar, assinar, divulgar e demonstrar vigência |
| Q2 | Avaliação periódica de riscos? | Primeira matriz de riscos documentada | Executar e registrar avaliações sucessivas |
| Q3 | Inventário atualizado de ativos? | Inventário inicial de sistemas centrais | Completar fornecedores, dispositivos e ativos físicos, designar dono e revisão |
| Q4 | Controle de acesso por perfis? | Supabase RLS e perfis administrativos auditados | Revisar integrações e coberturas |
| Q5 | Autenticação individualizada? | Supabase Auth e identidade única master | Cobertura de todas as pessoas/serviços e contas compartilhadas |
| **Q6** | **Autenticação forte?** | **MFA TOTP ativo e login real validado nos dois painéis oficiais, AAL2 no banco** | Abranger quaisquer acessos privilegiados externos/integrados que possam acessar dados do escopo SENATRAN |
| Q7 | Revisão periódica de acessos? | Revisão pontual e redução para administrador único | Rotina trimestral com histórico e aprovação |
| Q8 | Revoga acessos tempestivamente? | Revogadas as atribuições administrativas excedentes em 23/11 | Evidência de processo contínuo de desligamento/troca de função |
| Q9 | Dados em ambiente controlado? | Dois projetos Supabase produção em região identificada | Inventário de terceiros, dispositivos, exportações |
| **Q10** | **Criptografia em repouso?** | **Supabase declara AES-256 em repouso** | Cobrir exportações, dados fora do Supabase, backups e equipamentos |
| Q11 | Criptografia em trânsito? | `ssl=on` nos bancos e HTTPS nos domínios | Verificar TLS ponta a ponta das integrações externas |
| **Q12** | **Segregação de ambientes?** | **Credenciais produtivas retiradas do escopo de futuras prévias; SSO de prévias; CI local preparado** | Backend de homologação real e independente; E2E isolado aprovado; revisar antigos deployments |
| Q13 | Controle de cópias? | Política proposta | Inventariar exportações e rotinas de autorização, armazenamento e eliminação |
| Q14 | Política de retenção/descarte? | Procedimento minuta | Aprovação de prazos legais por categoria e execução comprovada |
| Q15 | Desenvolvimento seguro? | PRs, patches, RBAC e correções de dependências | Programa formal contínuo e validação dos serviços |
| Q16 | Testes de segurança? | Testes MFA / RPC em transação revertida; CI novo falhou | Cobertura sistemática automatizada e E2E de homologação |
| Q17 | Correção de vulnerabilidades? | Patches e revogações realizados e auditados | Processo com SLA, classificação e histórico |
| Q18 | Registra logs? | 89 registros em `admin_audit_logs` Entregas; 230 em `audit_logs` Corridas | Abranger incidentes, APIs, demais terceiros |
| **Q19** | **Protege logs?** | **RLS + MFA para leitura, grants anônimos e DML autenticado revogados** | Integridade/retencão/exportação protegida e demais fontes de logs |
| Q20 | Monitoramento? | Logs e dashboards disponíveis | Comprovar alertas ativos, métricas e responsável |
| Q21 | Realiza backups? | **Não comprovado. Free não inclui backup automático diário.** | Exportação cifrada recuperável real e cópia externa |
| Q22 | Testa restauração? | **Não comprovado** | Ata e evidências de recuperação real em ambiente isolado |
| Q23 | Plano de resposta a incidentes? | Minuta elaborada | Aprovação, responsáveis, exercícios |
| Q24 | Registra incidentes? | Modelo de registro elaborado | Implantar registro operacional, histórico e controles |
| Q25 | Plano de continuidade? | Minuta elaborada | Aprovação de RTO/RPO e simulado |
| Q26 | Registro de tratamento de dados? | ROPA inicial elaborada | Confirmar bases legais, prazos, controladores e terceiros |
| Q27 | Medidas para dados sensíveis? | RLS, MFA e criptografia do provedor | Mapear categorias legais e controles específicos |
| Q28 | Treinamentos? | Conteúdo proposto | Executar e guardar evidência de participação |

## Regras da metodologia do formulário original
- 7 eixos; 28 questões; respostas: **Sim = 1, Parcialmente = 0,5, Não = 0**.
- Nível 5: nota contínua ≥4,5 **e** “Sim” integral em Q5, Q6, Q7, Q10, Q11, Q12, Q18, Q19, Q21 e Q24.
- Independentemente da nota, **Q6, Q10, Q12 e Q19 são eliminatórias**; qualquer resposta diferente de Sim integral implica classificação 1.
- Sem comprovação da Q12 integral e das outras eliminatórias, **não é tecnicamente defensável afirmar nível 5 ou protocolar declaração integral**.
- Falta identificar responsável técnico, cargo, e-mail, telefone, data, local, assinatura, comprovações organizacionais e plano de restauração.

**Fonte:** Formulário de Avaliação do Nível de Maturidade em Segurança da Informação, versão 1.0, Portaria SENATRAN nº 139/2025, reproduzido apenas como matriz de trabalho.
