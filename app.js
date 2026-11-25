// MOTOATLAS Road v1.4.1 — Roteamento Real OSRM (Ruas, Rotundas, Recálculo), Cache Offline, Voz Tripla (1000m/300m/50m) & Organic Maps
const ROAD_ACTIVE_TRIP_KEY = 'motoatlas_road_v1_active_trip';
const ROAD_DONE_WPS_KEY = 'motoatlas_road_v1_done_wps';
const SB_URL_KEY = 'motoatlas_supabase_url';
const SB_ANON_KEY = 'motoatlas_supabase_anon_key';
const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

const DEFAULT_DEMO_TRIP = {
  id: 'trip-andaluzia-26',
  tripCode: 'ANDALUZIA-26',
  profile: 'moto',
  routingEngine: 'geometry',
  tripTitle: 'Expedição Andaluzia & Sul Ibérico',
  stageSubtitle: 'Etapa 1: Lisboa → Córdoba (via Évora & Zafra)',
  stageDistanceKm: 485,
  odometerKm: 580,
  tankCapacityL: 14.1,
  avgConsumptionL100: 3.8,
  waypoints: [
    { name: 'Partida: Lisboa (Ponte Vasco da Gama)', type: 'start', lat: 38.7586, lng: -9.0375, km: 0 },
    { name: 'Café & Reagrupamento: Évora', type: 'viewpoint', lat: 38.5714, lng: -7.9135, km: 132 },
    { name: 'Abastecimento: Repsol Mérida', type: 'fuel', lat: 38.9161, lng: -6.3437, km: 285 },
    { name: 'Paragem Cultural: Zafra (Plaza Grande)', type: 'monument', lat: 38.4261, lng: -6.4184, km: 348 },
    { name: 'Chegada / Dormida: Córdoba', type: 'sleep', lat: 37.8882, lng: -4.7794, km: 485 }
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

// Estado de Navegação Turn-by-Turn, Voz Tripla & Recálculo
let activeTbtIndex = 0;
let autoVoiceEnabled = true;
// Mapa de estágios de voz já anunciados por índice de manobra: { [stepIdx]: Set(['1000', '300', '50']) }
let announcedStages = new Map();
let mapDimLevel = 0;
let isRecalculating = false;
let lastRecalcTimestamp = 0;
let wakeLockSentinel = null;

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

document.addEventListener('DOMContentLoaded', async () => {
  registerOfflineServiceWorker();
  initTopNavigation();
  initNavModeSwitcher();
  initMap();
  await ensureTurnStepsReady();
  loadSbInputs();
  renderAllRoadUI();
  bindEvents();

  window.addEventListener('orientationchange', () => {
    setTimeout(() => { if (map) map.invalidateSize(); }, 250);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && gpsWatchId !== null) {
      requestScreenWakeLock();
    }
  });
});

// --- SERVICE WORKER PARA CACHE OFFLINE DE BLOCOS OSM E FICHEIROS DA APP ---
function registerOfflineServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('Service Worker não registado (normal em file://):', err);
    });
  }
}

// --- SCREEN WAKE LOCK API (IMPEDE BLOQUEIO DO ECRÃ DO IPHONE EM NAVEGAÇÃO) ---
async function requestScreenWakeLock() {
  const badge = document.getElementById('wakeLockBadge');
  if (!('wakeLock' in navigator)) {
    if (badge) badge.textContent = '📱 iOS KeepOn';
    return;
  }
  try {
    wakeLockSentinel = await navigator.wakeLock.request('screen');
    if (badge) badge.textContent = '💡 Ecrã Fixo';
  } catch {
    if (badge) badge.textContent = '💡 Ativo';
  }
}

function releaseScreenWakeLock() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release().catch(() => {});
    wakeLockSentinel = null;
  }
}

function initTopNavigation() {
  document.querySelectorAll('.nav-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-pill').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.road-view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.view).classList.add('active');
      if (btn.dataset.view === 'view-cockpit' && map) {
        setTimeout(() => map.invalidateSize(), 120);
      }
    });
  });
}

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

function initMap() {
  map = L.map('road-map', { zoomControl: false }).setView([38.5, -8.0], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    crossOrigin: true,
    attribution: '&copy; OSM'
  }).addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  turnMarkersLayer = L.layerGroup().addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

// --- SÍNTESE DE VOZ PT-PT OTIMIZADA PARA INTERCOMUNICADOR ---
function speakInstruction(text) {
  if (!('speechSynthesis' in window) || !text) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'pt-PT';
    utter.rate = 1.03;
    utter.pitch = 1.0;
    window.speechSynthesis.speak(utter);
  } catch (err) {
    console.warn('Falha na síntese de voz:', err);
  }
}

// --- GEOMETRIA ESFÉRICA & DISTÂNCIA AO TRAÇADO (DETEÇÃO DE DESVIO) ---
function calcDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  return ((bearing2 - bearing1 + 540) % 360) - 180;
}

function distanceToRouteMeters(lat, lng, coords) {
  if (!coords || coords.length === 0) return 0;
  let minD = Infinity;
  const step = coords.length > 1500 ? 3 : 1;
  for (let i = 0; i < coords.length; i += step) {
    const d = calcDistanceMeters(lat, lng, coords[i][0], coords[i][1]);
    if (d < minD) minD = d;
  }
  return minD;
}

