// Service Worker: hält die App-Dateien vor, damit die App auch bei schlechtem Netz startet.
// Erst das Netz fragen (so kommen neue Kartendaten sofort an). Antwortet es nicht binnen 4 Sekunden
// oder mit einem Fehler, kommt die gespeicherte Kopie. Ohne Kopie wird weiter auf das Netz gewartet.
// Nur Dateien dieser App (unterhalb des eigenen Bereichs) werden angefasst. Deezer läuft unverändert durch.
// Der Ursprung kaltmacher-apps.github.io ist mit anderen Seiten der Organisation geteilt, deshalb löscht
// dieser Service Worker nur Speicher mit dem eigenen Namensanfang.
const PRAEFIX = "zeitsprung-";
const SPEICHER = PRAEFIX + "v1";
const DATEIEN = ["./", "index.html", "style.css", "app.js", "karten.js", "jsQR.js", "manifest.webmanifest",
                 "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "favicon.png"];
const ZEITLIMIT = 4000;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SPEICHER)
    .then((c) => c.addAll(DATEIEN.map((d) => new Request(d, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((namen) => Promise.all(namen.filter((n) => n.startsWith(PRAEFIX) && n !== SPEICHER).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const anfrage = e.request;
  if (anfrage.method !== "GET" || !anfrage.url.startsWith(self.registration.scope)) return;
  const netz = fetch(anfrage.url, { cache: "no-cache" });
  e.waitUntil(netz.then(
    (a) => (a.ok ? caches.open(SPEICHER).then((c) => c.put(anfrage, a.clone())) : undefined),
    () => {}));
  const kopie = () => caches.match(anfrage, { ignoreSearch: true });
  e.respondWith((async () => {
    let uhr;
    const frist = new Promise((_, nein) => { uhr = setTimeout(() => nein(new Error("Zeitlimit")), ZEITLIMIT); });
    try {
      const antwort = await Promise.race([netz, frist]);
      return antwort.ok ? antwort : ((await kopie()) || antwort);
    } catch {
      return (await kopie()) || netz;
    } finally {
      clearTimeout(uhr);
    }
  })());
});
