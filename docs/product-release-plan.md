# Separação e release dos produtos APOIS ENTREGAS

Este documento registra o estado real de preparação para lançamento da APOIS ENTREGAS.

## Escopo correto

A APOIS ENTREGAS não é entregue como um único site com menus internos. O ecossistema possui quatro produtos distintos, todos usando exclusivamente o backend oficial Supabase `sbvhdgyuuperszlsllji`:

1. **APOIS Cliente** — aplicativo mobile do cliente.
2. **APOIS Entregador** — aplicativo mobile do entregador.
3. **APOIS Estabelecimento** — painel web do restaurante/loja.
4. **APOIS Administração** — painel web administrativo da operação.

Nenhum recurso da APOIS CORRIDAS faz parte deste projeto.

## Isolamento de produto

A aplicação suporta `VITE_APOIS_PRODUCT_MODE` com os modos:

- `customer`
- `courier`
- `merchant`
- `admin`

A shell, a entrada e os redirecionamentos de autenticação respeitam o produto configurado. Os workspaces incompatíveis são bloqueados para impedir que os quatro produtos sejam entregues apenas como rotas navegáveis de uma mesma experiência.

## Builds independentes

Os quatro builds são gerados separadamente:

```sh
bun run build:customer
bun run build:courier
bun run build:merchant
bun run build:admin
```

O CI valida cada saída isolada, além de auditoria de segurança do repositório, typecheck, testes, lint e formatação.

## Android — Cliente e Entregador

O empacotamento Android via Capacitor está implementado no workflow `Mobile Android`.

Identidades nativas:

- Cliente: `br.com.apois.cliente`
- Entregador: `br.com.apois.entregador`
- `versionCode`: `1`
- `versionName`: `1.0.0`

Permissões atualmente exigidas:

- `INTERNET`
- `ACCESS_COARSE_LOCATION`
- `ACCESS_FINE_LOCATION`

O workflow valida explicitamente que não sejam adicionadas silenciosamente permissões de localização em background, câmera ou armazenamento externo. `usesCleartextTraffic` permanece desabilitado.

O build também configura nome, ícone adaptativo e splash da identidade APOIS.

### Artefatos

Sem credenciais de assinatura, o workflow produz somente artefatos de homologação/empacotamento:

- `app-debug.apk`
- `app-release-unsigned.aab`

Um AAB unsigned **não é artefato final de Play Store**.

Com todos os secrets de assinatura presentes, o workflow passa a exigir configuração de runtime real, gera `app-release-signed.aab` e valida a assinatura com `jarsigner -verify -strict`.

O artifact inclui um manifesto contendo produto, SHA do commit, package ID, versão, flag de assinatura, tamanho e SHA-256 dos binários.

## Assinatura Android

A assinatura de produção não deve ser versionada. Cada app usa uma keystore própria.

Secrets do Entregador:

- `ANDROID_COURIER_KEYSTORE_BASE64`
- `ANDROID_COURIER_STORE_PASSWORD`
- `ANDROID_COURIER_KEY_ALIAS`
- `ANDROID_COURIER_KEY_PASSWORD`

Secrets do Cliente:

- `ANDROID_CUSTOMER_KEYSTORE_BASE64`
- `ANDROID_CUSTOMER_STORE_PASSWORD`
- `ANDROID_CUSTOMER_KEY_ALIAS`
- `ANDROID_CUSTOMER_KEY_PASSWORD`

A keystore e suas senhas precisam existir também em backup seguro fora do GitHub. Perder a chave de upload sem um processo de recuperação adequado pode impedir futuras atualizações do aplicativo.

## Configuração de runtime mobile

O build Android usa a URL oficial do Supabase e a publishable key pública do projeto APOIS ENTREGAS.

Os mapas internos dependem de configuração real de Google Maps:

- `VITE_GOOGLE_MAPS_BROWSER_KEY`
- `VITE_GOOGLE_MAPS_MAP_ID`

