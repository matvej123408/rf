let video = document.getElementById("video");
let canvas = document.getElementById("overlay");
let ctx = canvas.getContext("2d");

let sound = new Audio("sound.mp3");

let soundOn = false;
let vibrationOn = false;
let running = false;

let model;
let busy = false; // 🔥 защита от лагов

// загрузка модели
async function loadModel() {
  model = await cocoSsd.load();
  console.log("Model loaded");
}

// камера
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });

  video.srcObject = stream;

  video.onloadedmetadata = () => {
    // уменьшаем разрешение → быстрее
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

// 🔥 главный цикл (НЕ requestAnimationFrame)
async function loop() {
  if (!running) return;

  // если модель занята → пропускаем кадр
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

        // масштаб под уменьшенный canvas
        x /= 2; y /= 2; w /= 2; h /= 2;

        ctx.strokeStyle = "red";
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = "red";
        ctx.fillText(p.class, x, y - 5);

        // стабильнее расстояние
        let distance = 200 / w;

        document.getElementById("distance").innerText =
          p.class + " ≈ " + distance.toFixed(2) + " m";

        alertUser();
      }
    });

  } catch (e) {
    console.error(e);
  }

  busy = false;

  // 🔥 задержка = стабильность
  setTimeout(loop, 120);
}

// сигнал
function alertUser() {
  if (soundOn) {
    sound.currentTime = 0;
    sound.play();
  }

  if (vibrationOn && navigator.vibrate) {
    navigator.vibrate(80);
  }
}
