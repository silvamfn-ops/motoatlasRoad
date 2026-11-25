# MOTOATLAS Road v1.4 — Navegação Inteligente para iPhone 7 Plus

## Novas Capacidades de Navegação & Segurança na Estrada
1. **Motor de Roteamento Real (OSRM) com Ruas e Rotundas:** Ao importar uma viagem do Studio (`.json` ou Supabase) ou um `.gpx`, a app obtém automaticamente os nomes reais das estradas (`N18`, `A12`, ruas urbanas), o **número exato da saída nas rotundas** (`1.ª`, `2.ª`, `3.ª saída`) e o traçado rodoviário exato.
2. **Avisos de Voz Antecipados em 3 Estágios (`1000 m` → `300 m` → `50 m`):** Anuncia cada manobra com antecedência suficiente para reduzires caixa e posicionares a mota antes de cruzamentos e rotundas, com destaque visual vermelho nos últimos `120 m`.
3. **Recálculo Automático Fora de Rota (`> 85 m`):** Se falhares uma saída numa cidade desconhecida, a aplicação avisa por voz (*"Fora de rota. A recalcular caminho"*) e traça imediatamente um novo percurso desde a tua posição GPS atual até às paragens seguintes.
4. **Cache Offline de Mapas (`sw.js`) + Integração Direta com Organic Maps:** Antes de arrancares, podes descarregar os blocos do mapa da etapa para memória offline no separador `☁️ GPX/Sync` e tens um botão `🗺️ Organic` em cada paragem para abrir a navegação 100% offline no Organic Maps com um toque.
5. **Screen Wake Lock:** Mantém o ecrã do iPhone 7 Plus sempre ativo enquanto o GPS está ligado.
