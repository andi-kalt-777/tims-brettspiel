# Tims Brettspiel

Kleine Web-App zum selbst gemachten Musik-Kartenspiel: Karte scannen, Hörprobe hören, Jahr raten.

- Die Karten tragen einen QR-Code mit einem normalen Spotify-Link.
- Die App liest den Code mit der Handykamera und spielt eine 30-Sekunden-Hörprobe von Deezer ab.
- Titel, Interpret und Jahr zeigt sie nie an. Sie stehen auch nicht in den Dateien dieser App.
- `karten.js` ordnet jeder Spotify-ID eine Deezer-ID zu. Die Datei wird aus der Songliste erzeugt und nicht von Hand geändert.

**Installieren:** Seite im Handy-Browser öffnen.
- Android (Chrome): „Als App installieren“ antippen.
- iPhone (Safari): Teilen → „Zum Home-Bildschirm“.

**Fremdkomponente:** [jsQR](https://github.com/cozmo/jsQR) 1.4.0, Apache License 2.0, siehe `LICENSE-jsQR.txt`.

Privates, nicht kommerzielles Projekt. Die Hörproben kommen über die öffentliche Deezer-API.
