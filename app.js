// Zeitsprung, das Musikquiz: QR-Code einer Karte scannen und die Hörprobe verdeckt abspielen.
// Die Karten enthalten normale Spotify-Links. karten.js ordnet jeder Spotify-ID eine Deezer-ID zu,
// die Hörprobe (30 s) kommt zur Laufzeit von der Deezer-API (JSONP, die API erlaubt kein CORS).
// Titel, Interpret und Jahr stehen nirgends in dieser Seite.
"use strict";

const $ = (id) => document.getElementById(id);
const KARTEN = window.KARTEN || {};
const audio = $("audio");
const video = $("video");
const leinwand = $("leinwand");
const ctx = leinwand.getContext("2d", { willReadFrequently: true });
const SPOTIFY = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})(?:[?#]|$)/;
const FRISCH = 10 * 60 * 1000;   // Deezer-Adressen gelten 15 Minuten, nach 10 Minuten neu holen

let strom = null;          // Kamera-Stream
let scanLaeuft = false;
let scanId = 0;            // gehört zu genau einer Scan-Schleife
let kameraStartet = false;
let letzterVersuch = 0;
let detektor = null;       // BarcodeDetector, wo vorhanden (Chrome auf Android)
let karte = null;          // { spotifyId, deezerId }
let vorschau = null;       // { p: Promise auf die Hörproben-URL, zeit, fehler }
let lauf = 0;              // zählt Kartenwechsel; späte Antworten zu alten Karten werden verworfen
let medienFehler = 0;

const hatKarte = (id) => Object.prototype.hasOwnProperty.call(KARTEN, id);

// ---------- Anzeige ----------
function zeige(schritt) {
  for (const s of document.querySelectorAll(".schritt")) s.classList.toggle("aktiv", s.id === "s-" + schritt);
}
function melde(text) {
  const m = $("meldung");
  m.textContent = text || "";
  m.hidden = !text;
}
function setzeStatus(text, spielt) {
  $("song-text").textContent = text;
  $("anzeige").classList.toggle("spielt", !!spielt);
  $("b-play").textContent = spielt ? "Pause" : "Abspielen";
}

// ---------- Ton freischalten ----------
// iPhones spielen Ton nur nach einem Tipp. Ein stiller Ton beim Tipp auf "Karte scannen"
// schaltet das Audio-Element frei, danach startet die Hörprobe nach dem Scan von selbst.
function stillerTon() {
  const n = 800, b = new ArrayBuffer(44 + n), v = new DataView(b);
  const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF"); v.setUint32(4, 36 + n, true); s(8, "WAVE"); s(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true);
  v.setUint16(34, 8, true); s(36, "data"); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}
const STILLE = stillerTon();
function tonFreischalten() {
  if (audio.dataset.frei) return;
  audio.src = STILLE;
  audio.play().then(() => { if (audio.src === STILLE) audio.pause(); audio.dataset.frei = "1"; }).catch(() => {});
}
// Alte Hörprobe entladen, damit Kopfhörer- oder Sperrbildschirm-Tasten sie nicht wieder starten.
function audioLeeren() {
  audio.pause();
  if (audio.src !== STILLE) audio.src = STILLE;
  $("balken").style.width = "0";
}

// ---------- Deezer ----------
function fehlerArt(art, text) { return Object.assign(new Error(text), { art }); }
function deezerTrack(id) {
  return new Promise((ok, fehler) => {
    const name = "dz" + Date.now() + Math.floor(Math.random() * 1e6);
    const skript = document.createElement("script");
    const uhr = setTimeout(() => {
      window[name] = () => { delete window[name]; };     // eine späte Antwort läuft ins Leere
      skript.remove();
      fehler(fehlerArt("netz", "Zeitüberschreitung"));
    }, 12000);
    window[name] = (d) => { clearTimeout(uhr); delete window[name]; skript.remove(); ok(d); };
    skript.onerror = () => { clearTimeout(uhr); delete window[name]; skript.remove(); fehler(fehlerArt("netz", "keine Verbindung")); };
    skript.src = "https://api.deezer.com/track/" + encodeURIComponent(id) + "?output=jsonp&callback=" + name;
    document.head.appendChild(skript);
  });
}
async function hoerprobe(deezerId) {
  const d = await deezerTrack(deezerId);
  if (!d || typeof d !== "object" || d.error) throw fehlerArt("netz", "Deezer antwortet nicht");
  let url = null;
  try { url = new URL(d.preview); } catch { url = null; }
  if (!url || url.protocol !== "https:" || !url.hostname.endsWith(".dzcdn.net")) throw fehlerArt("keine", "keine Hörprobe");
  return url.href;
}
function neueVorschau(k) {
  const v = { p: hoerprobe(k.deezerId), zeit: Date.now(), fehler: false };
  v.p.catch(() => { v.fehler = true; });
  vorschau = v;
  return v;
}
function zeigeLadefehler(e) {
  const keine = e && e.art === "keine";
  setzeStatus(keine ? "Für diese Karte gibt es gerade keine Hörprobe" : "Hörprobe nicht erreichbar", false);
  melde(keine ? "Deezer liefert für diesen Titel gerade keine Hörprobe."
              : "Keine Verbindung zu Deezer. Internet prüfen und auf Abspielen tippen.");
  $("a-spotify").hidden = false;
}

// ---------- Karte erkannt ----------
function karteGefunden(text) {
  const m = SPOTIFY.exec(String(text || "").trim());
  if (!m) return false;
  const spotifyId = m[1];
  if (!hatKarte(spotifyId)) { melde("Diese Karte gehört nicht zum Spiel."); return false; }
  stoppeKamera();
  lauf++;
  audioLeeren();
  if (navigator.vibrate) navigator.vibrate(60);
  melde("");
  karte = { spotifyId, deezerId: KARTEN[spotifyId] };
  vorschau = null;
  medienFehler = 0;
  zeige("song");
  const sp = $("a-spotify");
  sp.href = "https://open.spotify.com/track/" + spotifyId;
  sp.hidden = true;
  if (!karte.deezerId) {
    setzeStatus("Für diese Karte gibt es keine Hörprobe", false);
    $("b-play").disabled = true;
    sp.hidden = false;
    return true;
  }
  $("b-play").disabled = false;
  spiele(true);
  return true;
}

// Jeder Aufruf merkt sich Karte und Lauf und bricht ab, sobald inzwischen eine andere Karte dran ist.
async function spiele(automatisch) {
  const meine = lauf, k = karte;
  if (!k || !k.deezerId) return;
  if (!vorschau || vorschau.fehler || Date.now() - vorschau.zeit > FRISCH) neueVorschau(k);
  const v = vorschau;
  if (audio.paused) setzeStatus("Lade Hörprobe …", false);
  let url;
  try {
    url = await v.p;
  } catch (e) {
    if (meine === lauf) zeigeLadefehler(e);
    return;
  }
  if (meine !== lauf) return;
  if (audio.src !== url || audio.error) { audio.src = url; audio.loop = true; }
  if ("mediaSession" in navigator && window.MediaMetadata) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: "Zeitsprung", artist: "Welches Jahr?" });
  }
  try {
    await audio.play();
    if (meine === lauf) melde("");
  } catch (e) {
    if (meine !== lauf || e.name === "AbortError") return;   // Pause getippt oder Karte gewechselt
    if (audio.error) return;                                  // übernimmt der error-Listener
    if (e.name === "NotAllowedError") {
      setzeStatus("Karte erkannt", false);
      if (!automatisch) melde("Abspielen wurde blockiert. Bitte noch einmal tippen.");
      return;
    }
    vorschau = null;
    setzeStatus("Hörprobe konnte nicht abgespielt werden", false);
    melde("Bitte noch einmal auf Abspielen tippen.");
  }
}

