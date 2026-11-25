# MOTOATLAS Road v1.3 (Otimizado para iPhone 7 Plus — 5.5" 736×414 px)

## Ajustes Específicos para iPhone 7 Plus & iOS Safari
- **Calibração Vertical & Horizontal (414 px de altura em Landscape):** Toda a grelha do cockpit (barra HUD superior, banner da próxima paragem, lista do roadbook, seletor `Mapa + Voz` vs. `Turn-by-Turn` e botões de controlo) cabe integralmente nos `736 × 414 px` do ecrã Retina HD de 5,5" do iPhone 7 Plus sem cortes nem necessidade de fazer scroll na vista principal.
- **Modo Ecrã Cheio iOS (`apple-mobile-web-app-capable`):** Ao adicionar ao Ecrã Principal no Safari (`Partilhar → Ecrã Principal`), abre sem barra de endereços nem separadores do Safari, ganhando ~65 px extra de altura útil.
- **Inputs a `16px` & `inputmode="decimal"`:** Evita o zoom automático do iOS Safari ao tocar nos campos de litros, quilómetros ou valor e abre diretamente o teclado numérico.
- **Gestão de Rotação (`orientationchange`):** Recalcula automaticamente as dimensões do mapa OpenStreetMap quando o iPhone é colocado na horizontal no suporte de guiador.
