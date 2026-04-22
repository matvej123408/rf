let video = document.getElementById("video");
let canvas = document.getElementById("overlay");
let ctx = canvas.getContext("2d");

let sound = new Audio("sound.mp3");

let soundOn = false;
let vibrationOn = false;
let running = false;

let model;
let busy = false;

// 🔥 сглаживание расстояния
let smoothDistance = 0;

// камера режим
let isFrontCamera = false;
let stream = null;

// загрузка модели
async function loadModel() {
  model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
}

// 📷 камера (переключаемая)
async function startCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
  }

  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: isFrontCamera ? "user" : "environment"
    }
  });

  video.srcObject = stream;

  video.onloadedmetadata = () => {
    canvas.width = video.videoWidth / 2;
    canvas.height = video.videoHeight / 2;
  };

  if (!model) await loadModel();
}

// 🔄 переключение камеры
async function toggleCamera() {
  isFrontCamera = !isFrontCamera;
  await startCamera();
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
  ctx.clearRect(0,0,canvas.width,canvas.height);
}

// 🔥 основной цикл
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

    predictions.forEach(p => {
      if (p.score > 0.6) {

        let [x, y, w, h] = p.bbox;

        x /= 2; y /= 2; w /= 2; h /= 2;

        ctx.strokeStyle = "red";
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = "red";
        ctx.fillText(p.class, x, y - 5);

        // 📏 raw distance
        let rawDistance = 200 / w;

        // 🔥 СГЛАЖИВАНИЕ (очень важно)
        smoothDistance = smoothDistance * 0.8 + rawDistance * 0.2;

        document.getElementById("distance").innerText =
          p.class + " ≈ " + smoothDistance.toFixed(2) + " m";

        handleAlerts(smoothDistance);
      }
    });

  } catch (e) {
    console.log(e);
  }

  busy = false;
  setTimeout(loop, 120);
}

// 🚗 логика парктроника
function handleAlerts(distance) {
  if (distance < 1) {
    alertStrong();
  } else if (distance < 2) {
    alertMedium();
  }
}

function alertStrong() {
  if (soundOn) {
    sound.currentTime = 0;
    sound.play();
  }

  if (vibrationOn && navigator.vibrate) {
    navigator.vibrate([120, 50, 120]);
  }
}

function alertMedium() {
  if (soundOn) {
    sound.currentTime = 0;
    sound.play();
  }

  if (vibrationOn && navigator.vibrate) {
    navigator.vibrate(100);
  }
}
