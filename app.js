let video = document.getElementById("video");
let canvas = document.getElementById("overlay");
let ctx = canvas.getContext("2d");

let model;
let stream;
let running = false;
let isFront = false;

let target = null;
let smoothBox = null;

let busy = false;

let detectFrames = 0;
let lastSound = 0;

// =====================
document.getElementById("startBtn").addEventListener("click", async () => {
  try {
    document.getElementById("status").innerText = "📷 Камера...";
    await startCamera();

    document.getElementById("status").innerText = "🧠 AI...";
    await loadModel();

    document.getElementById("status").innerText = "🚀 Работаю";
    running = true;
    loop();

  } catch (e) {
    document.getElementById("status").innerText = "❌ " + e.message;
  }
});

// =====================
document.getElementById("camBtn").addEventListener("click", async () => {
  isFront = !isFront;
  await startCamera();
});

// =====================
async function loadModel() {
  if (!model) model = await cocoSsd.load();
}

// =====================
async function startCamera() {

  if (stream) stream.getTracks().forEach(t => t.stop());

  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: isFront ? "user" : "environment" }
  });

  video.srcObject = stream;
  await video.play();

  await new Promise(r => setTimeout(r, 300));

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
}

// =====================
// 🎯 объекты
function pickTarget(predictions) {
  if (!predictions.length) return null;

  const priority = ["person", "dog", "cat", "bird", "car"];

  for (let type of priority) {
    let found = predictions.find(p => p.class === type);
    if (found) return found;
  }

  return null;
}

// =====================
// 📸 фото
function takePhoto() {
  let photo = document.createElement("canvas");
  let pctx = photo.getContext("2d");

  photo.width = canvas.width;
  photo.height = canvas.height;

  pctx.drawImage(video, 0, 0, photo.width, photo.height);

  let link = document.createElement("a");
  link.download = "object.png";
  link.href = photo.toDataURL("image/png");
  link.click();
}

// =====================
// 🔊 звук
function playSound() {
  let audio = new Audio("sound.mp3");
  audio.play();
}

// =====================
// 🎯 СИЛЬНОЕ СГЛАЖИВАНИЕ (точная рамка без дергания)
function smoothBoxUpdate(box) {

  if (!smoothBox) {
    smoothBox = { ...box };
    return smoothBox;
  }

  let a = 0.25; // плавность

  smoothBox.x += (box.x - smoothBox.x) * a;
  smoothBox.y += (box.y - smoothBox.y) * a;
  smoothBox.w += (box.w - smoothBox.w) * a;
  smoothBox.h += (box.h - smoothBox.h) * a;

  return smoothBox;
}

// =====================
async function loop() {

  if (!running) return;
  if (busy) return requestAnimationFrame(loop);

  busy = true;

  try {

    const predictions = await model.detect(video);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    target = pickTarget(predictions);

    if (target) {

      detectFrames++;

      let box = smoothBoxUpdate({
        x: target.bbox[0],
        y: target.bbox[1],
        w: target.bbox[2],
        h: target.bbox[3]
      });

      // 🎯 рамка
      ctx.strokeStyle = "red";
      ctx.lineWidth = 3;
      ctx.strokeRect(box.x, box.y, box.w, box.h);

      // 🏷 подпись
      ctx.fillStyle = "red";
      ctx.font = "16px Arial";
      ctx.fillText(target.class, box.x, box.y - 8);

      // 📸 фото при первом стабильном обнаружении
      if (detectFrames === 10) {
        takePhoto();
      }

      // 🔊 звук
      if (Date.now() - lastSound > 2000) {
        playSound();
        lastSound = Date.now();
      }

      document.getElementById("status").innerText =
        "Объект: " + target.class;

    } else {
      detectFrames = 0;
      smoothBox = null;
      document.getElementById("status").innerText = "Поиск...";
    }

  } catch (e) {
    console.log(e);
  }

  busy = false;
  requestAnimationFrame(loop);
}