function formatDistanceLabel(meters) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.max(0, Math.round(meters / 10) * 10)} m`;
}

// --- TRADUTOR DE MANOBRAS OSRM PARA PORTUGUÊS DE CONDUÇÃO ---
function translateOsrmManeuver(step, isLastLegStep, waypointName) {
  const m = step.maneuver || {};
  const type = m.type || 'continue';
  const mod = m.modifier || '';
  const roadName = [step.ref, step.name].filter(Boolean).join(' • ');
  const roadPhrase = roadName ? ` para ${roadName}` : '';
  const exitNum = m.exit || '';

  if (type === 'depart') {
    return {
      arrow: '↑',
      roundaboutExit: '',
      roadRef: step.ref || 'PARTIDA',
      instruction: waypointName ? `Partida: ${waypointName}${roadPhrase}` : `Arranca${roadPhrase}`,
      shortDesc: roadName || 'início da rota'
    };
  }

  if (type === 'arrive') {
    return {
      arrow: '🏁',
      roundaboutExit: '',
      roadRef: 'CHEGADA',
      instruction: waypointName ? `Chegada: ${waypointName}` : 'Chegada ao destino',
      shortDesc: waypointName || 'chegada'
    };
  }

  if (type === 'roundabout' || type === 'rotary') {
    const exitOrdinal = exitNum ? `${exitNum}.ª saída` : 'saída indicada';
    return {
      arrow: '↻',
      roundaboutExit: exitNum ? `${exitNum}ª` : '↻',
      roadRef: step.ref || 'ROTUNDA',
      instruction: `Na rotunda, sai na ${exitOrdinal}${roadPhrase}`,
      shortDesc: `rotunda (${exitOrdinal})${roadPhrase}`
    };
  }

  if (type === 'exit roundabout' || type === 'exit rotary') {
    return {
      arrow: '↗',
      roundaboutExit: '',
      roadRef: step.ref || 'SAÍDA',
      instruction: `Sai da rotunda${roadPhrase}`,
      shortDesc: `saída da rotunda${roadPhrase}`
    };
  }

  if (type === 'off ramp' || type === 'on ramp') {
    const dir = mod.includes('left') ? 'à esquerda' : 'à direita';
    return {
      arrow: mod.includes('left') ? '↖' : '↗',
      roundaboutExit: '',
      roadRef: step.ref || 'SAÍDA',
      instruction: `Toma o acesso ${dir}${roadPhrase}`,
      shortDesc: `acesso ${dir}${roadPhrase}`
    };
  }

  if (type === 'fork') {
    const isLeft = mod.includes('left');
    return {
      arrow: isLeft ? '↖' : '↗',
      roundaboutExit: '',
      roadRef: step.ref || 'BIFURCAÇÃO',
      instruction: `Na bifurcação, mantém-te ${isLeft ? 'à esquerda' : 'à direita'}${roadPhrase}`,
      shortDesc: `bifurcação ${isLeft ? 'à esquerda' : 'à direita'}`
    };
  }

  if (mod === 'uturn') {
    return {
      arrow: '↺',
      roundaboutExit: '',
      roadRef: step.ref || 'INVERSÃO',
      instruction: `Inverte o sentido de marcha${roadPhrase}`,
      shortDesc: 'inversão de marcha'
    };
  }

  if (mod === 'sharp right') {
    return {
      arrow: '↻',
      roundaboutExit: '',
      roadRef: step.ref || 'CURVA',
      instruction: `Curva fechada à direita${roadPhrase}`,
      shortDesc: `direita fechada${roadPhrase}`
    };
  }

  if (mod === 'right') {
    return {
      arrow: '↱',
      roundaboutExit: '',
      roadRef: step.ref || 'VIRAGEM',
      instruction: `Vira à direita${roadPhrase}`,
      shortDesc: `direita${roadPhrase}`
    };
  }

  if (mod === 'slight right') {
    return {
      arrow: '↗',
      roundaboutExit: '',
      roadRef: step.ref || 'DESVIO',
      instruction: `Curva ligeira à direita${roadPhrase}`,
      shortDesc: `ligeira direita${roadPhrase}`
    };
  }

  if (mod === 'sharp left') {
    return {
      arrow: '↺',
      roundaboutExit: '',
      roadRef: step.ref || 'CURVA',
      instruction: `Curva fechada à esquerda${roadPhrase}`,
      shortDesc: `esquerda fechada${roadPhrase}`
    };
  }

  if (mod === 'left') {
    return {
      arrow: '↰',
      roundaboutExit: '',
      roadRef: step.ref || 'VIRAGEM',
      instruction: `Vira à esquerda${roadPhrase}`,
      shortDesc: `esquerda${roadPhrase}`
    };
  }

  if (mod === 'slight left') {
    return {
      arrow: '↖',
      roundaboutExit: '',
      roadRef: step.ref || 'DESVIO',
      instruction: `Curva ligeira à esquerda${roadPhrase}`,
      shortDesc: `ligeira esquerda${roadPhrase}`
    };
  }

  return {
    arrow: '↑',
    roundaboutExit: '',
    roadRef: step.ref || 'EM FRENTE',
    instruction: `Segue em frente${roadPhrase}`,
    shortDesc: `em frente${roadPhrase}`
  };
}

// --- MOTOR DE ROTEAMENTO REAL OSRM (NOMES DE RUAS, ROTUNDAS E TRAÇADO EXATO) ---
async function buildOsrmRouteFromPoints(pointsLatLng, waypointsMeta = []) {
  if (!pointsLatLng || pointsLatLng.length < 2) {
    throw new Error('São necessários pelo menos 2 pontos para calcular a rota.');
  }

  let sampledPoints = pointsLatLng;
  if (pointsLatLng.length > 22) {
    const step = (pointsLatLng.length - 1) / 21;
    sampledPoints = [];
    for (let i = 0; i < 22; i++) {
      sampledPoints.push(pointsLatLng[Math.round(i * step)]);
    }
  }

  const coordStr = sampledPoints.map(p => `${p[1].toFixed(5)},${p[0].toFixed(5)}`).join(';');
  const url = `${OSRM_BASE_URL}/${coordStr}?overview=full&geometries=geojson&steps=true`;

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Servidor de roteamento indisponível (HTTP ${resp.status})`);
  }
  const data = await resp.json();
  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error('Não foi possível calcular trajeto rodoviário entre os pontos.');
  }

  const route = data.routes[0];
  const fullCoords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  const totalDistKm = Math.round(route.distance / 1000);

  const tbtSteps = [];
  let cumDistM = 0;

  route.legs.forEach((leg, legIdx) => {
    const originWp = waypointsMeta[legIdx];
    const destWp = waypointsMeta[legIdx + 1];

    leg.steps.forEach((step, stepIdx) => {
      const isLastInLeg = stepIdx === leg.steps.length - 1;
      const isFinalArrival = isLastInLeg && legIdx === route.legs.length - 1;

      if (isLastInLeg && !isFinalArrival) {
        if (destWp) {
          tbtSteps.push({
            lat: step.maneuver.location[1],
            lng: step.maneuver.location[0],
            cumDistM,
            legDistM: Math.round(step.distance),
            arrow: PIN_ICONS[destWp.type] || '📍',
            roundaboutExit: '',
            roadRef: `KM ${Math.round(cumDistM / 1000)}`,
            instruction: `Paragem: ${destWp.name}`,
            shortDesc: destWp.name,
            isWaypoint: true
          });
        }
        cumDistM += step.distance;
        return;
      }

      const wpLabel = stepIdx === 0 ? originWp?.name : (isFinalArrival ? destWp?.name : '');
      const translated = translateOsrmManeuver(step, isLastInLeg, wpLabel);

      tbtSteps.push({
        lat: step.maneuver.location[1],
        lng: step.maneuver.location[0],
        cumDistM,
        legDistM: Math.round(step.distance),
        arrow: translated.arrow,
        roundaboutExit: translated.roundaboutExit,
        roadRef: translated.roadRef,
        instruction: translated.instruction,
        shortDesc: translated.shortDesc,
        isWaypoint: Boolean(wpLabel)
      });

      cumDistM += step.distance;
    });
  });

  for (let i = 0; i < tbtSteps.length; i++) {
    if (i + 1 < tbtSteps.length) {
      const nextStep = tbtSteps[i + 1];
      const gapM = Math.max(0, Math.round(nextStep.cumDistM - tbtSteps[i].cumDistM));
      tbtSteps[i].afterPreview = `Depois: ${nextStep.shortDesc} a ${formatDistanceLabel(gapM)}`;
    } else {
      tbtSteps[i].afterPreview = 'Fim da etapa — estacionamento e descanso';
    }
  }

  return {
    routeCoords: fullCoords,
    totalDistKm,
    tbtSteps
  };
}

