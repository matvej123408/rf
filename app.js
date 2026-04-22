let video = document.getElementById("video");
let canvas = document.getElementById("overlay");
let ctx = canvas.getContext("2d");

let sound = new Audio("sound.mp3");

let soundOn = false;
let vibrationOn = false;
let running = false;

let model;
let busy = false;

// загрузка модели
async function loadModel() {
  model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
  console.log("Model loaded");
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

  await loadModel();
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
  ctx.clearRect(0,0,canvas.width,canvas.height);
}

// главный цикл
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

        // масштаб под canvas
        x /= 2; y /= 2; w /= 2; h /= 2;

        // рамка
        ctx.strokeStyle = "red";
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);

        // текст
        ctx.fillStyle = "red";
        ctx.fillText(p.class, x, y - 5);

        // расстояние
        let distance = 200 / w;

        document.getElementById("distance").innerText =
          p.class + " ≈ " + distance.toFixed(2) + " m";

        // 🔥 логика парктроника
        handleAlerts(distance);
      }
    });

  } catch (e) {
    console.error(e);
  }

  busy = false;
  setTimeout(loop, 120);
}

// логика сигналов
function handleAlerts(distance) {
  if (distance < 1) {
    alertStrong();
  } else if (distance < 2) {
    alertMedium();
  }
}

// < 1 метр
function alertStrong() {
  if (soundOn) {
    sound.currentTime = 0;
    sound.play();
  }

  if (vibrationOn && navigator.vibrate) {
    navigator.vibrate([100, 50, 100]);
  }
}

// 1–2 метра
function alertMedium() {
  if (soundOn) {
    sound.currentTime = 0;
    sound.play();
  }

  if (vibrationOn && navigator.vibrate) {
    navigator.vibrate(100);
  }
}
