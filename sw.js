// Service Worker: hält die App-Dateien vor, damit die App auch bei schlechtem Netz startet.
// Immer erst das Netz fragen (so kommen neue Kartendaten sofort an), sonst den Zwischenspeicher.
// Anfragen an Deezer (Hörproben) laufen unverändert durch und werden nicht gespeichert.
const SPEICHER = "tims-brettspiel-v1";
const DATEIEN = ["./", "index.html", "style.css", "app.js", "karten.js", "jsQR.js",
                 "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "favicon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SPEICHER).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((namen) => Promise.all(namen.filter((n) => n !== SPEICHER).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(SPEICHER).then((c) => c.put(e.request, kopie));
        }
        return antwort;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
