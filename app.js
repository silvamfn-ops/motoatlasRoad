// MOTOATLAS Road v1.2 — Cockpit de Guiador (Mapa OSM + Voz + Motor Turn-by-Turn GPX Automático)
const ROAD_ACTIVE_TRIP_KEY = 'motoatlas_road_v1_active_trip';
const ROAD_DONE_WPS_KEY = 'motoatlas_road_v1_done_wps';
const SB_URL_KEY = 'motoatlas_supabase_url';
const SB_ANON_KEY = 'motoatlas_supabase_anon_key';

const DEFAULT_DEMO_TRIP = {
  id: 'trip-andaluzia-26',
  tripCode: 'ANDALUZIA-26',
  profile: 'moto',
  tripTitle: 'Expedição Andaluzia & Sul Ibérico',
  stageSubtitle: 'Etapa 1: Lisboa → Córdoba (via Évora & Zafra)',
  stageDistanceKm: 485,
  odometerKm: 580,
  tankCapacityL: 14.1,
  avgConsumptionL100: 3.8,
  waypoints: [
    {
      name: 'Partida: Lisboa (Ponte Vasco da Gama)',
      type: 'start',
      lat: 38.7586,
      lng: -9.0375,
      km: 0,
      arrow: '↑',
      maneuver: 'Segue em frente pela A12 / N4 direção Évora',
      afterPreview: 'Depois: saída N114 a 400 m → direção Évora Centro'
    },
    {
      name: 'Café & Reagrupamento: Évora',
      type: 'viewpoint',
      lat: 38.5714,
      lng: -7.9135,
      km: 132,
      arrow: '↱',
      maneuver: 'Vira à direita na N18 direção Estremoz / Badajoz',
      afterPreview: 'Depois: rotunda a 350 m → 2.ª saída direção Mérida'
    },
    {
      name: 'Abastecimento: Repsol Mérida',
      type: 'fuel',
      lat: 38.9161,
      lng: -6.3437,
      km: 285,
      arrow: '↻',
      maneuver: 'Na rotunda da Repsol, sai na 2.ª saída para a N-630',
      afterPreview: 'Depois: curva fechada à esquerda a 500 m → direção Zafra'
    },
    {
      name: 'Paragem Cultural: Zafra (Plaza Grande)',
      type: 'monument',
      lat: 38.4261,
      lng: -6.4184,
      km: 348,
      arrow: '↰',
      maneuver: 'Vira à esquerda para a N-432 direção Córdoba',
      afterPreview: 'Depois: travessia de serra a 800 m → reduz para 2.ª/3.ª caixa'
    },
    {
      name: 'Chegada / Dormida: Córdoba',
      type: 'sleep',
      lat: 37.8882,
      lng: -4.7794,
      km: 485,
      arrow: '🏁',
      maneuver: 'Chegada ao destino: Córdoba (Hotel / Centro Histórico)',
      afterPreview: 'Fim da etapa de hoje — estacionamento e descanso'
    }
  ],
  routeCoords: [
    [38.7586, -9.0375],
    [38.6850, -8.4800],
    [38.5714, -7.9135],
    [38.8800, -6.9700],
    [38.9161, -6.3437],
    [38.4261, -6.4184],
    [38.1200, -5.5600],
    [37.8882, -4.7794]
  ],
  tbtSteps: [],
  expenses: []
};

const PIN_ICONS = {
  start: '🏁',
  fuel: '⛽',
  viewpoint: '📸',
  monument: '🏛️',
  sleep: '🏨',
  turn: '↱'
};

let activeTrip = loadRoadTrip();
let doneWps = JSON.parse(localStorage.getItem(ROAD_DONE_WPS_KEY) || '[]');
let map = null;
let routeLayer = null;
let markersLayer = null;
let turnMarkersLayer = null;
let gpsMarker = null;
let gpsWatchId = null;
let currentCoords = null;
let currentSpeedKmh = 0;

// Estado de Navegação Turn-by-Turn & Voz
let activeTbtIndex = 0;
let autoVoiceEnabled = true;
let announcedTbtIndices = new Set();
let mapDimLevel = 0; // 0 = 100%, 1 = 75%, 2 = 55%

function loadRoadTrip() {
  try {
    const raw = localStorage.getItem(ROAD_ACTIVE_TRIP_KEY);
    return raw ? JSON.parse(raw) : structuredClone(DEFAULT_DEMO_TRIP);
  } catch {
    return structuredClone(DEFAULT_DEMO_TRIP);
  }
}

function saveRoadTrip() {
  localStorage.setItem(ROAD_ACTIVE_TRIP_KEY, JSON.stringify(activeTrip));
  localStorage.setItem(ROAD_DONE_WPS_KEY, JSON.stringify(doneWps));
}

document.addEventListener('DOMContentLoaded', () => {
  initTopNavigation();
  initNavModeSwitcher();
  initMap();
  ensureTurnStepsReady();
  loadSbInputs();
  renderAllRoadUI();
  bindEvents();
});

