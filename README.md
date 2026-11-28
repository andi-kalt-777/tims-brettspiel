# Zeitsprung · Musikquiz

Kleine Web-App zum selbst gemachten Musik-Kartenspiel: Karte scannen, Hörprobe hören, Jahr raten.

- Die Karten tragen einen QR-Code mit einem normalen Spotify-Link.
- Die App liest den Code mit der Handykamera und spielt eine 30-Sekunden-Hörprobe von Deezer ab.
- Titel, Interpret und Jahr zeigt sie nie an. Sie stehen auch nicht in den Dateien dieser App.
- `karten.js` ordnet jeder Spotify-ID eine Deezer-ID zu. Die Datei wird aus der Songliste erzeugt und nicht von Hand geändert.

**Installieren:** Seite im Handy-Browser öffnen.
- Android (Chrome): „Als App installieren“ antippen.
- iPhone (Safari): Teilen → „Zum Home-Bildschirm“.

**Fremdkomponente:** [jsQR](https://github.com/cozmo/jsQR) 1.4.0, Apache License 2.0, siehe `LICENSE-jsQR.txt`.
SHA-256 von `jsQR.js` (LF-Zeilenenden): `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859`.
Wird nicht mehr weiterentwickelt; ab und zu bei OSV oder den GitHub Advisories nachsehen.

**Bekanntes Restrisiko:** Die Deezer-API erlaubt kein CORS, deshalb kommt die Hörproben-Adresse per JSONP.
Die Antwort läuft als Skript in der Seite. Die CSP erlaubt dafür nur `https://api.deezer.com/track/`,
die Hörprobe selbst nur von `*.dzcdn.net`. Die Adressen gelten 15 Minuten und lassen sich nicht vorab speichern.

**Testliste vor einer neuen Fassung** (iPhone und Android):
- Doppeltipp auf „Karte scannen“: nur eine Kamera, sie geht nach dem Scan aus.
- „Abbrechen“ während ein Code im Bild ist: es startet keine Hörprobe.
- Langsames Netz (DevTools „Slow 3G“): „Abspielen“ während des Ladens, dann „Nächste Karte“: keine alte Hörprobe.
- 20 Minuten Pause, dann „Abspielen“: die Hörprobe lädt neu und läuft.
- Start im Flugmodus: die App öffnet sich aus dem Speicher.
- Karte #99: Hinweis „keine Hörprobe“ und Spotify-Link.
- Play-Taste am Kopfhörer oder Sperrbildschirm während des Scans: es läuft nichts.

Privates, nicht kommerzielles Projekt. Die Hörproben kommen über die öffentliche Deezer-API.