// --- FALLBACK GEOMÉTRICO OFFLINE CASO NÃO EXISTA INTERNET ---
function generateGeometricFallbackSteps(coords, waypoints = [], minAngleDeg = 38) {
  if (!coords || coords.length < 2) return [];
  const simplified = [coords[0]];
  for (let i = 1; i < coords.length - 1; i++) {
    const prev = simplified[simplified.length - 1];
    if (calcDistanceMeters(prev[0], prev[1], coords[i][0], coords[i][1]) >= 35) {
      simplified.push(coords[i]);
    }
  }
  simplified.push(coords[coords.length - 1]);

  const cumDistMeters = [0];
  for (let i = 1; i < simplified.length; i++) {
    cumDistMeters.push(
      cumDistMeters[i - 1] + calcDistanceMeters(simplified[i - 1][0], simplified[i - 1][1], simplified[i][0], simplified[i][1])
    );
  }

  const steps = [{
    lat: simplified[0][0],
    lng: simplified[0][1],
    cumDistM: 0,
    legDistM: 0,
    arrow: '↑',
    roundaboutExit: '',
    roadRef: 'OFFLINE',
    instruction: waypoints[0]?.name ? `Partida: ${waypoints[0].name}` : 'Partida (Modo Offline)',
    shortDesc: 'partida',
    isWaypoint: true
  }];

  let lastTurnCum = 0;
  for (let i = 1; i < simplified.length - 1; i++) {
    const b1 = calcBearingDeg(simplified[Math.max(0, i - 2)][0], simplified[Math.max(0, i - 2)][1], simplified[i][0], simplified[i][1]);
    const b2 = calcBearingDeg(simplified[i][0], simplified[i][1], simplified[Math.min(simplified.length - 1, i + 2)][0], simplified[Math.min(simplified.length - 1, i + 2)][1]);
    const delta = normalizeTurnAngle(b1, b2);
    if (Math.abs(delta) >= minAngleDeg && (cumDistMeters[i] - lastTurnCum) >= 90) {
      const right = delta > 0;
      steps.push({
        lat: simplified[i][0],
        lng: simplified[i][1],
        cumDistM: cumDistMeters[i],
        legDistM: Math.round(cumDistMeters[i] - lastTurnCum),
        arrow: right ? '↱' : '↰',
        roundaboutExit: '',
        roadRef: `KM ${(cumDistMeters[i] / 1000).toFixed(1)}`,
        instruction: right ? 'Vira à direita no traçado' : 'Vira à esquerda no traçado',
        shortDesc: right ? 'direita' : 'esquerda',
        isWaypoint: false
      });
      lastTurnCum = cumDistMeters[i];
    }
  }

  const totalM = cumDistMeters[cumDistMeters.length - 1];
  steps.push({
    lat: simplified[simplified.length - 1][0],
    lng: simplified[simplified.length - 1][1],
    cumDistM: totalM,
    legDistM: Math.round(totalM - lastTurnCum),
    arrow: '🏁',
    roundaboutExit: '',
    roadRef: 'CHEGADA',
    instruction: waypoints[waypoints.length - 1]?.name ? `Chegada: ${waypoints[waypoints.length - 1].name}` : 'Chegada ao destino',
    shortDesc: 'chegada',
    isWaypoint: true
  });

  for (let i = 0; i < steps.length; i++) {
    steps[i].afterPreview = i + 1 < steps.length
      ? `Depois: ${steps[i + 1].shortDesc} a ${formatDistanceLabel(steps[i + 1].cumDistM - steps[i].cumDistM)}`
      : 'Fim do percurso';
  }
  return steps;
}

