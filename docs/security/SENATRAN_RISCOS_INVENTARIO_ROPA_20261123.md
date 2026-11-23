# APOIS — Registro inicial de riscos, ativos e operações de tratamento
**Emissão:** 23/11/2026. Documento técnico inicial, não inventário completo/ROPA aprovado.

## 1. Inventário de ativos verificados
| Ativo | Identificação | Função / Ambiente | Estado na auditoria |
|---|---|---|---|
| GitHub Entregas | apoistecnologia-gif/apois-entregas | Código / CI / branches | acessível; branch oficial fix/apois-paineis-oficiais-20261113 |
| GitHub Corridas | apoistecnologia-gif/movvi-go-connect | Código / CI / mobile | acessível; branch oficial fix/apois-corridas-oficial-20261113 |
| Supabase Entregas | ptgkwyyolrdgnqketkjj | PostgreSQL/Auth/Storage produção | ACTIVE_HEALTHY, sa-east-1 |
| Supabase Corridas | tbbzkrfupmqdywnzgnms | PostgreSQL/Auth/Storage produção | ACTIVE_HEALTHY, sa-east-1 |
| Vercel Entregas | prj_KjPKn2tXBIqxqCNzRxInuVXLLxNO | admin.apoisbrasil.com.br | deploys de produção e Preview |
| Vercel Corridas | prj_hQLbIy31b8lbvhQU0iz6U6u38Srq | admin-corridas.apoisbrasil.com.br | deploys de produção e Preview |
| Supabase Storage Entregas | 6 buckets: 3 privados, 3 públicos | Documentos, suporte, imagens | inventariar permissões por objeto |
| Supabase Storage Corridas | 8 buckets: 7 privados, 1 público | Documentos, selfies, fotos, provas | inventariar permissões por objeto |
| GitHub Actions Corridas | postgres:16, apois_test | teste efêmero de esquema | workflow identificado; execução ainda falhou |
| Vercel Preview | apois-preview-isolado-sem-backend.invalid | negação de backend real | não é homologação funcional |
Integrações de mapas, pagamentos, Firebase, domínio, dispositivos e contas de fornecedores ainda precisam de levantamento específico.

## 2. Riscos iniciais, estimados (P x I de 1 a 5)
| ID | Risco | P | I | Medida / situação |
|---|---|---:|---:|---|
| R1 | Homologação sem banco funcional isolado, referência legada e função remota de Corridas | 4 | 5 | Q12 em PR draft; validar mobile/SSR |
| R2 | Supabase Free não executa backup diário automático | 4 | 5 | Implantar cópias criptografadas e restauração de teste |
| R3 | Logs principais sem retenção automatizada identificada | 4 | 4 | Definir prazo, integridade, monitoramento externo |
| R4 | Security Advisor sinaliza RPCs SECURITY DEFINER executáveis por anônimo | 4 | 5 | Auditar função a função; correção administrativa específica já aplicada em Corridas |
| R5 | Buckets públicos e privados com classificações distintas | 3 | 5 | Revisar exposição real e políticas Storage |
| R6 | Ausência de aprovação formal, nomeação técnica e registros de capacitação | 4 | 4 | Formalizar responsabilidades, reuniões e ciência |
| R7 | Execução de GitHub Actions falha sem evidência de jobs aprovados | 3 | 3 | Validar limites e executar CI |
Riscos estimados para priorização, não substituem avaliação de risco aprovada. Revisão inicial ocorreu em 23/11/2026; próxima revisão proposta até 23/02/2027, condicionada à decisão da direção.

## 3. Registro de operações de tratamento (ROPA) — levantamento inicial
| Operação | Titulares e dados possíveis | Finalidade | Fontes conhecidas | Lacunas |
|---|---|---|---|---|
| Cadastro/autenticação | usuários e parceiros; identidade, e-mail, telefone, fatores MFA | Acesso e prestação de serviço | Supabase Auth/Postgres | bases legais, prazos e fornecedores |
| Corridas | passageiros e motoristas; rotas, localização, histórico | Execução do transporte | Corridas PostgreSQL/Maps | retenção, compartilhamentos |
| Entregas | clientes, lojas e entregadores; endereço, pedido, status | Execução das entregas | Entregas PostgreSQL | suboperadores, prazos |
| Pagamento e repasse | usuários e parceiros; transações e identificadores financeiros | Cobrança e conciliação | tabelas financeiras e provedores | contratos, retenção |
| Identificação documental | motoristas e entregadores; CNH/foto/veículo | Elegibilidade e segurança | Buckets privados de Storage | minimização, prazos e acesso |
| Auditoria e suporte | usuários e equipe; atividades, protocolos | Segurança, defesa de direitos | logs Postgres e anexos | retenção e monitoramento |
Este ROPA é parcial: falta validar controlador, encarregado, base legal por operação, transferência internacional, destinatários, prazo e direitos dos titulares.

**Aceite do responsável técnico e da direção:** pendente.
