let video = document.getElementById("video");
let canvas = document.getElementById("overlay");
let ctx = canvas.getContext("2d");

let sound = new Audio("sound.mp3");

let soundOn = false;
let vibrationOn = false;
let running = false;

let model;
let busy = false;

// 🔥 продвинутое сглаживание
let smoothDistance = 0;

// 🔊 Tesla звук
let beepInterval = null;

// 🎯 фикс объекта
let trackedBox = null;

// загрузка модели
async function loadModel() {
  model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
}

// камера
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

// кнопки
function toggleSound() { soundOn = !soundOn; }
function toggleVibration() { vibrationOn = !vibrationOn; }

function toggleMeasure() {
  running = !running;
  if (running) loop();
}

function resetAll() {
  running = false;
  smoothDistance = 0;
  trackedBox = null;
  stopBeep();
  ctx.clearRect(0,0,canvas.width,canvas.height);
}

// 🔥 главный цикл
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

    if (predictions.length > 0) {

      // 🔥 лучший объект (по площади + близости к прошлому)
      let best = predictions.reduce((best, p) => {
        let area = p.bbox[2] * p.bbox[3];

        if (!best) return p;

        let bestArea = best.bbox[2] * best.bbox[3];

        return area > bestArea ? p : best;
      }, null);

      if (best.score > 0.6) {

        let [x, y, w, h] = best.bbox;

        x /= 2; y /= 2; w /= 2; h /= 2;

        trackedBox = {x,y,w,h};

        // 🎯 рамка
        ctx.strokeStyle = "red";
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = "red";
        ctx.fillText(best.class, x, y - 5);

        // 📏 raw distance
        let raw = 200 / w;

        // 🔥 АДАПТИВНОЕ СГЛАЖИВАНИЕ
        let diff = Math.abs(raw - smoothDistance);

        let alpha = diff > 1 ? 0.1 : 0.25; 
        smoothDistance = smoothDistance * (1 - alpha) + raw * alpha;

        document.getElementById("distance").innerText =
          best.class + " ≈ " + smoothDistance.toFixed(2) + " m";

        handleAlerts(smoothDistance);
      }
    }

  } catch (e) {
    console.log(e);
  }

  busy = false;
  setTimeout(loop, 120);
}

//////////////////////////////////////////////////
// 🔊 TESLA SOUND
//////////////////////////////////////////////////

function handleAlerts(distance) {

  if (distance > 2) {
    stopBeep();
    return;
  }

  let interval;

  if (distance < 0.5) interval = 90;
  else if (distance < 1) interval = 160;
  else interval = 350;

  startBeep(interval);

  // 📳 вибрация
  if (distance < 1 && vibrationOn) {
    navigator.vibrate([150, 50, 150]);
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
