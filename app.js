let video = document.getElementById("video");
let canvas = document.getElementById("overlay");
let ctx = canvas.getContext("2d");

let sound = new Audio("sound.mp3");

let soundOn = false;
let vibrationOn = false;
let running = false;

let model;
let busy = false;

// 📏 сглаживание по ID
let objects = {};

// 🔊 звук
let beepInterval = null;

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
  objects = {};
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

    // 🔥 сортируем по размеру (важности)
    let sorted = predictions
      .filter(p => p.score > 0.6)
      .sort((a, b) => (b.bbox[2]*b.bbox[3]) - (a.bbox[2]*a.bbox[3]))
      .slice(0, 4); // максимум 4 объекта

    let closestDistance = Infinity;

    sorted.forEach((p, i) => {

      let [x, y, w, h] = p.bbox;

      x /= 2; y /= 2; w /= 2; h /= 2;

      let id = i; // простой ID

      if (!objects[id]) {
        objects[id] = {
          dist: 0,
          lastDist: 0,
          speed: 0,
          lastTime: Date.now()
        };
      }

      let obj = objects[id];

      // 📏 расстояние
      let raw = 200 / w;

      // сглаживание
      obj.dist = obj.dist * 0.8 + raw * 0.2;

      // ⚡ скорость
      let now = Date.now();
      let dt = (now - obj.lastTime) / 1000;

      if (dt > 0) {
        obj.speed = (obj.lastDist - obj.dist) / dt;
      }

      obj.lastDist = obj.dist;
      obj.lastTime = now;

      // 🔲 рамка
      ctx.strokeStyle = i === 0 ? "red" : "yellow";
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = "white";
      ctx.fillText(
        p.class +
        " " + obj.dist.toFixed(1) + "m" +
        " v=" + obj.speed.toFixed(1),
        x, y - 5
      );

      // ближайший объект
      if (obj.dist < closestDistance) {
        closestDistance = obj.dist;
      }
    });

    // 🔊 звук только от ближайшего
    if (closestDistance !== Infinity) {
      handleAlerts(closestDistance);
    }

  } catch (e) {
    console.log(e);
  }

  busy = false;
  setTimeout(loop, 120);
}

//////////////////////////////////////////////////
// 🔊 Tesla звук
//////////////////////////////////////////////////

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
