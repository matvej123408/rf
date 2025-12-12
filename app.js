// app.js
const map = L.map('map').setView([52.52, 13.405], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const statusEl = document.getElementById('status');
const btnLoad = document.getElementById('btnLoad');
const btnRoute = document.getElementById('btnRoute');
const btnAddStop = document.getElementById('btnAddStop');
const btnExport = document.getElementById('btnExport');
const importFile = document.getElementById('importFile');
const selFrom = document.getElementById('stationFrom');
const selTo = document.getElementById('stationTo');

let railwayLayer = L.layerGroup().addTo(map);
let stationsLayer = L.layerGroup().addTo(map);
let routeLayer = L.layerGroup().addTo(map);
let movingMarker = null;

let nodes = {};
let nodeCoords = {};
let stations = []; // loaded from OSM
let customStops = []; // user-added stops saved in localStorage

function setStatus(s){ statusEl.textContent = s || ''; }

function bboxToOverpass(bbox) {
  return `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`;
}

async function fetchRailwaysAndStations() {
  setStatus('Запрос к Overpass API...');
  const bbox = map.getBounds();
  const bb = [bbox.getSouth(), bbox.getWest(), bbox.getNorth(), bbox.getEast()];
  const query = `
[out:json][timeout:25];
(
  way["railway"="rail"](${bboxToOverpass(bb)});
  node["railway"="station"](${bboxToOverpass(bb)});
  node["station"="rail"](${bboxToOverpass(bb)});
  node["railway"="halt"](${bboxToOverpass(bb)});
  node["public_transport"="station"](${bboxToOverpass(bb)});
);
(._;>;);
out body;
`;
  const url = 'https://overpass-api.de/api/interpreter';
  const resp = await fetch(url, { method: 'POST', body: query });
  if(!resp.ok) throw new Error('Overpass error: ' + resp.status);
  const data = await resp.json();
  return data;
}

function clearGraph() {
  nodes = {};
  nodeCoords = {};
  stations = [];
  railwayLayer.clearLayers();
  stationsLayer.clearLayers();
  routeLayer.clearLayers();
  selFrom.innerHTML = '<option value="">От станции...</option>';
  selTo.innerHTML = '<option value="">К станции...</option>';
}

function buildGraphFromOverpass(osm) {
  const nodesMap = {};
  osm.elements.forEach(el => {
    if(el.type === 'node') nodesMap[el.id] = el;
  });

  osm.elements.forEach(el => {
    if(el.type === 'way') {
      const nds = el.nodes;
      const latlngs = nds.map(nid => [nodesMap[nid].lat, nodesMap[nid].lon]);
      L.polyline(latlngs, { color: '#000000', weight: 4 }).addTo(railwayLayer);
      for(let i=0;i<nds.length-1;i++){
        const a = nds[i], b = nds[i+1];
        if(!nodes[a]) nodes[a] = { lat: nodesMap[a].lat, lon: nodesMap[a].lon, edges: [] };
        if(!nodes[b]) nodes[b] = { lat: nodesMap[b].lat, lon: nodesMap[b].lon, edges: [] };
        nodeCoords[a] = L.latLng(nodesMap[a].lat, nodesMap[a].lon);
        nodeCoords[b] = L.latLng(nodesMap[b].lat, nodesMap[b].lon);
        const len = haversine(nodes[a].lat, nodes[a].lon, nodes[b].lat, nodes[b].lon);
        nodes[a].edges.push({ to: b, len });
        nodes[b].edges.push({ to: a, len });
      }
    }
  });

  osm.elements.forEach(el => {
    if(el.type === 'node') {
      const tags = el.tags || {};
      const isStation = tags.railway === 'station' || tags.station === 'rail' || tags.public_transport === 'station' || tags.railway === 'halt';
      if(isStation) {
        let nearestId = null;
        let bestD = Infinity;
        for(const nid in nodes) {
          const d = haversine(el.lat, el.lon, nodes[nid].lat, nodes[nid].lon);
          if(d < bestD) { bestD = d; nearestId = nid; }
        }
        const name = tags.name || ('Станция ' + el.id);
        const st = { id: el.id, name, nodeId: nearestId, lat: el.lat, lon: el.lon };
        stations.push(st);
        const m = L.marker([el.lat, el.lon]).addTo(stationsLayer);
        m.bindPopup(`<b>${name}</b><br>node ${nearestId || '—'}`);
        m.on('click', ()=> {
          if(!selFrom.value) selFrom.value = st.nodeId || '';
          else selTo.value = st.nodeId || '';
        });
      }
    }
  });

  populateSelects();
}

function populateSelects() {
  // add OSM stations
  const seen = new Set();
  stations.forEach(s => {
    if(!s.nodeId) return;
    if(seen.has(s.nodeId)) return;
    seen.add(s.nodeId);
    const optionText = `${s.name} (${s.lat.toFixed(4)},${s.lon.toFixed(4)})`;
    const opt = document.createElement('option');
    opt.value = s.nodeId;
    opt.textContent = optionText;
    selFrom.appendChild(opt.cloneNode(true));
    selTo.appendChild(opt.cloneNode(true));
  });
  // add custom stops (use their own synthetic node id 'cs:<index>')
  customStops.forEach((cs, idx) => {
    const id = `cs:${idx}`;
    const optionText = `${cs.name} (custom)`;
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = optionText;
    selFrom.appendChild(opt.cloneNode(true));
    selTo.appendChild(opt.cloneNode(true));
  });
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function dijkstra(startId, goalId) {
  // support custom stops: map 'cs:idx' to nearest graph node
  function resolve(id) {
    if(id.startsWith('cs:')) {
      const idx = Number(id.split(':')[1]);
      const cs = customStops[idx];
      if(!cs) return null;
      // find nearest real node
      let nearest = null, best = Infinity;
      for(const nid in nodes) {
        const d = haversine(cs.lat, cs.lon, nodes[nid].lat, nodes[nid].lon);
        if(d < best) { best = d; nearest = nid; }
      }
      return nearest;
    }
    return id;
  }
  const s = resolve(startId); const g = resolve(goalId);
  if(!s || !g || !nodes[s] || !nodes[g]) return null;
  const dist = {}; const prev = {}; const Q = new Set(Object.keys(nodes));
  for(const v of Q) { dist[v] = Infinity; prev[v] = null; }
  dist[s] = 0;
  while(Q.size) {
    let u = null, best = Infinity;
    for(const x of Q) { if(dist[x] < best) { best = dist[x]; u = x; } }
    if(u === null) break;
    Q.delete(u);
    if(u === g) break;
    for(const e of nodes[u].edges) {
      const alt = dist[u] + e.len;
      if(alt < dist[e.to]) { dist[e.to] = alt; prev[e.to] = u; }
    }
  }
  if(prev[g] === null && s !== g) return null;
  const path = []; let cur = g;
  while(cur) {
    path.push(cur);
    if(cur === s) break;
    cur = prev[cur];
  }
  path.reverse();
  return path;
}

function drawPath(nodePath) {
  routeLayer.clearLayers();
  if(!nodePath || nodePath.length === 0) return;
  const latlngs = nodePath.map(nid => [nodes[nid].lat, nodes[nid].lon]);
  const poly = L.polyline(latlngs, { color: 'blue', weight: 5 }).addTo(routeLayer);
  if(movingMarker) movingMarker.remove();
  movingMarker = L.marker(latlngs[0]).addTo(routeLayer);
  let idx = 0;
  const step = ()=> {
    idx++;
    if(idx >= latlngs.length) return;
    movingMarker.setLatLng(latlngs[idx]);
    setTimeout(step, 500);
  };
  step();
  map.fitBounds(poly.getBounds(), { padding: [50,50] });
}

// Custom stops: localStorage persistence
function loadCustomStops() {
  try {
    const raw = localStorage.getItem('railnav:customStops');
    if(!raw) return;
    customStops = JSON.parse(raw);
  } catch(e) { customStops = []; }
}

function saveCustomStops() {
  localStorage.setItem('railnav:customStops', JSON.stringify(customStops));
}

function renderCustomStopsOnMap() {
  stationsLayer.clearLayers();
  // re-draw OSM stations
  stations.forEach(s => {
    const m = L.marker([s.lat, s.lon]).addTo(stationsLayer);
    m.bindPopup(`<b>${s.name}</b><br>node ${s.nodeId || '—'}`);
    m.on('click', ()=> {
      if(!selFrom.value) selFrom.value = s.nodeId || '';
      else selTo.value = s.nodeId || '';
    });
  });
  // draw custom stops
  customStops.forEach((cs, idx) => {
    const m = L.circleMarker([cs.lat, cs.lon], { radius:6, color:'#ff0000' }).addTo(stationsLayer);
    m.bindPopup(`<b>${cs.name}</b><br>custom stop`);
    m.on('click', ()=> {
      const id = `cs:${idx}`;
      if(!selFrom.value) selFrom.value = id;
      else selTo.value = id;
    });
  });
}

// click-to-add-stop mode
let addingStop = false;
btnAddStop.addEventListener('click', ()=> {
  addingStop = !addingStop;
  btnAddStop.textContent = addingStop ? 'Клик на карту для добавления...' : 'Добавить остановку';
  setStatus(addingStop ? 'Режим добавления: кликни на карту чтобы добавить остановку' : '');
});

map.on('click', async (e)=> {
  if(!addingStop) return;
  const name = prompt('Название остановки (пример: Моя остановка):');
  if(!name) { setStatus('Отменено'); addingStop = false; btnAddStop.textContent='Добавить остановку'; return; }
  const cs = { name, lat: e.latlng.lat, lon: e.latlng.lng };
  customStops.push(cs);
  saveCustomStops();
  renderCustomStopsOnMap();
  // refresh selects
  selFrom.innerHTML = '<option value="">От станции...</option>';
  selTo.innerHTML = '<option value="">К станции...</option>';
  populateSelects();
  setStatus('Остановка добавлена: ' + name);
  addingStop = false;
  btnAddStop.textContent='Добавить остановку';
});

// Export/import custom stops
btnExport.addEventListener('click', ()=> {
  const dataStr = JSON.stringify(customStops, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'railnav-stops.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

document.addEventListener('keydown', (e)=> {
  if(e.key === 'Escape') {
    addingStop = false;
    btnAddStop.textContent='Добавить остановку';
    setStatus('');
  }
});

// Import via file input
importFile.addEventListener('change', (ev)=> {
  const f = ev.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = ()=> {
    try {
      const arr = JSON.parse(reader.result);
      if(Array.isArray(arr)) {
        customStops = customStops.concat(arr);
        saveCustomStops();
        renderCustomStopsOnMap();
        selFrom.innerHTML = '<option value="">От станции...</option>';
        selTo.innerHTML = '<option value="">К станции...</option>';
        populateSelects();
        setStatus('Импортировано ' + arr.length + ' остановок');
      } else setStatus('Файл не содержит массив остановок');
    } catch(e) { setStatus('Ошибка при импорте'); }
  };
  reader.readAsText(f);
});

// Allow user to press Export to trigger file input for import (long-press could be used, but add separate gesture)
btnExport.addEventListener('contextmenu', (ev)=> {
  ev.preventDefault();
  importFile.click();
});

// UI wiring for load/route
btnLoad.addEventListener('click', async () => {
  try {
    clearGraph();
    const osm = await fetchRailwaysAndStations();
    buildGraphFromOverpass(osm);
    setStatus(`Загружено: ${Object.keys(nodes).length} узлов, ${stations.length} станций`);
    // render custom stops after OSM stations
    renderCustomStopsOnMap();
  } catch (e) {
    console.error(e);
    setStatus('Ошибка: ' + e.message);
  }
});

btnRoute.addEventListener('click', () => {
  const from = selFrom.value;
  const to = selTo.value;
  if(!from || !to) { setStatus('Выбери обе станции'); return; }
  setStatus('Вычисление пути...');
  const path = dijkstra(from, to);
  if(!path) { setStatus('Путь не найден по рельсам'); return; }
  drawPath(path);
  setStatus(`Путь найден: ${path.length} узлов`);
});

// initial load of custom stops
loadCustomStops();
renderCustomStopsOnMap();
