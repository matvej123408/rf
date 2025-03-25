let texts = ["Eicheldorrfing", "Fasanenweg", "Graudenzer Strasse", "Friedenstrasse", "Lutherberg", "Nahrungsberg", "Berliner Platz", "Marktplatz", "Osswaldsgarten", "Selterstor", "Liebigstrasse", "Bahnhof"];
let currentIndex = 0;
let timestamps = [];
let selectedProfile = "";

function selectProfile(profile) {
    selectedProfile = profile;
    document.getElementById("profileSelection").style.display = "none";
    document.getElementById("app").style.display = "block";
    if (profile === "admin") {
        document.getElementById("timestamps").style.display = "block";
    }
}

document.getElementById("nextBtn").addEventListener("click", function () {
    if (currentIndex < texts.length) {
        document.getElementById("textDisplay").textContent = texts[currentIndex];
        speakText(texts[currentIndex]);
        
        let timeStamp = new Date().toLocaleTimeString("de-DE", { hour12: false, second: "2-digit" });
        timestamps.push(timeStamp);
        updateTimestamps();
        
        currentIndex++;
    }
});

document.getElementById("resetBtn").addEventListener("click", function () {
    currentIndex = 0;
    timestamps = [];
    document.getElementById("textDisplay").textContent = texts[0];
    document.getElementById("timestamps").innerHTML = "";
});

function updateTimestamps() {
    let list = document.getElementById("timestamps");
    list.innerHTML = "";
    timestamps.forEach((time, index) => {
        let li = document.createElement("li");
        li.textContent = Schritt ${index + 1}: ${time};
        list.appendChild(li);
    });
}

function speakText(text) {
    let speech = new SpeechSynthesisUtterance(text);
    speech.lang = "de-DE";
    speech.rate = 1;
    speechSynthesis.speak(speech);
}