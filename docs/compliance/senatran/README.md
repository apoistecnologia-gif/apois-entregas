# APOIS — Programa de adequação à Portaria SENATRAN nº 139/2025

**Organização:** APOIS TECNOLOGIA E MOBILIDADE LTDA — CNPJ 68.290.710/0001-37.  
**Data-base da verificação:** 23/11/2026.  
**Escopo técnico comprovado:** painéis de administração de Corridas e Entregas, dois bancos Supabase de produção, repositórios GitHub e respectivos projetos Vercel.  
**Situação:** documentos de apoio, **não são declaração de conformidade certificada**.

Este diretório preserva os controles executados, evidências observadas, pendências e minutas de governança. O responsável técnico legalmente habilitado deverá completar os campos, validar a abrangência de todas as integrações e assinar o formulário oficial.

## Quatro requisitos eliminatórios do formulário

- **Q6 — MFA:** conta administrativa única `master@apoisbrasil.com.br` nos dois bancos, autenticadores TOTP verificados, autenticação AAL2 ativa nos caminhos administrativos inspecionados e teste real pós-ativação realizado nos domínios oficiais. **Ainda verificar integrações e outros acessos de dados da SENATRAN.**
- **Q10 — Criptografia em repouso:** Supabase publica AES-256 para os dados hospedados na plataforma; os dois projetos reais são Supabase. **Inventariar exportações, dispositivos e outros provedores antes de declaração integral.**
- **Q12 — Segregação:** variáveis Supabase de novas prévias Vercel substituídas por endpoints inertes; produção preservada; acesso às prévias restrito por autenticação Vercel. Teste de banco efêmero em CI preparado mas execução inicial não comprovada. **Backend de homologação funcional independente ainda não provisionado.**
- **Q19 — Logs protegidos:** `admin_audit_logs` (Entregas) e `audit_logs` (Corridas) com RLS, leitura administrativa sob MFA e privilégios anônimos retirados. `authenticated` não pode INSERT/UPDATE/DELETE por grants. **Comprovar proteção e retenção em todas as demais fontes de logs, inclusive serviços externos.**

**ATENÇÃO:** a versão 1.0 do formulário determina **nível 1** caso qualquer Q6, Q10, Q12 ou Q19 não seja integralmente atendida. Não marcar “Sim” enquanto o requisito completo não estiver implementado e em operação.

## Evidências consultáveis

- GitHub APOIS Entregas: `apoistecnologia-gif/apois-entregas`. PR MFA oficial nº 10, revogações de administrador/DDL no Supabase e PRs de registro nº 11 e de CI nº 12.
- GitHub APOIS Corridas: `apoistecnologia-gif/movvi-go-connect`. PR MFA oficial nº 7, registro de privilégios nº 8, CI isolado nº 9.
- Projetos Supabase de produção na região `sa-east-1`: Entregas `ptgkwyyolrdgnqketkjj`, Corridas `tbbzkrfupmqdywnzgnms`.
- Painéis oficiais: `admin.apoisbrasil.com.br` e `admin-corridas.apoisbrasil.com.br`. Não utilizar prévias para alterar dados reais.
- Fonte primária: formulário "FORMULÁRIO PARA AVALIAÇÃO DO NÍVEL DE MATURIDADE EM SEGURANÇA DA INFORMAÇÃO", versão 1.0, 28 questões.

## Responsáveis e aprovações pendentes

- Responsável técnico, formação compatível (art. 22, III), cargo, e-mail e telefone: **NÃO DOCUMENTADOS**.
- Aprovação e assinatura da Política de Segurança: **PENDENTES**.
- Evidências de treinamentos concluídos, restauração real de backup e homologação com banco independente: **PENDENTES**.
- A descrição de um controle proposto não comprova execução. Arquivos de planejamento não equivalem a requisito integralmente atendido.
