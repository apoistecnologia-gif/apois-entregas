# Política de Segurança da Informação — minuta para aprovação

**APOIS TECNOLOGIA E MOBILIDADE LTDA** · Versão proposta 1.1 · 23/11/2026  
**ESTADO:** MINUTA, não aprovada ou assinada. A aprovação e publicidade interna são necessárias antes de declarar a Q1 como integral.

### 1. Escopo e responsabilidades
Abrange administradores, parceiros, colaboradores, prestadores e fornecedores que tratam dados de passageiros, motoristas, entregadores, estabelecimentos, serviços financeiros e futuros dados recebidos da SENATRAN. A administração aprova; responsável técnico documenta execução; cada operador tem conta própria e treinamento pertinente.

### 2. Identidade e controle de acesso
- Contas administrativas nominalmente autorizadas, com privilégios mínimos e TOTP/MFA exigido em todas as operações privilegiadas.
- **Situação comprovada em 23/11/2026:** nos dois painéis oficiais, administrador único `master@apoisbrasil.com.br`, MFA verificado, verificações AAL2 ativas e login real testado.
- Revisão **trimestral** documentada de papéis e permissões, além de revisão em alteração de função e revogação imediata após desligamento; evidenciar responsável, data, perfis, diferenças, decisão e comprovação.
- Nunca compartilhar senha, QR de TOTP, chave secreta nem códigos. Manter dois métodos adequados de recuperação sob custódia segregada.

### 3. Segurança e desenvolvimento
- PR com revisão, checklist de segurança, gestão de dependências, testes automatizados, RLS nos dados, isolamento de segredos e revisão de funções SECURITY DEFINER.
- Proibir `service_role` e credenciais privadas em código executado pelo navegador, logs e capturas.
- Segregar produção, testes e desenvolvimento. É proibido copiar dados pessoais reais para homologação sem autorização específica, desidentificação e fundamento legal. Usar ambientes efêmeros e dados sintéticos.
- Não vincular builds de prévia a produção; projetos de prévia sem backend de testes ficam bloqueados por segurança.

### 4. Proteção e retenção de dados
- Usar HTTPS/TLS e criptografia em repouso; controlar exportações, backups e mídias removíveis.
- Manter inventário de dados, finalidade, base legal confirmada com responsável, acesso autorizado, período de retenção conforme obrigação aplicável e descarte seguro verificável.
- Dados de CPF, CNH, documentos, localização e outros dados pessoais não devem aparecer em mensagens de erro e logs desnecessários.
- Solicitações de titulares e notificações de incidentes seguem a LGPD e obrigações contratuais/legais aplicáveis.

### 5. Logs e incidentes
- Registrar autenticação, alterações de papéis, operações privilegiadas, erros e falhas de segurança relevantes.
- Logs de auditoria têm acesso restrito, proibição de modificação por usuários comuns, registros de integridade/retenção e exportação protegida onde necessário.
- Resposta a incidentes: detectar e registrar, classificar gravidade, isolar impacto, preservar prova, corrigir, comunicar autoridades/titulares quando exigível, e realizar análise de causa.
- Nomear ponto de contato e suplente e realizar simulado documentado pelo menos anualmente.

### 6. Backups e continuidade
- Implantar exportações recuperáveis **diárias** dos bancos críticos, criptografadas, armazenadas fora da infraestrutura produtiva com acesso mínimo e chave sob custódia segura.
- Proposta inicial sujeita a avaliação técnica: histórico diário de 7 dias + cópias semanais 4 semanas; validar restrições legais e capacidade de armazenamento.
- Testar restauração **trimestralmente** em banco não produtivo, validar integridade, volumes e tempo real de recuperação.
- Definir RPO/RTO e atendimento a parceiros em falhas de gateway, mapas, Supabase e Vercel.

### 7. Revisões, conformidade e treinamento
- Riscos avaliados trimestralmente e após incidentes; inventário de ativos revisado trimestralmente.
- Treinar equipe inicialmente e ao menos uma vez por ano em MFA, phishing, LGPD e incidentes; registrar presença e avaliação.
- Revisar a política anualmente ou após mudança tecnológica ou legal relevante.

**Aprovação pendente**
- Representante autorizado: ______________________________________
- Cargo e fundamento de representação: ____________________________
- Data de vigência: _______________ Assinatura: ____________________
- Responsável técnico (art. 22, III): ______________________________

A existência desta minuta não comprova aprovação formal, treinamento ou implantação universal das medidas.
