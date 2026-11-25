# MOTOATLAS Road v1.2 (Cockpit de Guiador & Motor Turn-by-Turn GPX)

## Novidades da Versão 1.2
- **Importação Direta de Ficheiros GPX (`.gpx`) com Análise Geométrica de Curvas:**
  - Lê pontos de traçado (`<trkpt>` / `<rtept>`) e paragens (`<wpt>`), simplifica o ruído de GPS e calcula as variações de azimute ao longo da estrada.
  - Gera automaticamente cada manobra com **seta direcional** (`↗`, `↖`, `↱`, `↰`, `↻`, `↑`, `🏁`), **ângulo da curva**, **distância exata** até à manobra e **pré-visualização "A SEGUIR"**.
  - Inclui **seletor de sensibilidade** (`28°` Estradas Nacionais & Curvas, `42°` Equilibrado, `65°` Viragens Acentuadas & Ganchos) para recalcular a lista de manobras em tempo real.
- **Avanço Automático por GPS & Controlo Manual de Luvas:**
  - Quando o GPS passa a menos de 45 m da curva atual, o painel avança automaticamente para a manobra seguinte e lê a instrução por voz (`Web Speech API`) 500 m antes da próxima curva.
  - Botões `⏮️ Anterior` e `⏭️ Próxima` no painel Turn-by-Turn para navegar pelas curvas do percurso.
