# MOTOATLAS Road v1.4.1 — Navegação Inteligente para iPhone 7 Plus

## Correções da v1.4.1
- Corrigidos os escapes de quebra de linha (`\n`) em `exportActiveRouteAsGpx()` e `btnShareCoords` no `app.js` que bloqueavam a inicialização do script.
- Atualizado o identificador do Service Worker (`motoatlas-road-v1.4.1-cache`) no `sw.js` para forçar a limpeza automática da versão anterior no iOS Safari.
