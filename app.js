let video = document.getElementById("video");
let canvas = document.getElementById("overlay");
let ctx = canvas.getContext("2d");

let sound = new Audio("sound.mp3");

let soundOn = false;
let vibrationOn = false;
let measuring = false;

let lastFrame = null;

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });
  video.srcObject = stream;

  video.onloadedmetadata = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  };
}

function toggleSound() {
  soundOn = !soundOn;
}

function toggleVibration() {
  vibrationOn = !vibrationOn;
}

function toggleMeasure() {
  measuring = !measuring;
  if (measuring) detect();
}

function resetAll() {
  measuring = false;
  soundOn = false;
  vibrationOn = false;
  ctx.clearRect(0,0,canvas.width,canvas.height);
}

function detect() {
  if (!measuring) return;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  let frame = ctx.getImageData(0, 0, canvas.width, canvas.height);

  if (lastFrame) {
    let diff = 0;

    for (let i = 0; i < frame.data.length; i += 4) {
      diff += Math.abs(frame.data[i] - lastFrame.data[i]);
    }

    if (diff > 4000000) {
      let x = canvas.width * 0.3;
      let y = canvas.height * 0.3;
      let w = canvas.width * 0.4;
      let h = canvas.height * 0.4;

      drawBox(x,y,w,h);

      let distance = Math.max(0.5, 8000000 / diff);

      document.getElementById("distance").innerText =
        "Distance ≈ " + distance.toFixed(2) + " m";

      alertUser();
    } else {
      ctx.clearRect(0,0,canvas.width,canvas.height);
    }
  }

  lastFrame = frame;
  requestAnimationFrame(detect);
}

function drawBox(x,y,w,h) {
  ctx.lineWidth = 4;
  ctx.strokeStyle = "red";
  ctx.strokeRect(x,y,w,h);
}

function alertUser() {
  if (soundOn) {
    sound.currentTime = 0;
    sound.play();
  }

  if (vibrationOn && navigator.vibrate) {
    navigator.vibrate(200);
  }
}