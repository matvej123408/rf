let video = document.getElementById("video");
let canvas = document.getElementById("overlay");
let ctx = canvas.getContext("2d");

let sound = new Audio("sound.mp3");

let soundOn = false;
let vibrationOn = false;
let running = false;

let model;
let busy = false;

// 🔊 звук (Tesla-логика)
let beepInterval = null;

// 📦 трекинг
let tracks = {};           // id -> track
let nextTrackId = 1;
let maxTracks = 6;         // ограничение (стабильность)
let maxAgeMs = 1200;       // удаление "потерянных" треков

// 🔍 zoom (к выбранному объекту)
let zoomOn = false;
let zoomTargetId = null;

// 🧾 история
let historyLog = []; // массив строк

// ===================== utils =====================

function iou(a, b) {
  const ax1 = a.x, ay1 = a.y, ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx1 = b.x, by1 = b.y, bx2 = b.x + b.w, by2 = b.y + b.h;

  const x1 = Math.max(ax1, bx1);
  const y1 = Math.max(ay1, by1);
  const x2 = Math.min(ax2, bx2);
  const y2 = Math.min(ay2, by2);

  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = (ax2 - ax1) * (ay2 - ay1);
  const areaB = (bx2 - bx1) * (by2 - by1);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

function nowStr() {
  const d = new Date();
  return d.toLocaleDateString() + " " + d.toLocaleTimeString();
}

// ===================== init =====================

async function loadModel() {
  model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });
  video.srcObject = stream;

  video.onloadedmetadata = () => {
    canvas.width = video.videoWidth / 2;
    canvas.height = video.videoHeight / 2;
  };

  if (!model) await loadModel();
}

// ===================== controls =====================

function toggleSound() { soundOn = !soundOn; }
function toggleVibration() { vibrationOn = !vibrationOn; }

function toggleMeasure() {
  running = !running;
  if (running) loop();
}

function toggleZoom() {
  zoomOn = !zoomOn;
}

function resetAll() {
  running = false;
  tracks = {};
  nextTrackId = 1;
  zoomTargetId = null;
  historyLog = [];
  stopBeep();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  updateHistoryUI();
}

// ===================== main loop =====================

