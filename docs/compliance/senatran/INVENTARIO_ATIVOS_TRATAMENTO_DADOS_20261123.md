# Inventário inicial de ativos e operações de tratamento — 23/11/2026

**Versão inicial incompleta:** requer levantamento físico e revisão de todas as integrações e prestadores. Não expor senhas, CPF, documentos, tokens nem chaves neste inventário.

## Ativos confirmados

| Ativo | Finalidade | Categoria de dados | Ambiente | Controle observado |
|---|---|---|---|---|
| Supabase Entregas `ptgkwyyolrdgnqketkjj` | Auth, Postgres, Storage, operações de entrega | Dados operacionais, usuários, estabelecimentos e entregadores | Produção `sa-east-1` | RLS; `ssl=on`; MFA administrativo `aal2`; logs restritos |
| Supabase Corridas `tbbzkrfupmqdywnzgnms` | Auth, Postgres, Storage, operações de corridas | Usuários, motoristas, corridas e dados de localização | Produção `sa-east-1` | RLS; `ssl=on`; MFA administrativo `aal2`; logs restritos |
| Vercel `apois-admin` | Painel administrativo Entregas | Acesso administrativo autenticado | Produção | MFA Supabase e aplicação oficial |
| Vercel `apois-corridas-admin` | Painel administrativo Corridas | Acesso administrativo autenticado | Produção | MFA Supabase e aplicação oficial |
| Vercel `apois-corridas-admin-homologacao` | Prévia visual e testes | **Somente dados sintéticos previstos** | Prévia isolada | SSO Vercel; novas variáveis de conexão para backend inerte |
| GitHub `apoistecnologia-gif/apois-entregas` | Código, CI, migrações e documentação | Metadados de desenvolvimento e histórico | Repositório privado | PRs e branch oficial |
| GitHub `apoistecnologia-gif/movvi-go-connect` | Código, CI, migrações e documentação | Metadados de desenvolvimento e histórico | Repositório privado | PRs e branch oficial |

## Outros ativos a validar
Serviços de mapas, pagamento, SMS/e-mail, APIs de terceiros, notebooks, celulares e aparelhos usados por colaboradores, hospedagem do site público, serviços de suporte e armazenamento de cópias ou capturas de dados. Necessário identificar entidade contratada, localização, propósito, retenção e responsáveis.

## Controle de acessos administrativos — revisão pontual
- `master@apoisbrasil.com.br`: única conta administradora nos dois ambientes de produção, ativa e com TOTP verificado em cada projeto.
- Entregas: outras três atribuições `admin` removidas, preservando demais papéis quando aplicáveis.
- Corridas: dois antigos perfis administrativos desativados e rebaixados a `reader`; restrição única impede novo administrador não planejado.
- **Próxima revisão proposta:** 23/02/2027 e toda vez que houver desligamento, troca de funções ou incidente.
- Confirmação por responsável e assinatura: __________________________________________________

## Registro inicial de tratamento de dados (ROPA) — validar com jurídico/encarregado

| Processo | Categorias | Finalidade | Base legal e prazo de retenção |
|---|---|---|---|
| Cadastro de clientes/passageiros | Identificação, contato, endereço, dados de uso | Criar conta e prestar serviço | **A definir por responsável legal**, conforme finalidade e contrato |
| Cadastro de motoristas/entregadores | Identificação e documentos profissionais/veiculares | Verificação e execução de serviços | **A confirmar** |
| Despacho, localização e histórico de corridas/entregas | Localizações, eventos, datas, identificadores | Prestação e segurança do serviço | **A confirmar** |
| Pagamentos e repasses | Dados financeiros, chaves de transação e referências de provedores | Cobrança, repasse e conciliação | **A confirmar** |
| Segurança, logs e incidentes | IDs, endereços IP e eventos de acesso | Segurança e auditoria | **A confirmar** |
| Consultas ou informações futuramente fornecidas pela SENATRAN | Dados estritamente necessários à finalidade autorizada | Finalidade específica do instrumento de autorização | **A confirmar após autorização**, com controle de acesso e finalidade |

**Campos faltantes:** controlador/operador, país, operadores subcontratados, compartilhamentos, bases legais efetivas, titulares, necessidade e proporcionalidade, retenção/descarte, medidas para dados sensíveis e atendimento a direitos LGPD.
