self.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open("text-app").then((cache) => {
            return cache.addAll(["index.html", "script.js", "style.css"]);
        })
    );
});

self.addEventListener("fetch", function (event) {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});