async function loop() {
  if (!running) return;

  if (busy) {
    setTimeout(loop, 50);
    return;
  }
  busy = true;

  try {
    const preds = await model.detect(video);

    // отрисовка с возможным zoom
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // фильтр и подготовка
    let detections = preds
      .filter(p => p.score > 0.6)
      .map(p => {
        let [x, y, w, h] = p.bbox;
        return {
          class: p.class,
          score: p.score,
          // масштаб под canvas (мы делим на 2)
          x: x/2, y: y/2, w: w/2, h: h/2,
          cx: x/2 + w/4,
          cy: y/2 + h/4
        };
      })
      .sort((a,b)=> (b.w*b.h)-(a.w*a.h))
      .slice(0, maxTracks);

    // ======== сопоставление детекций с треками (IoU + центр) ========
    let assigned = new Set();

    // сначала пытаемся матчить существующие треки
    for (let id in tracks) {
      let tr = tracks[id];
      let bestIdx = -1;
      let bestScore = 0;

      for (let i=0;i<detections.length;i++) {
        if (assigned.has(i)) continue;

        let d = detections[i];

        let iouScore = iou(
          {x:tr.x, y:tr.y, w:tr.w, h:tr.h},
          {x:d.x, y:d.y, w:d.w, h:d.h}
        );

        // добавим близость центров
        let dx = tr.cx - d.cx;
        let dy = tr.cy - d.cy;
        let dist = Math.sqrt(dx*dx + dy*dy);
        let centerScore = Math.max(0, 1 - dist/200); // 200px нормализация

        let score = iouScore * 0.7 + centerScore * 0.3;

        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx !== -1 && bestScore > 0.2) {
        // обновляем трек
        let d = detections[bestIdx];
        assigned.add(bestIdx);

        updateTrack(tr, d);
      } else {
        // не обновился
        tr.missed += 1;
      }
    }

    // создаём новые треки для оставшихся детекций
    for (let i=0;i<detections.length;i++) {
      if (assigned.has(i)) continue;
      let d = detections[i];

      let id = nextTrackId++;
      tracks[id] = createTrack(id, d);

      addHistory(`NEW #${id} (${d.class})`);
    }

    // удаляем старые треки
    let now = Date.now();
    for (let id in tracks) {
      let tr = tracks[id];
      if (now - tr.lastSeen > maxAgeMs) {
        addHistory(`LOST #${id}`);
        if (zoomTargetId == id) zoomTargetId = null;
        delete tracks[id];
      }
    }

    // выбираем ближайший трек (для звука и zoom по умолчанию)
    let closestId = null;
    let closestDist = Infinity;

    for (let id in tracks) {
      let tr = tracks[id];
      if (tr.dist < closestDist) {
        closestDist = tr.dist;
        closestId = id;
      }
    }

    if (!zoomTargetId && closestId) {
      zoomTargetId = closestId;
    }

    // ======== zoom (кроп + масштаб) ========
    if (zoomOn && zoomTargetId && tracks[zoomTargetId]) {
      let t = tracks[zoomTargetId];
      let pad = 20;
      let sx = Math.max(0, (t.x*2) - pad);
      let sy = Math.max(0, (t.y*2) - pad);
      let sw = Math.min(video.videoWidth, (t.w*2) + pad*2);
      let sh = Math.min(video.videoHeight, (t.h*2) + pad*2);

      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    } else {
      // обычный фон
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    // ======== отрисовка треков ========
    for (let id in tracks) {
      let tr = tracks[id];

      ctx.strokeStyle = (id == closestId) ? "red" : "yellow";
      ctx.lineWidth = 3;
      ctx.strokeRect(tr.x, tr.y, tr.w, tr.h);

      ctx.fillStyle = "white";
      ctx.fillText(
        `#${id} ${tr.class} ${tr.dist.toFixed(1)}m ${tr.kmh.toFixed(1)}km/h`,
        tr.x, tr.y - 5
      );
    }

    // звук/вибрация по ближайшему
    if (closestDist !== Infinity) {
      handleAlerts(closestDist);
    }

  } catch(e) {
    console.log(e);
  }

  busy = false;
  setTimeout(loop, 120);
}

// ===================== track =====================

function createTrack(id, d) {
  let dist = 200 / d.w;

  return {
    id,
    class: d.class,
    x: d.x, y: d.y, w: d.w, h: d.h,
    cx: d.cx, cy: d.cy,

    dist: dist,
    lastDist: dist,

    speed: 0,      // м/с
    kmh: 0,        // км/ч

    lastSeen: Date.now(),
    lastTime: Date.now(),
    missed: 0
  };
}

function updateTrack(tr, d) {
  let now = Date.now();

  // сглаживание позиции
  tr.x = tr.x*0.7 + d.x*0.3;
  tr.y = tr.y*0.7 + d.y*0.3;
  tr.w = tr.w*0.7 + d.w*0.3;
  tr.h = tr.h*0.7 + d.h*0.3;

  tr.cx = tr.x + tr.w/2;
  tr.cy = tr.y + tr.h/2;

  tr.class = d.class;

  // расстояние
  let raw = 200 / tr.w;
  tr.dist = tr.dist*0.8 + raw*0.2;

  // скорость
  let dt = (now - tr.lastTime)/1000;
  if (dt > 0) {
    tr.speed = (tr.lastDist - tr.dist)/dt; // м/с
    tr.kmh = tr.speed * 3.6;               // км/ч
  }

  tr.lastDist = tr.dist;
  tr.lastTime = now;
  tr.lastSeen = now;
  tr.missed = 0;
}

// ===================== alerts =====================

function handleAlerts(distance) {
  if (distance > 2) {
    stopBeep();
    return;
  }

  let interval;
  if (distance < 0.5) interval = 80;
  else if (distance < 1) interval = 140;
  else interval = 300;

  startBeep(interval);

  if (distance < 1 && vibrationOn) {
    navigator.vibrate([150,50,150]);
  } else if (distance < 2 && vibrationOn) {
    navigator.vibrate(100);
  }
}

function startBeep(interval) {
  if (!soundOn) return;

  if (beepInterval && beepInterval._interval === interval) return;

  stopBeep();

  beepInterval = setInterval(() => {
    sound.currentTime = 0;
    sound.play();
  }, interval);

  beepInterval._interval = interval;
}

function stopBeep() {
  if (beepInterval) {
    clearInterval(beepInterval);
    beepInterval = null;
  }
}

// ===================== history =====================

function addHistory(text) {
  let line = `${nowStr()} — ${text}`;
  historyLog.unshift(line);
  if (historyLog.length > 50) historyLog.pop();
  updateHistoryUI();
}

function updateHistoryUI() {
  let el = document.getElementById("history");
  if (!el) return;
  el.innerHTML = historyLog.join("<br>");
}
