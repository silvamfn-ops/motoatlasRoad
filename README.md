# MOTOATLAS Road v1.1 (Cockpit de Guiador & Turn-by-Turn)

## Novidades da Versão 1.1
- **Mapa OSM Standard Sempre Detalhado:** Mosaico OpenStreetMap Standard gratuito, sem API Key, mantendo todo o detalhe de estradas nacionais, localidades, curvas e topografia independentemente de a interface estar em Modo Escuro ou Modo Claro. Inclui botão rápido de redução suave de brilho noturno (`100% / 75% / 55%`) diretamente no mapa.
- **Seletor Rápido no Painel Estrada & Mapa (`🗺️ Mapa + Voz` vs. `🧭 Turn-by-Turn`):**
  - **Modo `🗺️ Mapa + Voz`:** Exibe o mapa detalhado com traçado e paragens e ativa leitura automática por voz (Web Speech API) na aproximação às curvas e pontos do roadbook.
  - **Modo `🧭 Turn-by-Turn`:** Substitui o mapa por um painel escuro de alto contraste com seta direcional grande (`↱`, `↰`, `↑`, `↻`), distância em tempo real via GPS, velocidade atual (`km/h`), pré-visualização **"A SEGUIR"** e botão grande para repetir a instrução no intercomunicador.
- **Navegação 100% Autónoma:** Removida a ligação externa "Abrir Maps/Organic" para manter o piloto focado no cockpit integrado.