function initTopNavigation() {
  document.querySelectorAll('.nav-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-pill').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.road-view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.view).classList.add('active');
      if (btn.dataset.view === 'view-cockpit' && map) {
        setTimeout(() => map.invalidateSize(), 100);
      }
    });
  });
}

// --- SELETOR DE DOIS MODOS NO PAINEL DIREITO (MAPA + VOZ VS TURN-BY-TURN) ---
function initNavModeSwitcher() {
  const btnMap = document.getElementById('btnModeMapVoice');
  const btnTbt = document.getElementById('btnModeTurnByTurn');
  const panelMap = document.getElementById('panelMapVoice');
  const panelTbt = document.getElementById('panelTurnByTurn');

  btnMap.addEventListener('click', () => {
    btnMap.classList.add('active');
    btnTbt.classList.remove('active');
    panelMap.classList.add('active');
    panelTbt.classList.remove('active');
    if (map) setTimeout(() => map.invalidateSize(), 80);
  });

  btnTbt.addEventListener('click', () => {
    btnTbt.classList.add('active');
    btnMap.classList.remove('active');
    panelTbt.classList.add('active');
    panelMap.classList.remove('active');
    updateTurnByTurnPanel();
  });
}

// --- MAPA OSM STANDARD SEMPRE DETALHADO E INDEPENDENTE DO TEMA ---
function initMap() {
  map = L.map('road-map', { zoomControl: false }).setView([38.5, -8.0], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  turnMarkersLayer = L.layerGroup().addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

// --- WEB SPEECH API (SÍNTESE DE VOZ PARA INTERCOMUNICADOR) ---
function speakInstruction(text) {
  if (!('speechSynthesis' in window) || !text) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'pt-PT';
    utter.rate = 1.02;
    utter.pitch = 1.0;
    window.speechSynthesis.speak(utter);
  } catch (err) {
    console.warn('Falha na síntese de voz:', err);
  }
}

// --- GEOMETRIA ESFÉRICA: DISTÂNCIA (HAVERSINE) E AZIMUTE (BEARING) ---
function calcDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function calcBearingDeg(lat1, lon1, lat2, lon2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const toDeg = rad => (rad * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lon2 - lon1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function normalizeTurnAngle(bearing1, bearing2) {
  // Positivo = viragem à direita (0..180); Negativo = viragem à esquerda (-180..0)
  let diff = ((bearing2 - bearing1 + 540) % 360) - 180;
  return diff;
}

function classifyTurnAngle(deltaDeg) {
  const abs = Math.abs(deltaDeg);
  const isRight = deltaDeg > 0;
  if (abs >= 135) {
    return {
      arrow: '↻',
      label: isRight ? 'Inversão / Gancho fechado à direita' : 'Inversão / Gancho fechado à esquerda',
      shortLabel: isRight ? 'gancho à direita' : 'gancho à esquerda'
    };
  }
  if (abs >= 65) {
    return {
      arrow: isRight ? '↱' : '↰',
      label: isRight ? 'Vira à direita' : 'Vira à esquerda',
      shortLabel: isRight ? 'viragem à direita' : 'viragem à esquerda'
    };
  }
  return {
    arrow: isRight ? '↗' : '↖',
    label: isRight ? 'Curva ligeira à direita' : 'Curva ligeira à esquerda',
    shortLabel: isRight ? 'curva ligeira à direita' : 'curva ligeira à esquerda'
  };
}

function formatDistanceLabel(meters) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.max(0, Math.round(meters / 10) * 10)} m`;
}

// --- MOTOR AUTOMÁTICO DE EXTRAÇÃO DE CURVAS A PARTIR DE TRAÇADO GPX ---
function generateTurnStepsFromCoords(coords, waypoints = [], minAngleDeg = 42) {
  if (!coords || coords.length < 2) return [];

  // 1. Sub-amostragem espacial para eliminar ruído GPS (< 35 m entre pontos consecutivos)
  const simplified = [coords[0]];
  for (let i = 1; i < coords.length - 1; i++) {
    const prev = simplified[simplified.length - 1];
    if (calcDistanceMeters(prev[0], prev[1], coords[i][0], coords[i][1]) >= 35) {
      simplified.push(coords[i]);
    }
  }
  simplified.push(coords[coords.length - 1]);

  // Calcular distância acumulada em cada vértice simplificado
  const cumDistMeters = [0];
  for (let i = 1; i < simplified.length; i++) {
    const d = calcDistanceMeters(
      simplified[i - 1][0], simplified[i - 1][1],
      simplified[i][0], simplified[i][1]
    );
    cumDistMeters.push(cumDistMeters[i - 1] + d);
  }

  const rawSteps = [];

  // Passo inicial: Partida
  rawSteps.push({
    lat: simplified[0][0],
    lng: simplified[0][1],
    cumDistM: 0,
    arrow: '↑',
    instruction: waypoints[0]?.name ? `Partida: ${waypoints[0].name}` : 'Início da rota GPX — segue em frente',
    shortDesc: 'início da rota',
    isWaypoint: Boolean(waypoints[0])
  });

  // 2. Deteção de mudanças de azimute (curvas e viragens) ao longo do traçado
  let lastTurnCumDistM = 0;
  for (let i = 1; i < simplified.length - 1; i++) {
    // Janela de olhar atrás/à frente (~60-120 m) para medir o ângulo real da estrada e não zig-zag de GPS
    const backIdx = Math.max(0, i - 2);
    const fwdIdx = Math.min(simplified.length - 1, i + 2);

    const bIn = calcBearingDeg(
      simplified[backIdx][0], simplified[backIdx][1],
      simplified[i][0], simplified[i][1]
    );
    const bOut = calcBearingDeg(
      simplified[i][0], simplified[i][1],
      simplified[fwdIdx][0], simplified[fwdIdx][1]
    );

    const delta = normalizeTurnAngle(bIn, bOut);
    const absDelta = Math.abs(delta);
    const distSinceLastTurn = cumDistMeters[i] - lastTurnCumDistM;

    if (absDelta >= minAngleDeg && distSinceLastTurn >= 90) {
      const turnInfo = classifyTurnAngle(delta);
      const kmMark = (cumDistMeters[i] / 1000).toFixed(1);
      rawSteps.push({
        lat: simplified[i][0],
        lng: simplified[i][1],
        cumDistM: cumDistMeters[i],
        arrow: turnInfo.arrow,
        instruction: `${turnInfo.label} (${Math.round(absDelta)}°) • Km ${kmMark}`,
        shortDesc: turnInfo.shortLabel,
        isWaypoint: false
      });
      lastTurnCumDistM = cumDistMeters[i];
    }
  }

  // 3. Inserir paragens/waypoints intermédios do GPX (se existirem)
  if (waypoints.length > 2) {
    for (let w = 1; w < waypoints.length - 1; w++) {
      const wp = waypoints[w];
      // Encontrar ponto mais próximo no traçado para calcular distância acumulada
      let bestDistM = Infinity;
      let bestCumM = (wp.km || 0) * 1000;
      for (let i = 0; i < simplified.length; i++) {
        const d = calcDistanceMeters(wp.lat, wp.lng, simplified[i][0], simplified[i][1]);
        if (d < bestDistM) {
          bestDistM = d;
          bestCumM = cumDistMeters[i];
        }
      }
      rawSteps.push({
        lat: wp.lat,
        lng: wp.lng,
        cumDistM: bestCumM,
        arrow: wp.arrow || '📍',
        instruction: `Paragem Roadbook: ${wp.name} (Km ${(bestCumM / 1000).toFixed(1)})`,
        shortDesc: wp.name,
        isWaypoint: true
      });
    }
  }

  // Ordenar passos por distância acumulada ao longo da rota
  rawSteps.sort((a, b) => a.cumDistM - b.cumDistM);

  // Passo final: Chegada
  const totalDistM = cumDistMeters[cumDistMeters.length - 1];
  const lastWp = waypoints[waypoints.length - 1];
  rawSteps.push({
    lat: simplified[simplified.length - 1][0],
    lng: simplified[simplified.length - 1][1],
    cumDistM: totalDistM,
    arrow: '🏁',
    instruction: lastWp?.name ? `Chegada: ${lastWp.name}` : `Chegada ao destino GPX (Km ${(totalDistM / 1000).toFixed(1)})`,
    shortDesc: 'chegada ao destino',
    isWaypoint: true
  });

  // 4. Calcular distância entre manobras consecutivas e preencher o campo "A SEGUIR"
  for (let i = 0; i < rawSteps.length; i++) {
    const prevCum = i > 0 ? rawSteps[i - 1].cumDistM : 0;
    rawSteps[i].legDistM = Math.max(0, Math.round(rawSteps[i].cumDistM - prevCum));

    if (i + 1 < rawSteps.length) {
      const nextStep = rawSteps[i + 1];
      const gapM = Math.max(0, Math.round(nextStep.cumDistM - rawSteps[i].cumDistM));
      rawSteps[i].afterPreview = `Depois: ${nextStep.shortDesc} a ${formatDistanceLabel(gapM)}`;
    } else {
      rawSteps[i].afterPreview = 'Fim do percurso — estacionamento e descanso';
    }
  }

  return rawSteps;
}

function parseGpxXml(xmlText, minAngleDeg = 42, fileName = 'Rota GPX') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Ficheiro GPX inválido ou corrompido.');
  }

  // Extrair nome da rota/track
  const trkName = doc.querySelector('trk > name')?.textContent?.trim()
    || doc.querySelector('rte > name')?.textContent?.trim()
    || doc.querySelector('metadata > name')?.textContent?.trim()
    || fileName.replace(/\.gpx$/i, '');

  // Extrair pontos de traçado (<trkpt> ou fallback para <rtept>)
  let ptNodes = Array.from(doc.querySelectorAll('trkpt'));
  if (ptNodes.length < 2) {
    ptNodes = Array.from(doc.querySelectorAll('rtept'));
  }

  const routeCoords = ptNodes
    .map(pt => [parseFloat(pt.getAttribute('lat')), parseFloat(pt.getAttribute('lon'))])
    .filter(([lat, lng]) => !Number.isNaN(lat) && !Number.isNaN(lng));

  if (routeCoords.length < 2) {
    throw new Error('O ficheiro GPX não contém pontos de traçado (<trkpt> ou <rtept>) suficientes.');
  }

  // Extrair waypoints (<wpt>)
  const wptNodes = Array.from(doc.querySelectorAll('wpt'));
  const parsedWaypoints = wptNodes.map((wpt, idx) => {
    const lat = parseFloat(wpt.getAttribute('lat'));
    const lng = parseFloat(wpt.getAttribute('lon'));
    const name = wpt.querySelector('name')?.textContent?.trim() || `Ponto ${idx + 1}`;
    const lower = name.toLowerCase();
    let type = 'viewpoint';
    if (lower.includes('combust') || lower.includes('gasol') || lower.includes('repsol') || lower.includes('galp')) type = 'fuel';
    else if (lower.includes('hotel') || lower.includes('dormida') || lower.includes('chegada')) type = 'sleep';
    else if (idx === 0) type = 'start';
    return { name, type, lat, lng, km: 0 };
  }).filter(w => !Number.isNaN(w.lat) && !Number.isNaN(w.lng));

  // Se o GPX não tiver <wpt>, criar Partida e Chegada automáticas a partir das pontas do traçado
  let totalDistM = 0;
  for (let i = 1; i < routeCoords.length; i++) {
    totalDistM += calcDistanceMeters(
      routeCoords[i - 1][0], routeCoords[i - 1][1],
      routeCoords[i][0], routeCoords[i][1]
    );
  }
  const totalKm = Math.round(totalDistM / 1000);

  const waypoints = parsedWaypoints.length >= 2
    ? parsedWaypoints
    : [
        { name: `Partida: ${trkName}`, type: 'start', lat: routeCoords[0][0], lng: routeCoords[0][1], km: 0 },
        { name: `Chegada: ${trkName}`, type: 'sleep', lat: routeCoords[routeCoords.length - 1][0], lng: routeCoords[routeCoords.length - 1][1], km: totalKm }
      ];

  // Atualizar marcos quilométricos nos waypoints
  waypoints.forEach((wp, idx) => {
    if (idx === 0) wp.km = 0;
    else if (idx === waypoints.length - 1) wp.km = totalKm;
    else {
      // Encontrar distância acumulada mais próxima
      let acc = 0;
      let bestAcc = 0;
      let bestD = Infinity;
      for (let i = 1; i < routeCoords.length; i++) {
        acc += calcDistanceMeters(routeCoords[i - 1][0], routeCoords[i - 1][1], routeCoords[i][0], routeCoords[i][1]);
        const d = calcDistanceMeters(wp.lat, wp.lng, routeCoords[i][0], routeCoords[i][1]);
        if (d < bestD) {
          bestD = d;
          bestAcc = acc;
        }
      }
      wp.km = Math.round(bestAcc / 1000);
    }
  });

  const tbtSteps = generateTurnStepsFromCoords(routeCoords, waypoints, minAngleDeg);

  return {
    id: `gpx-${Date.now()}`,
    tripCode: `GPX-${Math.floor(100 + Math.random() * 900)}`,
    profile: 'moto',
    tripTitle: trkName,
    stageSubtitle: `Rota GPX • ${totalKm} km • ${tbtSteps.length} manobras Turn-by-Turn detetadas`,
    stageDistanceKm: totalKm,
    odometerKm: activeTrip.odometerKm || 0,
    tankCapacityL: activeTrip.tankCapacityL || 14.1,
    avgConsumptionL100: activeTrip.avgConsumptionL100 || 3.8,
    waypoints,
    routeCoords,
    tbtSteps,
    expenses: []
  };
}

function ensureTurnStepsReady() {
  if (!activeTrip.tbtSteps || activeTrip.tbtSteps.length === 0) {
    const sens = parseInt(document.getElementById('gpxTurnSensitivity')?.value || '42', 10);
    if (activeTrip.routeCoords && activeTrip.routeCoords.length >= 2) {
      activeTrip.tbtSteps = generateTurnStepsFromCoords(
        activeTrip.routeCoords,
        activeTrip.waypoints || [],
        sens
      );
    }
  }
  // Começar na primeira viragem relevante (índice 1) se houver mais do que a partida
  activeTbtIndex = (activeTrip.tbtSteps && activeTrip.tbtSteps.length > 1) ? 1 : 0;
}

function updateTurnByTurnPanel() {
  const steps = activeTrip.tbtSteps || [];
  document.getElementById('tbtSpeedBig').textContent = currentSpeedKmh;

  if (steps.length === 0) {
    document.getElementById('tbtArrow').textContent = '↑';
    document.getElementById('tbtDistance').textContent = '—';
    document.getElementById('tbtStepCounter').textContent = '0/0';
    document.getElementById('tbtInstruction').textContent = 'Sem rota carregada';
    document.getElementById('tbtNextPreview').textContent = 'Importa um ficheiro GPX no separador Sync / GPX';
    return;
  }

  activeTbtIndex = Math.max(0, Math.min(activeTbtIndex, steps.length - 1));
  const step = steps[activeTbtIndex];

  document.getElementById('tbtArrow').textContent = step.arrow || '↑';
  document.getElementById('tbtStepCounter').textContent = `Manobra ${activeTbtIndex + 1}/${steps.length}`;
  document.getElementById('tbtInstruction').textContent = step.instruction;
  document.getElementById('tbtNextPreview').textContent = step.afterPreview || 'Mantém trajetória';

  let distMeters = null;
  if (currentCoords && step.lat && step.lng) {
    distMeters = calcDistanceMeters(currentCoords[0], currentCoords[1], step.lat, step.lng);
    document.getElementById('tbtDistance').textContent = formatDistanceLabel(distMeters);

    // Avanço automático se a mota já passou a menos de 45 metros da curva atual
    if (distMeters <= 45 && activeTbtIndex < steps.length - 1) {
      activeTbtIndex += 1;
      updateTurnByTurnPanel();
      return;
    }
  } else {
    // Sem GPS ligado, mostra a distância exata calculada pelo GPX desde a manobra anterior
    document.getElementById('tbtDistance').textContent = formatDistanceLabel(step.legDistM || 0);
  }

  // Disparo automático de voz ao aproximar-se de uma curva/ponto (< 500 m com GPS ativo)
  if (autoVoiceEnabled && distMeters !== null && distMeters <= 500 && !announcedTbtIndices.has(activeTbtIndex)) {
    announcedTbtIndices.add(activeTbtIndex);
    speakInstruction(`A ${formatDistanceLabel(distMeters)}, ${step.instruction}. ${step.afterPreview}`);
  }
}

function renderAllRoadUI() {
  document.getElementById('hudTripCode').textContent = activeTrip.tripCode || 'ROTA ATIVA';
  document.getElementById('hudTripTitle').textContent = activeTrip.tripTitle;
  document.getElementById('hudStageSubtitle').textContent = activeTrip.stageSubtitle || '';
  document.getElementById('importTripCodeInput').value = activeTrip.tripCode || '';

  // Telemetria & Autonomia
  const tank = activeTrip.tankCapacityL || 14.1;
  const avg = activeTrip.avgConsumptionL100 || 3.8;
  const maxRange = Math.round((tank / avg) * 100);
  const fuelExps = (activeTrip.expenses || []).filter(e => e.category === 'Combustível' && e.tripKm > 0);
  const lastKmSinceFill = fuelExps.length > 0 ? fuelExps[fuelExps.length - 1].tripKm : 0;
  const remRange = Math.max(0, maxRange - lastKmSinceFill);

  document.getElementById('telRange').innerHTML = `${remRange} <small>km</small>`;
  document.getElementById('telOdo').innerHTML = `${Math.round(activeTrip.odometerKm || 0)} <small>km</small>`;

  renderMap();
  renderRoadbookList();
  updateTurnByTurnPanel();
  renderRoadExpenses();
}

function renderMap() {
  if (!map) return;
  routeLayer.clearLayers();
  turnMarkersLayer.clearLayers();
  markersLayer.clearLayers();

  const coords = activeTrip.routeCoords && activeTrip.routeCoords.length > 1
    ? activeTrip.routeCoords
    : (activeTrip.waypoints || []).map(w => [w.lat, w.lng]);

  if (coords.length > 1) {
    const poly = L.polyline(coords, { color: '#d97706', weight: 6, opacity: 0.95 }).addTo(routeLayer);
    map.fitBounds(poly.getBounds(), { padding: [22, 22] });
  }

  // Desenhar pontos discretos nas curvas detetadas do GPX
  (activeTrip.tbtSteps || []).forEach((step, idx) => {
    if (step.isWaypoint) return;
    L.circleMarker([step.lat, step.lng], {
      radius: 5,
      color: '#111827',
      weight: 2,
      fillColor: '#f59e0b',
      fillOpacity: 0.95
    })
      .bindPopup(`<strong>${step.arrow} Manobra ${idx + 1}</strong><br/>${step.instruction}`)
      .addTo(turnMarkersLayer);
  });

  // Desenhar paragens principais
  (activeTrip.waypoints || []).forEach((wp, idx) => {
    const iconHtml = `<div style="font-size:22px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.85))">${PIN_ICONS[wp.type] || '📍'}</div>`;
    const icon = L.divIcon({ html: iconHtml, className: 'road-pin', iconSize: [26, 26] });
    L.marker([wp.lat, wp.lng], { icon })
      .bindPopup(`<strong>${idx + 1}. ${wp.name}</strong><br/>Km ${wp.km}`)
      .addTo(markersLayer);
  });
}

function renderRoadbookList() {
  const listEl = document.getElementById('roadWpList');
  const wps = activeTrip.waypoints || [];
  listEl.innerHTML = '';

  const nextIdx = wps.findIndex((_, i) => !doneWps.includes(i));
  const nextWp = nextIdx !== -1 ? wps[nextIdx] : wps[wps.length - 1];
  if (nextWp) {
    document.getElementById('nextWpTitle').textContent = `${PIN_ICONS[nextWp.type] || '📍'} ${nextWp.name}`;
    document.getElementById('nextWpDist').textContent = `Marco: Km ${nextWp.km}`;
  }

  wps.forEach((wp, idx) => {
    const isDone = doneWps.includes(idx);
    const row = document.createElement('div');
    row.className = `wp-glove-item ${isDone ? 'done' : ''}`;
    row.innerHTML = `
      <div>
        <strong>${PIN_ICONS[wp.type] || '📍'} ${wp.name}</strong>
        <small>Km ${wp.km} • Toca para marcar concluído</small>
      </div>
      <button type="button" class="btn-glove-sm" onclick="event.stopPropagation(); focusRoadWp(${idx})">🎯</button>
    `;
    row.addEventListener('click', () => {
      if (doneWps.includes(idx)) {
        doneWps = doneWps.filter(i => i !== idx);
      } else {
        doneWps.push(idx);
      }
      saveRoadTrip();
      renderRoadbookList();
    });
    listEl.appendChild(row);
  });
}

window.focusRoadWp = function(idx) {
  const wp = (activeTrip.waypoints || [])[idx];
  if (wp && map) map.setView([wp.lat, wp.lng], 14);
};

// --- DESPESAS NA ESTRADA ---
function renderRoadExpenses() {
  const list = document.getElementById('roadExpList');
  const exps = activeTrip.expenses || [];
  const total = exps.reduce((s, e) => s + e.amount, 0);
  document.getElementById('roadTotalSpent').textContent = `${total.toFixed(2)} €`;

  list.innerHTML = exps.length === 0
    ? '<li class="muted">Nenhum registo ainda. Usa o formulário ao lado nas paragens.</li>'
    : exps.slice().reverse().map(e => `
        <li>
          <div>
            <strong>${e.category}</strong> (${e.payer})<br/>
            <small>${e.liters ? `${e.liters} L • ` : ''}${e.note || ''}</small>
          </div>
          <strong>${e.amount.toFixed(2)} €</strong>
        </li>
      `).join('');
}

// --- GPS LIVE (ALIMENTA MAPA, VELOCIDADE E TURN-BY-TURN) ---
function toggleGps() {
  const btn = document.getElementById('btnToggleGps');
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
    currentSpeedKmh = 0;
    btn.textContent = '📡 GPS: OFF';
    document.getElementById('telSpeed').innerHTML = `0 <small>km/h</small>`;
    document.getElementById('tbtSpeedBig').textContent = '0';
    return;
  }

  if (!('geolocation' in navigator)) {
    alert('Geolocalização não suportada neste dispositivo.');
    return;
  }

  btn.textContent = '📡 GPS: ATIVO';
  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, speed } = pos.coords;
      currentCoords = [latitude, longitude];
      currentSpeedKmh = speed !== null && !Number.isNaN(speed) ? Math.round(speed * 3.6) : 0;

      document.getElementById('telSpeed').innerHTML = `${currentSpeedKmh} <small>km/h</small>`;
      document.getElementById('tbtSpeedBig').textContent = currentSpeedKmh;

      if (!gpsMarker) {
        const motoIcon = L.divIcon({
          html: '<div style="font-size:24px;">🏍️</div>',
          className: 'gps-moto-pin',
          iconSize: [28, 28]
        });
        gpsMarker = L.marker(currentCoords, { icon: motoIcon }).addTo(map);
      } else {
        gpsMarker.setLatLng(currentCoords);
      }
      map.panTo(currentCoords);
      updateTurnByTurnPanel();
    },
    (err) => {
      alert(`Erro GPS: ${err.message}`);
    },
    { enableHighAccuracy: true, maximumAge: 2000 }
  );
}

// --- SYNC STUDIO <-> ROAD ---
function getSbCreds() {
  return {
    url: (localStorage.getItem(SB_URL_KEY) || '').trim().replace(/\/$/, ''),
    key: (localStorage.getItem(SB_ANON_KEY) || '').trim()
  };
}

function loadSbInputs() {
  const { url, key } = getSbCreds();
  document.getElementById('roadSbUrl').value = url;
  document.getElementById('roadSbKey').value = key;
}

async function pullTripByCodeFromSupabase() {
  const code = document.getElementById('importTripCodeInput').value.trim().toUpperCase();
  const fb = document.getElementById('roadSyncFeedback');
  const { url, key } = getSbCreds();

  if (!url || !key) {
    fb.textContent = '⚠️ Configura primeiro o URL e a Anon Key do Supabase abaixo.';
    return;
  }
  if (!code) {
    fb.textContent = '⚠️ Escreve o código da viagem (ex: ANDALUZIA-26).';
    return;
  }

  fb.textContent = `⏳ A descarregar "${code}" do Studio...`;
  try {
    const resp = await fetch(`${url}/rest/v1/motoatlas_trips?trip_code=eq.${encodeURIComponent(code)}&select=*`, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    });
    const rows = await resp.json();
    if (!rows || rows.length === 0) {
      fb.textContent = `❌ Código "${code}" não encontrado na Supabase.`;
      return;
    }
    activeTrip = rows[0].payload;
    doneWps = [];
    announcedTbtIndices.clear();
    ensureTurnStepsReady();
    saveRoadTrip();
    renderAllRoadUI();
    fb.textContent = `✅ Viagem "${activeTrip.tripTitle}" carregada (${activeTrip.tbtSteps.length} manobras geradas)!`;
  } catch (err) {
    fb.textContent = `❌ Erro de rede: ${err.message}`;
  }
}

async function pushCompletedTripBackToStudio() {
  const fb = document.getElementById('roadSyncFeedback');
  const { url, key } = getSbCreds();

  if (!url || !key) {
    fb.textContent = '⚠️ Configura o Supabase abaixo ou usa o botão de Ficheiro de Retorno (.json).';
    return;
  }

  fb.textContent = '⏳ A enviar despesas, abastecimentos e odómetro para o PC...';
  try {
    const resp = await fetch(`${url}/rest/v1/motoatlas_trips`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        trip_code: activeTrip.tripCode,
        trip_title: activeTrip.tripTitle,
        status: 'completed_road',
        payload: activeTrip,
        updated_at: new Date().toISOString()
      })
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    fb.textContent = `✅ Enviado! No PC, abre o MOTOATLAS Studio e carrega em "Receber Registos da Estrada".`;
  } catch (err) {
    fb.textContent = `❌ Erro ao enviar: ${err.message}`;
  }
}

function bindEvents() {
  // Tema da interface (NÃO altera o detalhe nem o servidor do mapa OSM Standard)
  document.getElementById('btnThemeToggle').addEventListener('click', () => {
    const curr = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', curr === 'dark' ? 'light' : 'dark');
  });

  // Filtro opcional de brilho no contentor do mapa sem perder detalhe nem exigir API Key
  document.getElementById('btnMapNightDim').addEventListener('click', (e) => {
    const mapEl = document.getElementById('road-map');
    mapDimLevel = (mapDimLevel + 1) % 3;
    mapEl.classList.remove('night-dim-75', 'night-dim-55');
    if (mapDimLevel === 0) {
      e.target.textContent = '🌘 Brilho Mapa: 100%';
    } else if (mapDimLevel === 1) {
      mapEl.classList.add('night-dim-75');
      e.target.textContent = '🌘 Brilho Mapa: 75%';
    } else {
      mapEl.classList.add('night-dim-55');
      e.target.textContent = '🌘 Brilho Mapa: 55%';
    }
  });

  // Ligar/Desligar leitura automática por voz
  document.getElementById('btnToggleAutoVoice').addEventListener('click', (e) => {
    autoVoiceEnabled = !autoVoiceEnabled;
    e.target.textContent = autoVoiceEnabled ? '🔊 Voz: ON' : '🔇 Voz: OFF';
    document.getElementById('voiceStatusBadge').textContent = autoVoiceEnabled ? '🔊 Voz Auto: ON' : '🔇 Voz Auto: OFF';
    if (autoVoiceEnabled) {
      const steps = activeTrip.tbtSteps || [];
      const step = steps[activeTbtIndex];
      if (step) {
        speakInstruction(`Voz ativada. Próxima manobra: ${step.instruction}`);
      }
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  });

  // Botão Turn-by-Turn: Repetir instrução no intercomunicador
  document.getElementById('btnTbtRepeatVoice').addEventListener('click', () => {
    const steps = activeTrip.tbtSteps || [];
    const step = steps[activeTbtIndex];
    if (!step) return;
    const dist = document.getElementById('tbtDistance').textContent;
    speakInstruction(`A ${dist}, ${step.instruction}. ${step.afterPreview}`);
  });

  // Botão Turn-by-Turn: Manobra Anterior
  document.getElementById('btnTbtPrevStep').addEventListener('click', () => {
    if (activeTbtIndex > 0) {
      activeTbtIndex -= 1;
      updateTurnByTurnPanel();
      const step = activeTrip.tbtSteps[activeTbtIndex];
      if (step && map) map.panTo([step.lat, step.lng]);
    }
  });

  // Botão Turn-by-Turn: Próxima Manobra (Curva / Cruzamento)
  document.getElementById('btnTbtNextStep').addEventListener('click', () => {
    const steps = activeTrip.tbtSteps || [];
    if (activeTbtIndex < steps.length - 1) {
      activeTbtIndex += 1;
      updateTurnByTurnPanel();
      const step = steps[activeTbtIndex];
      if (step && map) map.panTo([step.lat, step.lng]);
      if (autoVoiceEnabled && step) {
        speakInstruction(`A ${formatDistanceLabel(step.legDistM)}, ${step.instruction}. ${step.afterPreview}`);
      }
    }
  });

  // Importar ficheiro GPX (.gpx) e gerar curvas Turn-by-Turn automaticamente
  document.getElementById('roadGpxFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fb = document.getElementById('roadSyncFeedback');
    try {
      const xmlText = await file.text();
      const sens = parseInt(document.getElementById('gpxTurnSensitivity').value || '42', 10);
      activeTrip = parseGpxXml(xmlText, sens, file.name);
      doneWps = [];
      announcedTbtIndices.clear();
      ensureTurnStepsReady();
      saveRoadTrip();
      renderAllRoadUI();
      fb.textContent = `✅ GPX "${activeTrip.tripTitle}" importado! Foram geradas ${activeTrip.tbtSteps.length} instruções Turn-by-Turn com setas e distâncias.`;
    } catch (err) {
      fb.textContent = `❌ Erro ao ler GPX: ${err.message}`;
    } finally {
      e.target.value = '';
    }
  });

  // Recalcular curvas se o utilizador alterar a sensibilidade
  document.getElementById('gpxTurnSensitivity').addEventListener('change', () => {
    if (!activeTrip.routeCoords || activeTrip.routeCoords.length < 2) return;
    const sens = parseInt(document.getElementById('gpxTurnSensitivity').value || '42', 10);
    activeTrip.tbtSteps = generateTurnStepsFromCoords(
      activeTrip.routeCoords,
      activeTrip.waypoints || [],
      sens
    );
    activeTrip.stageSubtitle = `Rota • ${activeTrip.stageDistanceKm} km • ${activeTrip.tbtSteps.length} manobras Turn-by-Turn`;
    announcedTbtIndices.clear();
    ensureTurnStepsReady();
    saveRoadTrip();
    renderAllRoadUI();
    document.getElementById('roadSyncFeedback').textContent = `🔄 Curvas recalculadas (${activeTrip.tbtSteps.length} manobras detetadas).`;
  });

  document.getElementById('btnToggleGps').addEventListener('click', toggleGps);
  document.getElementById('btnCenterRoute').addEventListener('click', renderMap);

  document.getElementById('btnShareCoords').addEventListener('click', () => {
    const wps = activeTrip.waypoints || [];
    const lat = currentCoords ? currentCoords[0] : wps[0]?.lat;
    const lng = currentCoords ? currentCoords[1] : wps[0]?.lng;
    if (!lat || !lng) return;
    const msg = `MOTOATLAS (${activeTrip.tripCode}): https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (navigator.share) {
      navigator.share({ title: activeTrip.tripTitle, text: msg }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(msg);
      alert(`Coordenadas copiadas:
${msg}`);
    }
  });

  document.getElementById('expCategory').addEventListener('change', (e) => {
    document.getElementById('fuelExtraRow').style.display = e.target.value === 'Combustível' ? 'grid' : 'none';
  });

  document.getElementById('roadExpenseForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const cat = document.getElementById('expCategory').value;
    const amount = parseFloat(document.getElementById('expAmount').value) || 0;
    const liters = cat === 'Combustível' ? (parseFloat(document.getElementById('expLiters').value) || 0) : 0;
    const tripKm = cat === 'Combustível' ? (parseFloat(document.getElementById('expTripKm').value) || 0) : 0;
    const payer = document.getElementById('expPayer').value;
    const note = document.getElementById('expNote').value.trim();

    if (tripKm > 0) {
      activeTrip.odometerKm = (activeTrip.odometerKm || 0) + tripKm;
    }

    activeTrip.expenses = activeTrip.expenses || [];
    activeTrip.expenses.push({
      id: Date.now(),
      category: cat,
      amount,
      payer,
      liters,
      tripKm,
      note
    });

    saveRoadTrip();
    renderAllRoadUI();
    e.target.reset();
    alert('✅ Registo guardado na memória local da mota!');
  });

  // Importar ficheiro .motoatlas.json
  document.getElementById('roadJsonFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const parsed = JSON.parse(await file.text());
    activeTrip = parsed.trip ? parsed.trip : parsed;
    doneWps = [];
    announcedTbtIndices.clear();
    ensureTurnStepsReady();
    saveRoadTrip();
    renderAllRoadUI();
    document.getElementById('roadSyncFeedback').textContent = `✅ Viagem "${activeTrip.tripTitle}" importada (${activeTrip.tbtSteps.length} manobras)!`;
  });

  // Exportar ficheiro de retorno
  document.getElementById('btnDownloadReturnJson').addEventListener('click', () => {
    const pkg = {
      format: 'motoatlas-road-return-v1',
      returnedAt: new Date().toISOString(),
      trip: activeTrip
    };
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(activeTrip.tripCode || 'viagem').toLowerCase()}_retorno.motoatlas.json`;
    a.click();
  });

  document.getElementById('roadSbForm').addEventListener('submit', (e) => {
    e.preventDefault();
    localStorage.setItem(SB_URL_KEY, document.getElementById('roadSbUrl').value.trim().replace(/\/$/, ''));
    localStorage.setItem(SB_ANON_KEY, document.getElementById('roadSbKey').value.trim());
    document.getElementById('roadSyncFeedback').textContent = '✅ Credenciais Supabase guardadas no telemóvel!';
  });

  document.getElementById('btnPullTripByCode').addEventListener('click', pullTripByCodeFromSupabase);
  document.getElementById('btnPushCompletedTrip').addEventListener('click', pushCompletedTripBackToStudio);
}
