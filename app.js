let video = document.getElementById("video");
let canvas = document.getElementById("overlay");
let ctx = canvas.getContext("2d");

let sound = new Audio("sound.mp3");

let soundOn = false;
let vibrationOn = false;
let running = false;

let model;
let busy = false;

// 🔊 звук
let beepInterval = null;

// 📦 треки
let tracks = {};
let nextId = 1;

// 🧾 история
let historyLog = [];

// =====================
// INIT
// =====================
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

// =====================
// КНОПКИ
// =====================
function toggleSound() { soundOn = !soundOn; }
function toggleVibration() { vibrationOn = !vibrationOn; }

function toggleMeasure() {
  running = !running;
  if (running) loop();
}

function resetAll() {
  running = false;
  tracks = {};
  historyLog = [];
  stopBeep();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  updateHistory();
}

// =====================
// ГЛАВНЫЙ ЦИКЛ
// =====================
async function loop() {
  if (!running) return;

  if (busy) {
    setTimeout(loop, 50);
    return;
  }

  busy = true;

  try {
    const predictions = await model.detect(video);

    ctx.clearRect(0,0,canvas.width,canvas.height);

    let detections = predictions
      .filter(p => p.score > 0.6)
      .sort((a,b)=> (b.bbox[2]*b.bbox[3])-(a.bbox[2]*a.bbox[3]))
      .slice(0,5); // максимум 5 объектов

    let used = new Set();

    // ===== сопоставление =====
    for (let id in tracks) {
      let t = tracks[id];

      let best = null;
      let bestDist = 9999;

      detections.forEach((p,i)=>{
        if (used.has(i)) return;

        let cx = p.bbox[0] + p.bbox[2]/2;
        let cy = p.bbox[1] + p.bbox[3]/2;

        let dx = t.cx - cx;
        let dy = t.cy - cy;
        let dist = Math.sqrt(dx*dx+dy*dy);

        if (dist < bestDist) {
          bestDist = dist;
          best = {p,i,cx,cy};
        }
      });

      if (best && bestDist < 150) {
        used.add(best.i);
        updateTrack(t, best.p, best.cx, best.cy);
      } else {
        t.missed++;
      }
    }

    // ===== новые =====
    detections.forEach((p,i)=>{
      if (used.has(i)) return;

      let id = nextId++;

      tracks[id] = createTrack(id, p);

      addHistory("NEW #" + id + " " + p.class);
    });

    // ===== удаление =====
    for (let id in tracks) {
      if (tracks[id].missed > 5) {
        addHistory("LOST #" + id);
        delete tracks[id];
      }
    }

    let closest = Infinity;

    // ===== отрисовка =====
    for (let id in tracks) {
      let t = tracks[id];

      let x = t.x/2;
      let y = t.y/2;
      let w = t.w/2;
      let h = t.h/2;

      ctx.strokeStyle = "red";
      ctx.lineWidth = 3;
      ctx.strokeRect(x,y,w,h);

      ctx.fillStyle = "white";
      ctx.fillText(
        "#" + id + " " + t.class +
        " " + t.dist.toFixed(1) + "m" +
        " " + t.kmh.toFixed(1) + "km/h",
        x, y - 5
      );

      if (t.dist < closest) closest = t.dist;
    }

    if (closest !== Infinity) {
      handleAlerts(closest);
    }

  } catch(e) {
    console.log(e);
  }

  busy = false;
  setTimeout(loop, 120);
}

// =====================
// TRACK
// =====================
function createTrack(id, p) {
  let [x,y,w,h] = p.bbox;

  let cx = x + w/2;
  let cy = y + h/2;

  let dist = 200 / (w/2);

  return {
    id,
    class: p.class,
    x,y,w,h,
    cx,cy,
    dist,
    lastDist: dist,
    speed: 0,
    kmh: 0,
    lastTime: Date.now(),
    missed: 0
  };
}

function updateTrack(t, p, cx, cy) {
  let [x,y,w,h] = p.bbox;

  t.x = t.x*0.7 + x*0.3;
  t.y = t.y*0.7 + y*0.3;
  t.w = t.w*0.7 + w*0.3;
  t.h = t.h*0.7 + h*0.3;

  t.cx = cx;
  t.cy = cy;

  let raw = 200 / (t.w/2);

  t.dist = t.dist*0.8 + raw*0.2;

  let now = Date.now();
  let dt = (now - t.lastTime)/1000;

  if (dt > 0) {
    t.speed = (t.lastDist - t.dist)/dt;
    t.kmh = t.speed * 3.6;
  }

  t.lastDist = t.dist;
  t.lastTime = now;
  t.missed = 0;
}

// =====================
// ЗВУК
// =====================
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

  beepInterval = setInterval(()=>{
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

// =====================
// ИСТОРИЯ
// =====================
function addHistory(text) {
  let t = new Date().toLocaleTimeString();
  historyLog.unshift(t + " " + text);
  if (historyLog.length > 30) historyLog.pop();
  updateHistory();
}

function updateHistory() {
  let el = document.getElementById("history");
  if (!el) return;
  el.innerHTML = historyLog.join("<br>");
}
