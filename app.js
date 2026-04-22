let video = document.getElementById("video");
let canvas = document.getElementById("overlay");
let ctx = canvas.getContext("2d");

let sound = new Audio("sound.mp3");

let soundOn = false;
let vibrationOn = false;
let running = false;

let model;
let lastTime = 0;

async function loadModel() {
  model = await cocoSsd.load();
  console.log("Model loaded");
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });

  video.srcObject = stream;

  video.onloadedmetadata = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  };

  await loadModel();
}

function toggleSound() { soundOn = !soundOn; }
function toggleVibration() { vibrationOn = !vibrationOn; }

function toggleMeasure() {
  running = !running;
  if (running) detect();
}

function resetAll() {
  running = false;
  ctx.clearRect(0,0,canvas.width,canvas.height);
}

async function detect(time = 0) {
  if (!running) return;

  if (time - lastTime < 70) {
    requestAnimationFrame(detect);
    return;
  }
  lastTime = time;

  const predictions = await model.detect(video);

  ctx.clearRect(0,0,canvas.width,canvas.height);

  predictions.forEach(p => {
    if (p.score > 0.6) {
      const [x, y, w, h] = p.bbox;

      ctx.strokeStyle = "red";
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = "red";
      ctx.fillText(p.class, x, y - 5);

      let distance = (1 / w) * 100;

      document.getElementById("distance").innerText =
        p.class + " ≈ " + distance.toFixed(2) + " m";

      alertUser();
    }
  });

  requestAnimationFrame(detect);
}

function alertUser() {
  if (soundOn) {
    sound.currentTime = 0;
    sound.play();
  }

  if (vibrationOn && navigator.vibrate) {
    navigator.vibrate(100);
  }
}