audio.addEventListener("playing", () => { if (audio.src !== STILLE) { medienFehler = 0; setzeStatus("Läuft …", true); } });
audio.addEventListener("pause", () => { if (karte && audio.src !== STILLE) setzeStatus("Pausiert", false); });
audio.addEventListener("timeupdate", () => {
  if (audio.src !== STILLE && audio.duration > 0) $("balken").style.width = (100 * audio.currentTime / audio.duration).toFixed(1) + "%";
});
// Abgelaufene oder gestörte Hörprobe: Adresse neu holen, höchstens zweimal in Folge.
audio.addEventListener("error", () => {
  if (!karte || !karte.deezerId || audio.src === STILLE) return;
  vorschau = null;
  if (++medienFehler > 2) {
    setzeStatus("Hörprobe konnte nicht geladen werden", false);
    melde("Internet prüfen und auf Abspielen tippen.");
    return;
  }
  setzeStatus("Lade Hörprobe neu …", false);
  spiele(true);
});

// ---------- Kamera ----------
async function starteKamera() {
  tonFreischalten();                      // muss direkt im Tipp passieren, vor jedem await
  if (kameraStartet || scanLaeuft) return;
  kameraStartet = true;
  const meine = lauf;
  const abgeloest = () => meine !== lauf || document.hidden;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      melde("Die Kamera ist hier nicht erreichbar. Nimm „Foto statt Kamera“.");
      return;
    }
    melde("Kamera startet …");
    let neu;
    try {
      neu = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch {
      melde("Kein Zugriff auf die Kamera. Erlaube die Kamera im Browser oder nimm „Foto statt Kamera“.");
      return;
    }
    if (!detektor && "BarcodeDetector" in window) {
      try {
        const formate = await window.BarcodeDetector.getSupportedFormats();
        if (formate.includes("qr_code")) detektor = new window.BarcodeDetector({ formats: ["qr_code"] });
      } catch { detektor = null; }
    }
    if (abgeloest()) { neu.getTracks().forEach((t) => t.stop()); melde(""); return; }
    stoppeKamera();
    strom = neu;
    video.srcObject = strom;
    await video.play().catch(() => {});
    if (abgeloest() || strom !== neu) { if (strom === neu) stoppeKamera(); melde(""); return; }
    melde("");
    zeige("scan");
    scanLaeuft = true;
    const id = ++scanId;
    requestAnimationFrame((z) => scanSchritt(z, id));
  } finally {
    kameraStartet = false;
  }
}