async function enrichActiveTripWithOsrm() {
  const waypoints = activeTrip.waypoints || [];
  const points = waypoints.length >= 2
    ? waypoints.map(w => [w.lat, w.lng])
    : (activeTrip.routeCoords || []);

  if (points.length < 2) return false;

  try {
    const osrmResult = await buildOsrmRouteFromPoints(points, waypoints);
    activeTrip.routeCoords = osrmResult.routeCoords;
    activeTrip.stageDistanceKm = osrmResult.totalDistKm;
    activeTrip.tbtSteps = osrmResult.tbtSteps;
    activeTrip.routingEngine = 'osrm';
    activeTrip.stageSubtitle = `OSRM • ${osrmResult.totalDistKm} km • ${osrmResult.tbtSteps.length} instruções`;
    return true;
  } catch (err) {
    console.warn('OSRM falhou, a usar fallback geométrico:', err);
    activeTrip.tbtSteps = generateGeometricFallbackSteps(activeTrip.routeCoords || points, waypoints);
    activeTrip.routingEngine = 'geometry';
    return false;
  }
}

async function ensureTurnStepsReady() {
  if (!activeTrip.tbtSteps || activeTrip.tbtSteps.length === 0) {
    await enrichActiveTripWithOsrm();
    saveRoadTrip();
  }
  activeTbtIndex = (activeTrip.tbtSteps && activeTrip.tbtSteps.length > 1) ? 1 : 0;
}

// --- RECÁLCULO AUTOMÁTICO QUANDO O CONDUTOR SAI DA ROTA (> 85 METROS) ---
async function triggerAutoRecalculate() {
  if (!currentCoords || isRecalculating) return;
  const now = Date.now();
  if (now - lastRecalcTimestamp < 15000) return;

  isRecalculating = true;
  lastRecalcTimestamp = now;
  const toast = document.getElementById('offRouteToast');
  if (toast) toast.hidden = false;

  if (autoVoiceEnabled) {
    speakInstruction('Fora de rota. A recalcular caminho.');
  }

  try {
    const wps = activeTrip.waypoints || [];
    const remainingWps = wps.filter((_, idx) => !doneWps.includes(idx));
    const targetWps = remainingWps.length > 0 ? remainingWps : [wps[wps.length - 1]].filter(Boolean);

    if (targetWps.length === 0) return;

    const recalcPoints = [currentCoords, ...targetWps.map(w => [w.lat, w.lng])];
    const recalcMeta = [{ name: 'Posição Atual', type: 'start' }, ...targetWps];
    const osrmResult = await buildOsrmRouteFromPoints(recalcPoints, recalcMeta);

    activeTrip.routeCoords = osrmResult.routeCoords;
    activeTrip.tbtSteps = osrmResult.tbtSteps;
    activeTrip.routingEngine = 'osrm';
    announcedStages.clear();
    activeTbtIndex = osrmResult.tbtSteps.length > 1 ? 1 : 0;

    saveRoadTrip();
    renderAllRoadUI();

    if (autoVoiceEnabled && activeTrip.tbtSteps[activeTbtIndex]) {
      speakInstruction(`Rota recalculada. ${activeTrip.tbtSteps[activeTbtIndex].instruction}`);
    }
  } catch (err) {
    console.warn('Falha no recálculo automático:', err);
  } finally {
    isRecalculating = false;
    setTimeout(() => { if (toast) toast.hidden = true; }, 3500);
  }
}

