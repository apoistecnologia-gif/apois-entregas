# APOIS — Política e procedimentos de Segurança da Informação (minuta 1.0)

**Organização:** APOIS TECNOLOGIA E MOBILIDADE LTDA | **CNPJ:** 68.290.710/0001-37
**Data:** 23/11/2026 | **Estado:** proposta para aprovação do representante legal; não atesta implementação já concluída.

## 1. Abrangência, governança e responsabilidades

A política aplica-se a APOIS Entregas, APOIS Corridas, bancos, interfaces, repositórios, dispositivos e prestadores autorizados. A direção deve nomear responsável técnico (art. 22, III, Portaria SENATRAN 139/2025), custodiante dos dados e responsáveis por incidentes, acesso, continuidade e LGPD. A aprovação deve ser datada e assinada, divulgada à equipe com ciência registrada e revisada ao menos anualmente ou após incidente/material mudança.

## 2. Identificação, acesso e autenticação

Cada operador terá conta individual, menor privilégio e revisão trimestral; revogação imediata mediante desligamento ou suspeita. Administradores utilizarão segundo fator e autenticação AAL2. A conta atualmente autorizada como única administradora dos dois painéis é master@apoisbrasil.com.br, sujeita à revisão no GitHub, Vercel, Supabase e serviços terceiros. Credenciais não devem ser compartilhadas ou incluídas em código, artefatos e logs.

## 3. Proteção de dados e ambientes

Dados de produção não podem ser usados em Preview, homologação, CI ou desenvolvimento sem procedimento autorizado e desidentificação. Cada ambiente deve usar credenciais e banco específicos; o build deve falhar ao apontar Preview a produção. Dados em trânsito usarão TLS; armazenamento deverá ter criptografia, acesso mínimo, classificação e inventário de buckets privados e públicos. Não expor service-role em variáveis VITE_*. Controlar exportações, cópias, backups e destinos.

## 4. Desenvolvimento e vulnerabilidades

Mudanças exigem branch, revisão de código, análise de dependências, testes, aprovação e rollback. Não desabilitar MFA, RLS, TLS, auditoria ou validações apenas para viabilizar build. Vulnerabilidades devem ser registradas e priorizadas segundo severidade; exceções precisam de aceite escrito com prazo.

## 5. Logs, monitoramento e incidentes

Logs de segurança devem preservar identidade, ação, alvo, instante, resultado e correlação. A leitura deve obedecer autorização; alterações e exclusões diretas dos registros principais devem ser impedidas. Definir retenção legal, exportação protegida, verificação de integridade e alertas efetivamente monitorados. Incidentes devem ser classificados, contidos, investigados, comunicados quando obrigatório e encerrados com evidência e lições aprendidas.

## 6. Backup e continuidade

Definir RPO/RTO por processo; obter backup criptografado e armazenado fora da produção incluindo objetos de Storage (não apenas banco); comprovar restauração controlada trimestral. Não restaurar sobre produção sem autorização e reconciliação de transações. Documentar procedimento de rollback e contingência de pagamentos.

## 7. Retenção, descarte, privacidade e conscientização

Definir tabela de retenção por categoria: cadastros, documentos, corridas/entregas, transações, logs e cópias. Prazos serão aprovados após análise jurídica e contratual; não executar expurgo indiscriminado. Manter registro de operações de tratamento (LGPD, art. 37), controlar compartilhamentos e pedidos de titulares. Treinamento no ingresso e ao menos anual, com lista de presença e avaliação.

## 8. Revisões planejadas

Inventário e avaliação de riscos: trimestral. Acessos: trimestral e sob evento. Segurança de dependências: mensal e por release. Recuperação: teste trimestral. Treinamento: anual. Revisões futuras **não são evidência de execução passada**.

**Aprovação pendente:** representante legal __________________ | Cargo __________________ | Data ****/****/____ | Assinatura __________________
