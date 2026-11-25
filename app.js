// MOTOATLAS Road v1.1 — Cockpit de Guiador (Mapa OSM Detalhado + Voz Auto + Painel Turn-by-Turn)
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
  expenses: []
};

const PIN_ICONS = {
  start: '🏁',
  fuel: '⛽',
  viewpoint: '📸',
  monument: '🏛️',
  sleep: '🏨'
};

let activeTrip = loadRoadTrip();
let doneWps = JSON.parse(localStorage.getItem(ROAD_DONE_WPS_KEY) || '[]');
let map = null;
let routeLayer = null;
let markersLayer = null;
let gpsMarker = null;
let gpsWatchId = null;
let currentCoords = null;
let currentSpeedKmh = 0;

// Estado de Voz & Contraste do Mapa
let autoVoiceEnabled = true;
let announcedWpIndices = new Set();
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
  // Mosaico OpenStreetMap Standard gratuito, sem API Key, com todo o detalhe de estradas nacionais, curvas e localidades
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  routeLayer = L.layerGroup().addTo(map);
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

// --- CÁLCULO GEODÉSICO DE DISTÂNCIA (HAVERSINE EM METROS) ---
function calcDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatDistanceLabel(meters) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.max(0, Math.round(meters / 10) * 10)} m`;
}

function getNextWaypointData() {
  const wps = activeTrip.waypoints || [];
  if (wps.length === 0) return { wp: null, idx: -1, nextWp: null };
  const idx = wps.findIndex((_, i) => !doneWps.includes(i));
  const activeIdx = idx !== -1 ? idx : wps.length - 1;
  const wp = wps[activeIdx];
  const nextWp = activeIdx + 1 < wps.length ? wps[activeIdx + 1] : null;
  return { wp, idx: activeIdx, nextWp };
}

function inferManeuverFromWaypoint(wp, nextWp) {
  const arrow = wp.arrow || (wp.type === 'fuel' ? '↻' : wp.type === 'sleep' ? '🏁' : '↱');
  const instruction = wp.maneuver || `${wp.name} (Marco Km ${wp.km})`;
  const afterPreview = wp.afterPreview || (nextWp
    ? `Depois: segue para ${nextWp.name} (Km ${nextWp.km})`
    : 'Depois: chegada ao destino final da etapa');
  return { arrow, instruction, afterPreview };
}

function updateTurnByTurnPanel() {
  const { wp, idx, nextWp } = getNextWaypointData();
  document.getElementById('tbtSpeedBig').textContent = currentSpeedKmh;

  if (!wp) {
    document.getElementById('tbtArrow').textContent = '↑';
    document.getElementById('tbtDistance').textContent = '—';
    document.getElementById('tbtInstruction').textContent = 'Sem pontos carregados';
    document.getElementById('tbtNextPreview').textContent = 'Importa uma rota no separador Sync';
    return;
  }

  const { arrow, instruction, afterPreview } = inferManeuverFromWaypoint(wp, nextWp);
  document.getElementById('tbtArrow').textContent = arrow;
  document.getElementById('tbtInstruction').textContent = instruction;
  document.getElementById('tbtNextPreview').textContent = afterPreview;

  let distMeters = null;
  if (currentCoords && wp.lat && wp.lng) {
    distMeters = calcDistanceMeters(currentCoords[0], currentCoords[1], wp.lat, wp.lng);
    document.getElementById('tbtDistance').textContent = formatDistanceLabel(distMeters);
  } else {
    // Fallback simulado pelo marco quilométrico do roadbook quando o GPS está desligado
    const prevWp = idx > 0 ? activeTrip.waypoints[idx - 1] : { km: 0 };
    const deltaKm = Math.max(0, (wp.km || 0) - (prevWp.km || 0));
    document.getElementById('tbtDistance').textContent = deltaKm > 0 ? `${deltaKm} km` : '0 m';
  }

  // Disparo automático de voz ao aproximar-se de uma curva/ponto (< 600 m com GPS ativo)
  if (autoVoiceEnabled && distMeters !== null && distMeters <= 600 && !announcedWpIndices.has(idx)) {
    announcedWpIndices.add(idx);
    speakInstruction(`A ${formatDistanceLabel(distMeters)}, ${instruction}. ${afterPreview}`);
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
  markersLayer.clearLayers();

  const coords = activeTrip.routeCoords && activeTrip.routeCoords.length > 1
    ? activeTrip.routeCoords
    : (activeTrip.waypoints || []).map(w => [w.lat, w.lng]);

  if (coords.length > 1) {
    const poly = L.polyline(coords, { color: '#d97706', weight: 6, opacity: 0.95 }).addTo(routeLayer);
    map.fitBounds(poly.getBounds(), { padding: [22, 22] });
  }

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

  const { wp: nextWp } = getNextWaypointData();
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
      updateTurnByTurnPanel();
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
    announcedWpIndices.clear();
    saveRoadTrip();
    renderAllRoadUI();
    fb.textContent = `✅ Viagem "${activeTrip.tripTitle}" carregada e pronta a rodar offline!`;
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
      const { wp, nextWp } = getNextWaypointData();
      if (wp) {
        const { instruction } = inferManeuverFromWaypoint(wp, nextWp);
        speakInstruction(`Voz ativada. Próximo ponto: ${instruction}`);
      }
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  });

  // Botão Turn-by-Turn: Repetir instrução no intercomunicador
  document.getElementById('btnTbtRepeatVoice').addEventListener('click', () => {
    const { wp, nextWp } = getNextWaypointData();
    if (!wp) return;
    const dist = document.getElementById('tbtDistance').textContent;
    const { instruction, afterPreview } = inferManeuverFromWaypoint(wp, nextWp);
    speakInstruction(`A ${dist}, ${instruction}. ${afterPreview}`);
  });

  // Botão Turn-by-Turn: Avançar para a próxima manobra do roadbook
  document.getElementById('btnTbtNextStep').addEventListener('click', () => {
    const { idx } = getNextWaypointData();
    if (idx !== -1 && !doneWps.includes(idx)) {
      doneWps.push(idx);
      saveRoadTrip();
      renderRoadbookList();
      updateTurnByTurnPanel();
      if (autoVoiceEnabled) {
        const nextData = getNextWaypointData();
        if (nextData.wp) {
          const { instruction, afterPreview } = inferManeuverFromWaypoint(nextData.wp, nextData.nextWp);
          speakInstruction(`Próxima manobra: ${instruction}. ${afterPreview}`);
        }
      }
    }
  });

  document.getElementById('btnToggleGps').addEventListener('click', toggleGps);
  document.getElementById('btnCenterRoute').addEventListener('click', renderMap);

  document.getElementById('btnShareCoords').addEventListener('click', () => {
    const { wp } = getNextWaypointData();
    const lat = currentCoords ? currentCoords[0] : wp?.lat;
    const lng = currentCoords ? currentCoords[1] : wp?.lng;
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
    announcedWpIndices.clear();
    saveRoadTrip();
    renderAllRoadUI();
    document.getElementById('roadSyncFeedback').textContent = `✅ Viagem "${activeTrip.tripTitle}" importada do ficheiro!`;
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