// --- PAINEL TURN-BY-TURN & AVISOS DE VOZ TRIPLOS (1000m -> 300m -> 50m) ---
function updateTurnByTurnPanel() {
  const steps = activeTrip.tbtSteps || [];
  document.getElementById('tbtSpeedBig').textContent = currentSpeedKmh;

  const box = document.getElementById('tbtManeuverBox');
  const exitPill = document.getElementById('tbtRoundaboutExit');

  if (steps.length === 0) {
    document.getElementById('tbtArrow').textContent = '↑';
    exitPill.hidden = true;
    document.getElementById('tbtRoadRef').textContent = 'MANOBRA';
    document.getElementById('tbtDistance').textContent = '—';
    document.getElementById('tbtStepCounter').textContent = '0/0';
    document.getElementById('tbtInstruction').textContent = 'Sem rota carregada';
    document.getElementById('tbtNextPreview').textContent = 'Importa uma viagem ou GPX no separador GPX/Sync';
    return;
  }

  activeTbtIndex = Math.max(0, Math.min(activeTbtIndex, steps.length - 1));
  const step = steps[activeTbtIndex];

  document.getElementById('tbtArrow').textContent = step.arrow || '↑';
  document.getElementById('tbtRoadRef').textContent = step.roadRef || 'MANOBRA';
  document.getElementById('tbtStepCounter').textContent = `${activeTbtIndex + 1}/${steps.length}`;
  document.getElementById('tbtInstruction').textContent = step.instruction;
  document.getElementById('tbtNextPreview').textContent = step.afterPreview || 'Mantém trajetória';

  if (step.roundaboutExit) {
    exitPill.textContent = step.roundaboutExit;
    exitPill.hidden = false;
  } else {
    exitPill.hidden = true;
  }

  let distMeters = null;
  if (currentCoords && step.lat && step.lng) {
    distMeters = calcDistanceMeters(currentCoords[0], currentCoords[1], step.lat, step.lng);
    document.getElementById('tbtDistance').textContent = formatDistanceLabel(distMeters);

    if (distMeters <= 120) {
      box.classList.add('imminent');
    } else {
      box.classList.remove('imminent');
    }

    if (distMeters <= 35 && activeTbtIndex < steps.length - 1) {
      activeTbtIndex += 1;
      updateTurnByTurnPanel();
      return;
    }

    if (autoVoiceEnabled) {
      if (!announcedStages.has(activeTbtIndex)) {
        announcedStages.set(activeTbtIndex, new Set());
      }
      const spokenSet = announcedStages.get(activeTbtIndex);

      if (distMeters <= 1050 && distMeters > 450 && !spokenSet.has('1000')) {
        spokenSet.add('1000');
        speakInstruction(`A um quilómetro, ${step.instruction}.`);
      } else if (distMeters <= 320 && distMeters > 90 && !spokenSet.has('300')) {
        spokenSet.add('300');
        speakInstruction(`A ${formatDistanceLabel(distMeters)}, ${step.instruction}. ${step.afterPreview}`);
      } else if (distMeters <= 65 && distMeters > 20 && !spokenSet.has('50')) {
        spokenSet.add('50');
        speakInstruction(`Agora, ${step.instruction}.`);
      }
    }
  } else {
    box.classList.remove('imminent');
    document.getElementById('tbtDistance').textContent = formatDistanceLabel(step.legDistM || 0);
  }
}

function renderAllRoadUI() {
  document.getElementById('hudTripCode').textContent = activeTrip.tripCode || 'ROTA ATIVA';
  document.getElementById('hudTripTitle').textContent = activeTrip.tripTitle;
  document.getElementById('hudStageSubtitle').textContent = activeTrip.stageSubtitle || '';
  document.getElementById('importTripCodeInput').value = activeTrip.tripCode || '';

  const engineBadge = document.getElementById('hudRouteEngineBadge');
  if (activeTrip.routingEngine === 'osrm') {
    engineBadge.textContent = '🛣️ RUAS + ROTUNDAS';
  } else {
    engineBadge.textContent = '🧭 TRAÇADO OFFLINE';
  }

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
    map.fitBounds(poly.getBounds(), { padding: [18, 18] });
  }

  (activeTrip.tbtSteps || []).forEach((step, idx) => {
    if (step.isWaypoint) return;
    L.circleMarker([step.lat, step.lng], {
      radius: 4,
      color: '#111827',
      weight: 2,
      fillColor: '#f59e0b',
      fillOpacity: 0.95
    })
      .bindPopup(`<strong>${step.arrow} Manobra ${idx + 1}</strong><br/>${step.instruction}`)
      .addTo(turnMarkersLayer);
  });

  (activeTrip.waypoints || []).forEach((wp, idx) => {
    const iconHtml = `<div style="font-size:20px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.85))">${PIN_ICONS[wp.type] || '📍'}</div>`;
    const icon = L.divIcon({ html: iconHtml, className: 'road-pin', iconSize: [24, 24] });
    L.marker([wp.lat, wp.lng], { icon })
      .bindPopup(`<strong>${idx + 1}. ${wp.name}</strong><br/>Km ${wp.km}`)
      .addTo(markersLayer);
  });
}

function getNextPendingWaypoint() {
  const wps = activeTrip.waypoints || [];
  const nextIdx = wps.findIndex((_, i) => !doneWps.includes(i));
  return nextIdx !== -1 ? wps[nextIdx] : wps[wps.length - 1];
}