function stoppeKamera() {
  scanLaeuft = false;
  scanId++;
  if (strom) strom.getTracks().forEach((t) => t.stop());
  strom = null;
  video.srcObject = null;
  leinwand.width = 0;                     // letztes Kamerabild nicht im Speicher lassen
  leinwand.height = 0;
}

// Liest einen QR-Code. Mit BarcodeDetector nur dieser (spart Akku), jsQR nur als Ersatz.
// Fotos: größere Auflösung und beide Leser, weil es nur einen Versuch gibt.
async function lies(quelle, breite, hoehe, foto) {
  if (detektor) {
    try {
      const codes = await detektor.detect(quelle);
      const treffer = codes.find((c) => SPOTIFY.test(String(c.rawValue).trim())) || codes[0];
      if (treffer) return treffer.rawValue;
      if (!foto) return null;
    } catch { /* weiter mit jsQR */ }
  }
  if (!window.jsQR) return null;
  const f = Math.min(1, (foto ? 1600 : 720) / Math.max(breite, hoehe));
  leinwand.width = Math.round(breite * f);
  leinwand.height = Math.round(hoehe * f);
  ctx.drawImage(quelle, 0, 0, leinwand.width, leinwand.height);
  const bild = ctx.getImageData(0, 0, leinwand.width, leinwand.height);
  const code = window.jsQR(bild.data, bild.width, bild.height, { inversionAttempts: "dontInvert" });
  return code ? code.data : null;
}

async function scanSchritt(zeit, id) {
  if (!scanLaeuft || id !== scanId) return;
  if (zeit - letzterVersuch > 180 && video.readyState >= 2 && video.videoWidth) {
    letzterVersuch = zeit;
    let text = null;
    try { text = await lies(video, video.videoWidth, video.videoHeight, false); } catch { text = null; }
    if (!scanLaeuft || id !== scanId) return;          // inzwischen abgebrochen oder im Hintergrund
    if (text && karteGefunden(text)) return;
  }
  requestAnimationFrame((z) => scanSchritt(z, id));
}

// ---------- Foto statt Kamera ----------
$("foto").addEventListener("change", async (e) => {
  const datei = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!datei) return;
  melde("");
  let bild = null;
  try {
    bild = await createImageBitmap(datei);
    const text = await lies(bild, bild.width, bild.height, true);
    if (!text) { melde("Auf dem Foto wurde kein QR-Code gefunden. Bitte näher ran und scharf stellen."); return; }
    if (!karteGefunden(text) && !SPOTIFY.test(String(text).trim())) melde("Dieser QR-Code gehört nicht zum Spiel.");
  } catch {
    melde("Das Foto konnte nicht gelesen werden.");
  } finally {
    if (bild && bild.close) bild.close();
    leinwand.width = 0;
    leinwand.height = 0;
  }
});

// ---------- Knöpfe ----------
$("b-scan").addEventListener("click", starteKamera);
$("foto").addEventListener("click", tonFreischalten);
$("b-abbruch").addEventListener("click", () => { stoppeKamera(); melde(""); zeige("start"); });
$("b-play").addEventListener("click", () => {
  if (!audio.paused && audio.src !== STILLE) { audio.pause(); return; }
  spiele(false);
});
$("b-weiter").addEventListener("click", () => {
  lauf++;
  audioLeeren();
  karte = null;
  vorschau = null;
  starteKamera();
});
document.addEventListener("visibilitychange", () => { if (document.hidden && scanLaeuft) { stoppeKamera(); zeige("start"); } });

if (!Object.keys(KARTEN).length) melde("Die Kartendaten fehlen (karten.js).");

// ---------- Als App installieren ----------
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
const alsApp = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
let installAnfrage = null;
window.addEventListener("beforeinstallprompt", (e) => {      // Android und Chrome
  e.preventDefault();
  installAnfrage = e;
  $("b-install").hidden = false;
});
$("b-install").addEventListener("click", async () => {
  if (!installAnfrage) return;
  installAnfrage.prompt();
  await installAnfrage.userChoice.catch(() => {});
  installAnfrage = null;
  $("b-install").hidden = true;
});
window.addEventListener("appinstalled", () => { $("b-install").hidden = true; });
const iPhone = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
               (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
if (iPhone && !alsApp) $("ios-hinweis").hidden = false;
