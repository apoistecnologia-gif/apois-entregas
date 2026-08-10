# Separação dos produtos APOIS ENTREGAS

Este documento registra a correção de arquitetura necessária para o lançamento real da APOIS ENTREGAS.

## Estado correto de produto

A APOIS ENTREGAS não deve ser tratada como um único site com menus internos. O ecossistema precisa sair em quatro produtos distintos, todos usando o mesmo backend oficial Supabase `sbvhdgyuuperszlsllji`:

1. **APOIS Cliente** — aplicativo mobile do cliente.
2. **APOIS Entregador** — aplicativo mobile do entregador.
3. **APOIS Estabelecimento** — painel web do restaurante/loja.
4. **APOIS Administração** — painel web administrativo da operação.

## Correção já aplicada no código

A aplicação passou a suportar `VITE_APOIS_PRODUCT_MODE`:

- `customer` abre a experiência do cliente.
- `merchant` abre diretamente o workspace `/merchant`.
- `courier` abre diretamente o workspace `/courier`.
- `admin` abre diretamente o workspace `/admin`.

Com isso, cada deploy pode nascer com a entrada correta. O login também deixa de mandar todo mundo para `/inicio`; quando não há `redirect` seguro na URL, ele envia o usuário para o workspace do produto configurado.

## Builds separados

O helper abaixo injeta o modo de produto sem alterar dependências nem lockfile:

```sh
node scripts/build-product.mjs customer
node scripts/build-product.mjs merchant
node scripts/build-product.mjs courier
node scripts/build-product.mjs admin
```

Esses comandos não mudam o backend. Eles apenas geram o frontend com o modo de produto correto.

## Pendência P0: mobile nativo

O entregador já possui fluxo funcional dentro da rota `/courier`: cadastro, documentos, aprovação, online/offline, GPS, ofertas, aceite/rejeição, ciclo da entrega, PIN, carteira, saque, perfil e histórico.

Mesmo assim, isto ainda não equivale a APK/AAB/IPA. Para o app do entregador ficar realmente publicável, ainda falta criar a etapa nativa:

- Capacitor Android/iOS ou projeto mobile equivalente.
- Package ID próprio, por exemplo `br.com.apois.entregador`.
- Ícone, splash, nome de app e permissões nativas.
- Permissões de localização em foreground/background conforme política das lojas.
- Build assinado Android AAB/APK.
- Preparação iOS quando houver conta Apple.
- Homologação física em aparelho real.

## Pendência P0: painel administrativo próprio

O Admin já possui rota e funções reais em `/admin`, mas precisa ser publicado como produto web próprio, com domínio/subdomínio próprio e `VITE_APOIS_PRODUCT_MODE=admin`, para não parecer app do cliente.

## Ordem de correção

1. Separar Admin como deploy web próprio.
2. Separar Estabelecimento como deploy web próprio.
3. Separar Entregador como build mobile-first dedicado.
4. Empacotar Entregador nativo para Android.
5. Repetir empacotamento para Cliente.
6. Só depois retomar a afirmação de release candidate.