function openInOrganicMaps(lat, lng, label = 'Destino MOTOATLAS') {
  if (!lat || !lng) return;
  const encodedName = encodeURIComponent(label);
  const omUrl = `om://map?v=1&ll=${lat.toFixed(6)},${lng.toFixed(6)}&n=${encodedName}`;
  window.location.href = omUrl;
}

function renderRoadbookList() {
  const listEl = document.getElementById('roadWpList');
  const wps = activeTrip.waypoints || [];
  listEl.innerHTML = '';

  const nextWp = getNextPendingWaypoint();
  if (nextWp) {
    document.getElementById('nextWpTitle').textContent = `${PIN_ICONS[nextWp.type] || '📍'} ${nextWp.name}`;
    document.getElementById('nextWpDist').textContent = `Km ${nextWp.km}`;
  }

  wps.forEach((wp, idx) => {
    const isDone = doneWps.includes(idx);
    const row = document.createElement('div');
    row.className = `wp-glove-item ${isDone ? 'done' : ''}`;
    row.innerHTML = `
      <div>
        <strong>${PIN_ICONS[wp.type] || '📍'} ${wp.name}</strong>
        <small>Km ${wp.km}</small>
      </div>
      <div class="wp-item-actions">
        <button type="button" class="btn-glove-sm" title="Centrar no mapa" onclick="event.stopPropagation(); focusRoadWp(${idx})">🎯</button>
        <button type="button" class="btn-glove-sm organic-btn" title="Navegar no Organic Maps" onclick="event.stopPropagation(); openWpOrganic(${idx})">🗺️</button>
      </div>
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
  if (wp && map) map.setView([wp.lat, wp.lng], 15);
};

window.openWpOrganic = function(idx) {
  const wp = (activeTrip.waypoints || [])[idx];
  if (wp) openInOrganicMaps(wp.lat, wp.lng, wp.name);
};

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

// --- PRÉ-CACHE DE BLOCOS DO MAPA OPENSTREETMAP PARA ZONAS SEM REDE ---
async function preCacheRouteMapTiles() {
  const fb = document.getElementById('roadSyncFeedback');
  const coords = activeTrip.routeCoords || [];
  if (coords.length < 2) {
    fb.textContent = '⚠️ Carrega primeiro uma viagem ou rota.';
    return;
  }

  const zooms = [11, 13, 14];
  const tileUrls = new Set();

  const step = Math.max(1, Math.floor(coords.length / 45));
  for (let i = 0; i < coords.length; i += step) {
    const [lat, lon] = coords[i];
    zooms.forEach(z => {
      const x = Math.floor(((lon + 180) / 360) * Math.pow(2, z));
      const latRad = (lat * Math.PI) / 180;
      const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, z));
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          tileUrls.add(`https://a.tile.openstreetmap.org/${z}/${x + dx}/${y + dy}.png`);
        }
      }
    });
  }

  const urls = Array.from(tileUrls).slice(0, 260);
  fb.textContent = `⏳ A guardar ${urls.length} blocos de mapa offline no iPhone...`;

  let saved = 0;
  for (const u of urls) {
    try {
      await fetch(u, { mode: 'no-cors' });
      saved++;
      if (saved % 40 === 0) {
        fb.textContent = `⏳ Cache offline: ${saved}/${urls.length} blocos guardados...`;
      }
    } catch {
      // Ignora falhas pontuais
    }
  }
  fb.textContent = `✅ ${saved} blocos de mapa guardados em cache offline para a rota!`;
}

// --- EXPORTAR ROTA COMPLETA EM GPX PARA ORGANIC MAPS / OSMAND ---
function exportActiveRouteAsGpx() {
  const coords = activeTrip.routeCoords || [];
  const wps = activeTrip.waypoints || [];
  if (coords.length < 2) return;

  const esc = s => String(s || '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

  const wptXml = wps.map(w => `  <wpt lat="${w.lat}" lon="${w.lng}"><name>${esc(w.name)}</name></wpt>`).join('\n');
  const trkXml = coords.map(([lat, lng]) => `      <trkpt lat="${lat}" lon="${lng}"></trkpt>`).join('\n');

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MOTOATLAS Road v1.4.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(activeTrip.tripTitle)}</name></metadata>
${wptXml}
  <trk>
    <name>${esc(activeTrip.tripTitle)}</name>
    <trkseg>
${trkXml}
    </trkseg>
  </trk>
</gpx>`;

  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(activeTrip.tripCode || 'rota').toLowerCase()}_motoatlas.gpx`;
  a.click();
}

