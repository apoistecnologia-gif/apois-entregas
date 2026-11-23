# SENATRAN Q21/Q22 — Ferramentas gratuitas de backup criptografado

Scripts: `scripts/security/backup-postgres-encrypted.sh` e `scripts/security/validate-postgres-encrypted-backup.sh`.

**Estado:** código criado e checado quanto à sintaxe/falha segura. Backup de produção NÃO foi executado: faltam senha de conexão PostgreSQL disponibilizada via ambiente seguro, chave pública `age`, certificado CA, diretório externo de custódia e ambiente de restauração; nenhuma dessas credenciais deve ser gravada no GitHub. Os scripts não fazem backup dos objetos binários do Supabase Storage. Portanto Q21/Q22 permanecem NÃO COMPROVADAS.

## Execução controlada

1. Instalar CLI PostgreSQL compatível com o servidor, `age` e `sha256sum` numa máquina autorizada, com disco criptografado.
2. Definir variáveis `APOIS_BACKUP_PROJECT` (entregas/corridas), `APOIS_BACKUP_DIRECTORY` (fora do repositório, fora de produção), `APOIS_BACKUP_RECIPIENT` (chave pública age), `APOIS_DB_HOST`, `APOIS_DB_USER`, `APOIS_DB_PASSWORD`, `PGSSLROOTCERT` (CA de confiança). Não registrar senhas/DSN em terminal ou histórico.
3. Executar script e verificar artefato `.pgdump.age` e hash `.sha256`. A fonte é aceita apenas se corresponder a um dos dois projetos oficiais.
4. Exportar também todos os objetos do Storage em mecanismo criptografado aprovado pela direção; não confundir dump do banco com cópia de arquivos.
5. Executar o segundo script usando a chave privada de recuperação mantida fora do repositório para verificar a decodificação do arquivo.
6. Restaurar em banco **independente de produção**, com acesso mínimo, e verificar esquema, dados, Auth e Storage; registrar evidências e destruir a cópia de teste após o período de validação.
7. Definir RPO/RTO, retenção, periodicidade e procedimento de continuidade por aprovação formal.

**Limites:** um `pg_dump` com `--no-owner --no-acl` não preserva todos os papéis globais, concessões nem objetos binários. Uma saída "ARCHIVE_READABLE=yes" não equivale a restauração validada. Não realizar sobreescrita em produção.
