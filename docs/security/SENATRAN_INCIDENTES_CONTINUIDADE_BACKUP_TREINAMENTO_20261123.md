# APOIS — Planos operacionais iniciais e registros pendentes
**Versão de trabalho:** 23/11/2026. A criação dos procedimentos não equivale a execução de testes ou aprovação.

## 1. Resposta a incidentes
1. Identificar o evento (autenticação, privilégio, dados, integridade, fraude, indisponibilidade).
2. Registrar protocolo com data, hora, sistema, sinal, fonte, responsável e evidência sem copiar PII para tickets públicos.
3. Classificar gravidade e conter: bloquear acesso/rotacionar credenciais mediante análise de impacto; preservar logs e cadeia de custódia.
4. Investigar causa, promover correção em branch e testar regressão/rollback.
5. Confirmar recuperação, inclusive MFA, permissões, rastreabilidade e reconciliação de transações.
6. Verificar comunicação legal/contratual a ANPD, titulares, fornecedores e autoridades segundo o incidente concreto.
7. Encerrar com relatório de impacto, ações e revisão de risco.
**Pendências:** canal de acionamento, nomeação do gestor, sistema de registro e simulado; nenhum incidente real ou treino é atestado.

## 2. Continuidade de negócios
Prioridade: autenticação, solicitações de corridas/entregas, despacho, pagamentos, painéis e atendimento. Em indisponibilidade, congelar releases, identificar dependência e restaurar deploy reversível; perda de banco exige backup verificado em ambiente separado antes de ação destrutiva. Medir RTO/RPO e reconciliar eventos financeiros/operacionais. RPO/RTO **a definir**; nenhum resultado de exercício de recuperação foi validado nesta auditoria.

## 3. Backups e restauração
**Estado:** Supabase Free não inclui backups diários automáticos; nenhuma cópia integral criptografada off-site foi demonstrada. Procedimento planejado:
- Exportar PostgreSQL 17 com pg_dump ou Supabase CLI, por conexão autorizada, sem imprimir chaves.
- Exportar objetos binários do Storage separadamente: backup de BD só abrange metadados.
- Criptografar com chave armazenada fora do próprio arquivo e registrar SHA-256, data, projeto e custódia.
- Manter cópias fora da produção e limitar acesso; configurar periodicidade após escolher meio/custos.
- Testar restauração em host isolado, com integridade de esquema, objetos e verificações de aplicação; documentar resultado.
- Nunca executar recuperação diretamente sobre produção sem autorização, janela e plano de reconciliação.
Sem acesso a credenciais de exportação e armazenamento criptografado aprovado, Q21/Q22 não têm evidência de atendimento.

## 4. Retenção e descarte
Categorias: cadastro, documentos de identificação, corridas, entregas, transações, logs, cópias de segurança e solicitações de titulares. Para cada uma, registrar base legal, prazo, início da contagem, condição de suspensão e descarte. **Prazos não aprovados**: proibido expurgo automático e deleção de evidências de litígios ou obrigações legais sem validação jurídica.

## 5. Revisões de acesso e conscientização
Conta administradora declarada: master@apoisbrasil.com.br; os dois bancos registram enforce_aal2=true em 23/11/2026. Revisão proposta trimestral em Supabase/GitHub/Vercel/fornecedores; registrar conta, cargo, privilégio, decisão, responsável, data, mudança e prova. Curso inicial e anual: MFA/phishing, LGPD, backup, incidentes, ambientes, segredos, engenharia social e segurança de dispositivos. **Nenhuma lista de presença/treinamento concluído foi apresentada**.

## 6. Aprovação
Responsável técnico nome __________________, cargo __________________, e-mail __________________, telefone __________________.
Representante legal __________________, aprovação/data ____/____/____. Até assinatura e execução, controles organizacionais estão em fase de implementação.
