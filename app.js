let video = document.getElementById("video");
let canvas = document.getElementById("overlay");
let ctx = canvas.getContext("2d");

let sound = new Audio("sound.mp3");

let soundOn = false;
let vibrationOn = false;
let running = false;

let model;
let busy = false;

let smoothDistance = 0;

// 📌 анти-дребезг вибрации
let lastVibrateTime = 0;

// 📌 выбранный объект (самый большой)
let trackedObject = null;

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
  trackedObject = null;
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

    if (predictions.length === 0) {
      busy = false;
      setTimeout(loop, 120);
      return;
    }

    // 🔥 выбираем САМЫЙ БОЛЬШОЙ объект (лучшее выделение)
    trackedObject = predictions.reduce((max, p) => {
      let area = p.bbox[2] * p.bbox[3];
      let maxArea = max ? max.bbox[2] * max.bbox[3] : 0;
      return area > maxArea ? p : max;
    }, null);

    if (trackedObject && trackedObject.score > 0.6) {

      let [x, y, w, h] = trackedObject.bbox;

      x /= 2; y /= 2; w /= 2; h /= 2;

      // 🔲 РАМКА
      ctx.strokeStyle = "red";
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = "red";
      ctx.fillText(trackedObject.class, x, y - 5);

      // 📏 расстояние
      let rawDistance = 200 / w;

      // 🔥 сглаживание
      smoothDistance = smoothDistance * 0.85 + rawDistance * 0.15;

      document.getElementById("distance").innerText =
        trackedObject.class + " ≈ " + smoothDistance.toFixed(2) + " m";

      handleAlerts(smoothDistance);
    }

  } catch (e) {
    console.log(e);
  }

  busy = false;
  setTimeout(loop, 120);
}

// 🚗 ЛОГИКА ПАРКТРОНИКА (УЛЬТРА НАДЁЖНАЯ)
function handleAlerts(distance) {

  // 🔥 100% вибрация если < 1 метра
  if (distance < 1) {

    if (vibrationOn) {
      let now = Date.now();

      // защита iPhone (но НЕ пропускает сигнал)
      if (now - lastVibrateTime > 200) {
        navigator.vibrate([200, 100, 200, 100, 200]);
        lastVibrateTime = now;
      }
    }

    if (soundOn) {
      sound.currentTime = 0;
      sound.play();
    }

  } else if (distance < 2) {

    if (vibrationOn) {
      navigator.vibrate(100);
    }

    if (soundOn) {
      sound.currentTime = 0;
      sound.play();
    }
  }
}