function toggleGps() {
  const btn = document.getElementById('btnToggleGps');
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
    currentSpeedKmh = 0;
    releaseScreenWakeLock();
    btn.textContent = '📡 GPS: OFF';
    document.getElementById('telSpeed').innerHTML = `0 <small>km/h</small>`;
    document.getElementById('tbtSpeedBig').textContent = '0';
    return;
  }

  if (!('geolocation' in navigator)) {
    alert('Geolocalização não suportada neste dispositivo.');
    return;
  }

  requestScreenWakeLock();
  btn.textContent = '📡 GPS: ON';
  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, speed } = pos.coords;
      currentCoords = [latitude, longitude];
      currentSpeedKmh = speed !== null && !Number.isNaN(speed) ? Math.round(speed * 3.6) : 0;

      document.getElementById('telSpeed').innerHTML = `${currentSpeedKmh} <small>km/h</small>`;
      document.getElementById('tbtSpeedBig').textContent = currentSpeedKmh;

      if (!gpsMarker) {
        const motoIcon = L.divIcon({
          html: '<div style="font-size:22px;">🏍️</div>',
          className: 'gps-moto-pin',
          iconSize: [26, 26]
        });
        gpsMarker = L.marker(currentCoords, { icon: motoIcon }).addTo(map);
      } else {
        gpsMarker.setLatLng(currentCoords);
      }
      map.panTo(currentCoords);

      const offDist = distanceToRouteMeters(latitude, longitude, activeTrip.routeCoords || []);
      if (offDist > 85) {
        triggerAutoRecalculate();
      }

      updateTurnByTurnPanel();
    },
    (err) => {
      alert(`Erro GPS: ${err.message}`);
    },
    { enableHighAccuracy: true, maximumAge: 1500 }
  );
}

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

  fb.textContent = `⏳ A descarregar "${code}" e a calcular ruas & rotundas...`;
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
    announcedStages.clear();
    await enrichActiveTripWithOsrm();
    activeTbtIndex = activeTrip.tbtSteps.length > 1 ? 1 : 0;
    saveRoadTrip();
    renderAllRoadUI();
    fb.textContent = `✅ Viagem "${activeTrip.tripTitle}" pronta (${activeTrip.tbtSteps.length} instruções com ruas e rotundas)!`;
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

function parseGpxBasic(xmlText, fileName = 'Rota GPX') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Ficheiro GPX inválido.');

  const trkName = doc.querySelector('trk > name')?.textContent?.trim()
    || doc.querySelector('rte > name')?.textContent?.trim()
    || fileName.replace(/\.gpx$/i, '');

  let ptNodes = Array.from(doc.querySelectorAll('trkpt'));
  if (ptNodes.length < 2) ptNodes = Array.from(doc.querySelectorAll('rtept'));

  const routeCoords = ptNodes
    .map(pt => [parseFloat(pt.getAttribute('lat')), parseFloat(pt.getAttribute('lon'))])
    .filter(([lat, lng]) => !Number.isNaN(lat) && !Number.isNaN(lng));

  if (routeCoords.length < 2) throw new Error('GPX sem pontos suficientes.');

  const wptNodes = Array.from(doc.querySelectorAll('wpt'));
  const waypoints = wptNodes.length >= 2
    ? wptNodes.map((wpt, idx) => ({
        name: wpt.querySelector('name')?.textContent?.trim() || `Paragem ${idx + 1}`,
        type: idx === 0 ? 'start' : (idx === wptNodes.length - 1 ? 'sleep' : 'viewpoint'),
        lat: parseFloat(wpt.getAttribute('lat')),
        lng: parseFloat(wpt.getAttribute('lon')),
        km: 0
      }))
    : [
        { name: `Partida: ${trkName}`, type: 'start', lat: routeCoords[0][0], lng: routeCoords[0][1], km: 0 },
        { name: `Chegada: ${trkName}`, type: 'sleep', lat: routeCoords[routeCoords.length - 1][0], lng: routeCoords[routeCoords.length - 1][1], km: 0 }
      ];

  return {
    id: `gpx-${Date.now()}`,
    tripCode: `GPX-${Math.floor(100 + Math.random() * 900)}`,
    profile: 'moto',
    routingEngine: 'geometry',
    tripTitle: trkName,
    stageSubtitle: 'A processar rota...',
    stageDistanceKm: 0,
    odometerKm: activeTrip.odometerKm || 0,
    tankCapacityL: activeTrip.tankCapacityL || 14.1,
    avgConsumptionL100: activeTrip.avgConsumptionL100 || 3.8,
    waypoints,
    routeCoords,
    tbtSteps: [],
    expenses: []
  };
}