Como o Capacitor usa `androidScheme: "https"`, a chave do Maps deve ser configurada de forma compatível com a origem do WebView e com as APIs realmente utilizadas pelo aplicativo. Um build assinado é bloqueado se esses valores ainda forem placeholders.

## Painéis web

`merchant` e `admin` já possuem builds isolados e podem ser implantados separadamente em infraestrutura web compatível com a saída TanStack Start do projeto.

A publicação final ainda exige:

- destino de hospedagem definido;
- domínio/subdomínio de cada painel;
- variáveis de ambiente reais no provedor de hospedagem;
- HTTPS;
- smoke test no domínio publicado.

Compilar com sucesso não equivale a estar publicado.

## Backend e segurança

O backend oficial continua sendo o Supabase `sbvhdgyuuperszlsllji`.

A preparação atual inclui, entre outros controles:

- RLS nas tabelas públicas sensíveis;
- Storage privado para documentos;
- RPCs autoritativas para operações críticas;
- aceite atômico de oferta de entrega;
- state machine para pedido e entrega;
- PIN de confirmação de entrega;
- idempotência de pedidos, pagamentos, webhooks e saques;
- cálculo/lançamento financeiro no backend;
- logs administrativos;
- Realtime operacional;
- Edge Functions para criação de pedido, PIX, webhook, estorno e serviços relacionados.

Nenhum preço, pagamento aprovado, autorização administrativa, atribuição de entregador, saldo ou saque deve depender apenas do frontend.

## Pagamentos

O gateway existente é Mercado Pago e deve ser preservado.

O ambiente somente pode ser declarado homologado para produção quando:

1. `mercado_pago_environment` estiver em `production`;
2. credenciais de produção estiverem configuradas no Supabase;
3. um pagamento real controlado for criado;
4. o webhook real confirmar o pagamento;
5. o pedido refletir a confirmação autoritativa;
6. cancelamento/estorno aplicável for validado.

Enquanto o ambiente estiver em `test`, não declarar pagamentos prontos para produção.

## Gates obrigatórios antes de declarar “pronto para produção”

### Cliente

- autenticação e sessão;
- perfil e endereços;
- localização e área atendida;
- estabelecimentos, cardápio e adicionais;
- carrinho, cupom e checkout;
- PIX real de produção;
- criação autoritativa do pedido;
- webhook e Realtime;
- acompanhamento, histórico e avaliação;
- teste físico do APK/AAB final em aparelho real.

### Entregador

- cadastro e documentos;
- aprovação administrativa;
- online/offline;
- GPS em aparelho real;
- ofertas e aceite atômico;
- retirada, coleta e rota;
- PIN e confirmação da entrega;
- ganhos, carteira e saque;
- histórico e suporte;
- teste físico do APK/AAB final em aparelho real.

### Estabelecimento

- autenticação/autorização;
- dashboard;
- pedidos Realtime;
- aceitar/recusar, preparar e marcar pronto;
- cardápio e adicionais;
- horários e promoções;
- financeiro, avaliações, clientes e relatórios;
- configurações;
- deploy independente e smoke test no domínio final.

### Administração

- autenticação administrativa;
- dashboard;
- pedidos, clientes, estabelecimentos e entregadores;
- aprovações;
- cidades, zonas e taxas;
- pagamentos, financeiro e saques;
- suporte, avaliações e operações em tempo real;
- configurações e auditoria;
- deploy independente e smoke test no domínio final.

## Definição de release candidate

Somente considerar release candidate quando, ao mesmo tempo:

- CI estiver verde;
- os quatro builds isolados estiverem verdes;
- Cliente e Entregador tiverem `app-release-signed.aab` reais e assinatura validada;
- configuração de Maps estiver real;
- Mercado Pago estiver em produção e homologado com transação controlada;
- os dois painéis web estiverem publicados separadamente;
- os fluxos críticos tiverem sido homologados ponta a ponta;
- não houver mocks substituindo integrações produtivas.
