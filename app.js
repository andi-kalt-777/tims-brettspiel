// Abspiel-Seite für Tims Brettspiel: QR-Code einer Karte scannen und die Hörprobe verdeckt abspielen.
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
const SPOTIFY = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})/;

let strom = null;          // Kamera-Stream
let scanLaeuft = false;
let letzterVersuch = 0;
let detektor = null;       // BarcodeDetector, wo vorhanden (Chrome auf Android)
let karte = null;          // { spotifyId, deezerId }
let vorschau = null;       // Promise auf die Hörproben-URL der aktuellen Karte

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
  audio.play().then(() => { audio.pause(); audio.dataset.frei = "1"; }).catch(() => {});
}

// ---------- Deezer ----------
function deezerTrack(id) {
  return new Promise((ok, fehler) => {
    const name = "dz" + Date.now() + Math.floor(Math.random() * 1e6);
    const skript = document.createElement("script");
    const uhr = setTimeout(() => { aufraeumen(); fehler(new Error("Zeitüberschreitung")); }, 12000);
    function aufraeumen() { clearTimeout(uhr); delete window[name]; skript.remove(); }
    window[name] = (d) => { aufraeumen(); ok(d); };
    skript.onerror = () => { aufraeumen(); fehler(new Error("keine Verbindung")); };
    skript.src = "https://api.deezer.com/track/" + encodeURIComponent(id) + "?output=jsonp&callback=" + name;
    document.head.appendChild(skript);
  });
}
async function hoerprobe(deezerId) {
  const d = await deezerTrack(deezerId);
  const url = d && typeof d.preview === "string" ? d.preview : "";
  if (!url.startsWith("https://")) throw new Error("keine Hörprobe");
  return url;
}

// ---------- Karte erkannt ----------
function karteGefunden(text) {
  const m = SPOTIFY.exec(text || "");
  if (!m) return false;
  const spotifyId = m[1];
  if (!(spotifyId in KARTEN)) { melde("Diese Karte gehört nicht zum Spiel."); return false; }
  stoppeKamera();
  if (navigator.vibrate) navigator.vibrate(60);
  melde("");
  karte = { spotifyId, deezerId: KARTEN[spotifyId] };
  zeige("song");
  $("balken").style.width = "0";
  const sp = $("a-spotify");
  sp.href = "https://open.spotify.com/track/" + spotifyId;
  sp.hidden = true;
  if (!karte.deezerId) {
    vorschau = null;
    setzeStatus("Für diese Karte gibt es keine Hörprobe", false);
    $("b-play").disabled = true;
    sp.hidden = false;
    return true;
  }
  $("b-play").disabled = false;
  setzeStatus("Lade Hörprobe …", false);
  vorschau = hoerprobe(karte.deezerId);
  vorschau.then(() => spiele(true)).catch(() => {
    setzeStatus("Hörprobe nicht erreichbar", false);
    melde("Keine Verbindung zu Deezer. Internet prüfen und auf Abspielen tippen.");
    sp.hidden = false;
  });
  return true;
}

async function spiele(automatisch) {
  if (!karte || !vorschau) return;
  let url;
  try {
    url = await vorschau;
  } catch {
    vorschau = hoerprobe(karte.deezerId);          // ein neuer Versuch je Tipp
    try { url = await vorschau; } catch { melde("Hörprobe nicht erreichbar. Internet prüfen."); return; }
  }
  if (audio.src !== url) { audio.src = url; audio.loop = true; }
  if ("mediaSession" in navigator && window.MediaMetadata) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: "Tims Brettspiel", artist: "Welches Jahr?" });
  }
  try {
    await audio.play();
    melde("");
  } catch {
    setzeStatus("Karte erkannt", false);
    if (!automatisch) melde("Abspielen wurde blockiert. Bitte noch einmal tippen.");
  }
}

audio.addEventListener("playing", () => { if (audio.src !== STILLE) setzeStatus("Läuft …", true); });
audio.addEventListener("pause", () => { if (karte && audio.src !== STILLE) setzeStatus("Pausiert", false); });
audio.addEventListener("timeupdate", () => {
  if (audio.duration > 0) $("balken").style.width = (100 * audio.currentTime / audio.duration).toFixed(1) + "%";
});

// ---------- Kamera ----------
async function starteKamera() {
  tonFreischalten();
  melde("");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    melde("Die Kamera ist hier nicht erreichbar. Nimm „Foto statt Kamera“.");
    return;
  }
  try {
    strom = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
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
  video.srcObject = strom;
  await video.play().catch(() => {});
  zeige("scan");
  scanLaeuft = true;
  requestAnimationFrame(scanSchritt);
}

function stoppeKamera() {
  scanLaeuft = false;
  if (strom) strom.getTracks().forEach((t) => t.stop());
  strom = null;
  video.srcObject = null;
}

async function lies(quelle, breite, hoehe) {
  if (detektor) {
    try {
      const codes = await detektor.detect(quelle);
      if (codes.length) return codes[0].rawValue;
    } catch { /* weiter mit jsQR */ }
  }
  const f = Math.min(1, 720 / Math.max(breite, hoehe));
  leinwand.width = Math.round(breite * f);
  leinwand.height = Math.round(hoehe * f);
  ctx.drawImage(quelle, 0, 0, leinwand.width, leinwand.height);
  const bild = ctx.getImageData(0, 0, leinwand.width, leinwand.height);
  const code = window.jsQR ? window.jsQR(bild.data, bild.width, bild.height, { inversionAttempts: "dontInvert" }) : null;
  return code ? code.data : null;
}

async function scanSchritt(zeit) {
  if (!scanLaeuft) return;
  if (zeit - letzterVersuch > 180 && video.readyState >= 2 && video.videoWidth) {
    letzterVersuch = zeit;
    const text = await lies(video, video.videoWidth, video.videoHeight);
    if (text && karteGefunden(text)) return;
  }
  requestAnimationFrame(scanSchritt);
}

// ---------- Foto statt Kamera ----------
$("foto").addEventListener("change", async (e) => {
  const datei = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!datei) return;
  melde("");
  try {
    const bild = await createImageBitmap(datei);
    const text = await lies(bild, bild.width, bild.height);
    if (!text) { melde("Auf dem Foto wurde kein QR-Code gefunden. Bitte näher ran und scharf stellen."); return; }
    if (!karteGefunden(text) && !SPOTIFY.test(text)) melde("Dieser QR-Code gehört nicht zum Spiel.");
  } catch {
    melde("Das Foto konnte nicht gelesen werden.");
  }
});

// ---------- Knöpfe ----------
$("b-scan").addEventListener("click", starteKamera);
$("foto").addEventListener("click", tonFreischalten);
$("b-abbruch").addEventListener("click", () => { stoppeKamera(); zeige("start"); });
$("b-play").addEventListener("click", () => {
  if (!audio.paused && audio.src !== STILLE) { audio.pause(); return; }
  if (vorschau) spiele(false);
});
$("b-weiter").addEventListener("click", () => {
  audio.pause();
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