function bindEvents() {
  document.getElementById('btnThemeToggle').addEventListener('click', () => {
    const curr = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', curr === 'dark' ? 'light' : 'dark');
  });

  document.getElementById('btnMapNightDim').addEventListener('click', (e) => {
    const mapEl = document.getElementById('road-map');
    mapDimLevel = (mapDimLevel + 1) % 3;
    mapEl.classList.remove('night-dim-75', 'night-dim-55');
    if (mapDimLevel === 0) e.target.textContent = '🌘 100%';
    else if (mapDimLevel === 1) { mapEl.classList.add('night-dim-75'); e.target.textContent = '🌘 75%'; }
    else { mapEl.classList.add('night-dim-55'); e.target.textContent = '🌘 55%'; }
  });

  document.getElementById('btnToggleAutoVoice').addEventListener('click', (e) => {
    autoVoiceEnabled = !autoVoiceEnabled;
    e.target.textContent = autoVoiceEnabled ? '🔊 Voz: ON' : '🔇 Voz: OFF';
    document.getElementById('voiceStatusBadge').textContent = autoVoiceEnabled ? '🔊 Voz: ON' : '🔇 Voz: OFF';
    if (autoVoiceEnabled) {
      const step = (activeTrip.tbtSteps || [])[activeTbtIndex];
      if (step) speakInstruction(`Voz ativada. Próxima manobra: ${step.instruction}`);
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  });

  document.getElementById('btnTbtRepeatVoice').addEventListener('click', () => {
    const step = (activeTrip.tbtSteps || [])[activeTbtIndex];
    if (!step) return;
    const dist = document.getElementById('tbtDistance').textContent;
    speakInstruction(`A ${dist}, ${step.instruction}. ${step.afterPreview}`);
  });

  document.getElementById('btnTbtRecalcNow').addEventListener('click', async () => {
    if (currentCoords) {
      lastRecalcTimestamp = 0;
      await triggerAutoRecalculate();
    } else {
      await enrichActiveTripWithOsrm();
      activeTbtIndex = activeTrip.tbtSteps.length > 1 ? 1 : 0;
      saveRoadTrip();
      renderAllRoadUI();
      speakInstruction('Rota atualizada com nomes de ruas e rotundas.');
    }
  });

  document.getElementById('btnTbtPrevStep').addEventListener('click', () => {
    if (activeTbtIndex > 0) {
      activeTbtIndex -= 1;
      updateTurnByTurnPanel();
      const step = activeTrip.tbtSteps[activeTbtIndex];
      if (step && map) map.panTo([step.lat, step.lng]);
    }
  });

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

  document.getElementById('btnEnrichRouteOsrm').addEventListener('click', async () => {
    const fb = document.getElementById('roadSyncFeedback');
    fb.textContent = '⏳ A obter nomes de ruas, saídas de rotundas e traçado exato...';
    const ok = await enrichActiveTripWithOsrm();
    announcedStages.clear();
    activeTbtIndex = activeTrip.tbtSteps.length > 1 ? 1 : 0;
    saveRoadTrip();
    renderAllRoadUI();
    fb.textContent = ok
      ? `✅ Rota atualizada com ${activeTrip.tbtSteps.length} instruções reais (ruas e rotundas)!`
      : '⚠️ Sem ligação à internet — mantido modo offline geométrico.';
  });

  document.getElementById('btnCacheMapTiles').addEventListener('click', preCacheRouteMapTiles);
  document.getElementById('btnExportRouteGpx').addEventListener('click', exportActiveRouteAsGpx);

  document.getElementById('roadGpxFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fb = document.getElementById('roadSyncFeedback');
    try {
      const xmlText = await file.text();
      activeTrip = parseGpxBasic(xmlText, file.name);
      doneWps = [];
      announcedStages.clear();
      fb.textContent = '⏳ A associar nomes de ruas e rotundas ao GPX...';
      await enrichActiveTripWithOsrm();
      activeTbtIndex = activeTrip.tbtSteps.length > 1 ? 1 : 0;
      saveRoadTrip();
      renderAllRoadUI();
      fb.textContent = `✅ GPX "${activeTrip.tripTitle}" pronto (${activeTrip.tbtSteps.length} instruções)!`;
    } catch (err) {
      fb.textContent = `❌ Erro ao ler GPX: ${err.message}`;
    } finally {
      e.target.value = '';
    }
  });

  document.getElementById('btnToggleGps').addEventListener('click', toggleGps);
  document.getElementById('btnCenterRoute').addEventListener('click', renderMap);

  document.getElementById('btnOpenOrganicMaps').addEventListener('click', () => {
    const nextWp = getNextPendingWaypoint();
    if (nextWp) openInOrganicMaps(nextWp.lat, nextWp.lng, nextWp.name);
  });

  document.getElementById('btnShareCoords').addEventListener('click', () => {
    const nextWp = getNextPendingWaypoint();
    const lat = currentCoords ? currentCoords[0] : nextWp?.lat;
    const lng = currentCoords ? currentCoords[1] : nextWp?.lng;
    if (!lat || !lng) return;
    const msg = `MOTOATLAS (${activeTrip.tripCode}): https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (navigator.share) {
      navigator.share({ title: activeTrip.tripTitle, text: msg }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(msg);
      alert(`Coordenadas copiadas:\n${msg}`);
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
    activeTrip.expenses.push({ id: Date.now(), category: cat, amount, payer, liters, tripKm, note });

    saveRoadTrip();
    renderAllRoadUI();
    e.target.reset();
    alert('✅ Registo guardado na memória local da mota!');
  });

  document.getElementById('roadJsonFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fb = document.getElementById('roadSyncFeedback');
    const parsed = JSON.parse(await file.text());
    activeTrip = parsed.trip ? parsed.trip : parsed;
    doneWps = [];
    announcedStages.clear();
    fb.textContent = '⏳ A enriquecer viagem com ruas e rotundas...';
    await enrichActiveTripWithOsrm();
    activeTbtIndex = activeTrip.tbtSteps.length > 1 ? 1 : 0;
    saveRoadTrip();
    renderAllRoadUI();
    fb.textContent = `✅ Viagem "${activeTrip.tripTitle}" importada (${activeTrip.tbtSteps.length} instruções)!`;
  });

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
    document.getElementById('roadSyncFeedback').textContent = '✅ Credenciais Supabase guardadas no iPhone!';
  });

  document.getElementById('btnPullTripByCode').addEventListener('click', pullTripByCodeFromSupabase);
  document.getElementById('btnPushCompletedTrip').addEventListener('click', pushCompletedTripBackToStudio);
}
