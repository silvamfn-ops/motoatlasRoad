// MOTOATLAS Road v1.0 — Cockpit Leve de Guiador (100% Offline-First + Sync com MOTOATLAS Studio)
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
  initNavigation();
  initMap();
  loadSbInputs();
  renderAllRoadUI();
  bindEvents();
});

function initNavigation() {
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

function initMap() {
  map = L.map('road-map', { zoomControl: false }).setView([38.5, -8.0], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OSM'
  }).addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  markersLayer = L.layerGroup().addTo(map);
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
    const poly = L.polyline(coords, { color: '#f59e0b', weight: 6, opacity: 0.95 }).addTo(routeLayer);
    map.fitBounds(poly.getBounds(), { padding: [22, 22] });
  }

  (activeTrip.waypoints || []).forEach((wp, idx) => {
    const iconHtml = `<div style="font-size:22px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.8))">${PIN_ICONS[wp.type] || '📍'}</div>`;
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

// --- GPS LIVE ---
function toggleGps() {
  const btn = document.getElementById('btnToggleGps');
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
    btn.textContent = '📡 GPS: OFF';
    document.getElementById('telSpeed').innerHTML = `0 <small>km/h</small>`;
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
      const kmh = speed ? Math.round(speed * 3.6) : 0;
      document.getElementById('telSpeed').innerHTML = `${kmh} <small>km/h</small>`;

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
    },
    (err) => {
      alert(`Erro GPS: ${err.message}`);
    },
    { enableHighAccuracy: true, maximumAge: 3000 }
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
  document.getElementById('btnThemeToggle').addEventListener('click', () => {
    const curr = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', curr === 'dark' ? 'light' : 'dark');
  });

  document.getElementById('btnToggleGps').addEventListener('click', toggleGps);
  document.getElementById('btnCenterRoute').addEventListener('click', renderMap);

  document.getElementById('btnOpenExternalNav').addEventListener('click', () => {
    const wps = activeTrip.waypoints || [];
    const nextIdx = wps.findIndex((_, i) => !doneWps.includes(i));
    const target = nextIdx !== -1 ? wps[nextIdx] : wps[wps.length - 1];
    if (!target) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=driving`, '_blank');
  });

  document.getElementById('btnShareCoords').addEventListener('click', () => {
    const wps = activeTrip.waypoints || [];
    const nextIdx = wps.findIndex((_, i) => !doneWps.includes(i));
    const target = nextIdx !== -1 ? wps[nextIdx] : wps[0];
    const lat = currentCoords ? currentCoords[0] : target?.lat;
    const lng = currentCoords ? currentCoords[1] : target?.lng;
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
