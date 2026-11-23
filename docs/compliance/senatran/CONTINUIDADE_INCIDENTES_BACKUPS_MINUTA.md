# Procedimentos de segurança: incidentes, continuidade e backup

**APOIS — versão proposta 1.0 | 23/11/2026 | Aguardando aprovação e validação prática.**

## A. Registro e resposta a incidentes — Q23 e Q24
1. Receber alerta via suporte, monitoração, operações, provedor ou colaborador; registrar identificador, hora, sistema, fonte e relato sem copiar segredos ou dados desnecessários.
2. Classificar (crítico: comprometimento de contas privilegiadas ou exposição significativa; alto: vazamento limitado/interrupção; médio: impacto controlado; baixo: suspeita sem impacto confirmado). Revisar o critério com o responsável técnico.
3. Em incidente crítico, impedir propagação, revogar credenciais e sessões afetadas, preservar logs e snapshots íntegros; nunca apagar registros de investigação.
4. Registrar decisões, responsáveis, ações e horário; avaliar comunicações exigíveis a titulares, ANPD, órgãos e provedores, conforme análise jurídica e prazo legal aplicável.
5. Encerrar somente com causa raiz, correção, teste e análise de recorrência.

**Modelo de ocorrência:** ID | hora detecção | pessoa responsável | ativos | tipo | descrição mínima | impacto | medidas | terceiros informados | fechamento | prova.  
**Situação em 23/11/2026:** modelo criado. Não há comprovação de inventário histórico completo de incidentes ou simulado anual.

## B. Continuidade de negócios — Q25
- Dependências críticas: Supabase Auth/Postgres/Storage, Vercel e DNS, mapas e rotas, processadores de pagamento, canais de suporte, conectividade e dispositivos.
- Paralisação de Corridas/Entregas: sinalizar indisponibilidade, impedir operações incompletas ou duplicadas, conservar eventos transacionais e orientar equipe e parceiros.
- Recuperação: identificar último estado íntegro, validar dependências, restaurar em ambiente separado, executar testes, liberar gradativamente, documentar conclusão e conciliar transações.
- **RTO e RPO:** pendentes de definição e aprovação conforme impacto de indisponibilidade e perda de dados.
- Simulado: planejar, executar, guardar logs e resultados, corrigir falhas.

## C. Backups e restauração — Q21 e Q22

### Situação observada
Projetos Supabase Free **não oferecem backup automático diário**. Ter a base funcionando não é evidência de cópia recuperável. Sem um export real e teste de restauração não se pode marcar Q21/Q22 como implementados integralmente.

### Procedimento operacional proposto, sem contratar plano
1. Obter credenciais de leitura/exportação apropriadas pelo console oficial; armazenar unicamente em cofre de segredos e nunca em repositório/código/ChatGPT.
2. Executar `supabase db dump` ou `pg_dump` seguro por canal TLS, em máquina controlada, com transações consistentes; incluir esquema e dados que a solução realmente necessita, observando limitações de usuários Auth, Storage e segredos externos.
3. Cifrar o arquivo **antes de transferir** com chave mantida separada e fora do provedor; registrar hash SHA-256 e data/hora.
4. Guardar cópia cifrada fora da infraestrutura de produção, com acesso mínimo, prazo de retenção aprovado e trilha de acesso.
5. **Testar restauração** em banco isolado, sem escrita na produção; registrar quantidade de tabelas/linhas, checksums, integridade, login de teste, fluxos críticos e tempo real.
6. Invalidar e eliminar exportações não protegidas, atualizar inventário e registrar resultado em ata assinada.

**Preparação técnica em GitHub:** workflow manual `.github/workflows/senatran-backup-manual.yml`, que só poderá executar após configuração segura dos segredos `APOIS_ENTREGAS_BACKUP_DATABASE_URL`, `APOIS_CORRIDAS_BACKUP_DATABASE_URL` e da variável pública `APOIS_BACKUP_AGE_RECIPIENT`. Ele exporta, valida a lista do dump e envia ao artefato privado **somente o arquivo criptografado age** e seu SHA-256 (retenção de 7 dias); não realiza restauração integral nem constitui backup ativo enquanto não for executado com sucesso. **NUNCA** publicar chave privada de desencriptação ou credenciais no chat ou no repositório.

**Ainda não executado/verificado:** exportação cifrada real e restauração completa. Não usar esta minuta como se fosse relatório de execução.

## D. Registro de retenção e descarte — Q14
Para cada conjunto de dados, aprovar: finalidade, necessidade, regra legal de retenção, responsável, formato, destino da cópia, prazo, método de descarte verificável e tratamento de litígios (legal hold). Proposta operacional: acesso aos logs administrativos somente sob MFA, retenção conforme risco e prazo legal a aprovar; não inventar prazos fixos antes da análise LGPD.

## E. Treinamento — Q28
**Plano inicial:** sessão de 60 minutos sobre MFA, recuperação de contas, phishing, proteção de dados pessoais e resposta a incidentes; questionário de compreensão; lista de presença e ata.  
**Situação:** conteúdo proposto. A realização, presença e avaliação não foram comprovadas.

## F. Aprovação do responsável técnico
Responsável técnico: ___________________________________ Formação/cargo: ______________________  
Data: ______________ Assinatura: ____________________________________________________
