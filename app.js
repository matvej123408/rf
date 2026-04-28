let video = document.getElementById("video");
let canvas = document.getElementById("overlay");
let ctx = canvas.getContext("2d");

let model;
let stream;
let running = false;
let isFront = false;

let target = null;
let focus = {x:0,y:0,w:0,h:0};

let zoom = 1;
let targetZoom = 1;

let camOffsetX = 0;
let camOffsetY = 0;

let lostFrames = 0;
const MAX_LOST = 15;

let busy = false;

// =====================
// 🚀 КНОПКА СТАРТА (FIX)
document.getElementById("startBtn").addEventListener("click", async () => {

  try {
    document.getElementById("status").innerText = "📷 Запуск камеры...";

    await startCamera();

    document.getElementById("status").innerText = "🧠 Загрузка AI...";

    await loadModel();

    document.getElementById("status").innerText = "🚀 Старт";

    running = true;
    loop();

  } catch(e) {
    document.getElementById("status").innerText = "❌ Ошибка: " + e.message;
    console.log(e);
  }

});

// =====================
document.getElementById("camBtn").addEventListener("click", async () => {
  isFront = !isFront;
  await startCamera();
});

// =====================
async function loadModel() {

  if (model) return;

  model = await cocoSsd.load();
}

// =====================
// 📷 КАМЕРА (ЖЁСТКИЙ FIX)
async function startCamera() {

  if (stream) stream.getTracks().forEach(t => t.stop());

  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: isFront ? "user" : "environment"
    }
  });

  video.srcObject = stream;

  await video.play();

  // 🔥 FIX зависания
  await new Promise(resolve => setTimeout(resolve, 300));

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
}

// =====================
// 🎯 TARGET
function pickTarget(predictions) {

  if (!predictions.length) return null;

  let people = predictions.filter(p => p.class === "person");

  return people.length ? people[0] : predictions[0];
}

// =====================
function matchTarget(predictions) {

  if (!target) return null;

  let best = null;
  let bestDist = Infinity;

  let tx = focus.x + focus.w/2;
  let ty = focus.y + focus.h/2;

  predictions.forEach(p => {

    let [x,y,w,h] = p.bbox;

    let px = x + w/2;
    let py = y + h/2;

    let dist = Math.hypot(px - tx, py - ty);

    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  });

  if (bestDist > 150) return null;

  return best;
}

// =====================
// 🎯 SMOOTH (как раньше)
function smooth(box) {

  let a = 0.2;

  focus.x += (box.x - focus.x) * a;
  focus.y += (box.y - focus.y) * a;
  focus.w += (box.w - focus.w) * a;
  focus.h += (box.h - focus.h) * a;

  return focus;
}

// =====================
// 🔭 НОРМАЛЬНЫЙ ZOOM (как раньше)
function updateZoom(box) {

  let size = box.w * box.h;
  let screen = canvas.width * canvas.height;

  let ratio = size / screen;

  if (ratio < 0.05) targetZoom = 2.2;
  else if (ratio < 0.15) targetZoom = 1.6;
  else targetZoom = 1.1;

  zoom += (targetZoom - zoom) * 0.08;
}

// =====================
// 🚁 ДРОН РЕЖИМ (СТАБИЛЬНЫЙ)
function updateCameraOffset(box) {

  let cx = canvas.width / 2;
  let cy = canvas.height / 2;

  let ox = box.x + box.w/2;
  let oy = box.y + box.h/2;

  camOffsetX += (ox - cx) * 0.04;
  camOffsetY += (oy - cy) * 0.04;
}

// =====================
function drawZoomedVideo() {

  if (!video.videoWidth) return;

  let vw = video.videoWidth;
  let vh = video.videoHeight;

  let zw = vw / zoom;
  let zh = vh / zoom;

  let zx = (vw - zw)/2 + camOffsetX;
  let zy = (vh - zh)/2 + camOffsetY;

  ctx.drawImage(video, zx, zy, zw, zh, 0, 0, canvas.width, canvas.height);
}

// =====================
async function loop() {

  if (!running) return;
  if (busy) return requestAnimationFrame(loop);

  busy = true;

  try {

    const predictions = await model.detect(video);

    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawZoomedVideo();

    let newTarget = target ? matchTarget(predictions) : null;

    if (!newTarget) lostFrames++;
    else lostFrames = 0;

    if (!target || lostFrames > MAX_LOST) {
      target = pickTarget(predictions);
      lostFrames = 0;
    } else if (newTarget) {
      target = newTarget;
    }

    if (target) {

      let [x,y,w,h] = target.bbox;

      let f = smooth({x,y,w,h});

      updateZoom(f);
      updateCameraOffset(f);

      ctx.strokeStyle = "red";
      ctx.lineWidth = 4;
      ctx.strokeRect(f.x,f.y,f.w,f.h);

    } else {
      document.getElementById("status").innerText = "Поиск...";
    }

  } catch(e) {
    console.log(e);
  }

  busy = false;
  requestAnimationFrame(loop);
}
