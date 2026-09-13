# 💎 Kristalljäger

3D-Arcade-Spiel für den Browser (Desktop, Handy, Controller). Du steuerst eine Drohne über schwebende Low-Poly-Inseln, sammelst in 60 Sekunden so viele Kristalle wie möglich, erfüllst Aufträge und rammst Minen mit dem Boost.

**▶ Spielen:** https://madd1in.github.io/kristalljaeger/ – lässt sich auch als App installieren und offline spielen.

## Steuerung

| | Tastatur | Handy / Tablet | Controller |
|---|---|---|---|
| Fliegen | WASD / Pfeiltasten | Links ziehen (Joystick) | Linker Stick / Steuerkreuz |
| Boost (rammt Minen) | Leertaste | BOOST-Button | A / RT / RB |
| Pause | P / Esc | ❚❚-Button | Start |
| Menüs | Maus | Tippen | Steuerkreuz + A, B = zurück |
| Ton an/aus | M | Einstellungen | – |
| FPS-Anzeige | F | Einstellungen | – |

## Features

- **3 Welten** mit eigener Gefahr
  - 🌿 **Wieseninsel** – der Einstieg
  - ❄️ **Frostinsel** – Glatteis-Flächen, auf denen die Drohne rutscht (freigeschaltet ab 700 Punkten auf der Wiese)
  - 🌋 **Vulkaninsel** – Lava-Geysire mit Vorwarnung (freigeschaltet ab 700 Punkten auf Frost)
- **♾ Endlos-Modus:** kein Timer – überleben, bis das Schild bricht; Kristallsturm alle 50 s, Titan alle 60 s
- **🗿 Titan-Mine (Boss):** nur mit Boost verwundbar, 5 Treffer; auf der Vulkaninsel 20 s vor Schluss und im Endlos-Modus. Belohnung: +400, Schild und ein Ring aus Goldkristallen
- **🏆 12 Erfolge** mit Einblendung und eigener Übersicht
- **Musik pro Welt** mit weicher Überblendung beim Wechsel
- **📤 Teilen** des Ergebnisses (Teilen-Menü am Handy, sonst Zwischenablage)
- **Aufträge:** 3 zufällige pro Runde (z. B. „Ramme 3 Minen“, „Kombo x5“), je +100 Punkte
- **📅 Tages-Challenge:** jeden Tag dieselbe Welt, dieselben Aufträge und Spawns für alle – eigener Tages-Bestwert
- **🛸 Hangar:** 5 Drohnen-Skins, freigeschaltet über insgesamt gesammelte Kristalle
- **Kombos** bis x5, Kristallarten Türkis (10) / Pink (30) / Gold (50)
- **Power-ups:** 🧲 Magnet · ✖2 Punkte · ⏱ +5 Sekunden · 🛡 Schild
- **Kristallsturm** zur Halbzeit, **Jäger-Mine** ab Sekunde 25, **Rang S–D**
- **Grafikstufen** Auto / Hoch / Mittel / Niedrig (Auto regelt bei Rucklern herunter), Bloom auf „Hoch“
- **Optionen:** Musik, Effekte, FPS-Anzeige, Kamerawackeln und Vibration abschaltbar
- Ladebalken, Hintergrundmusik, Triebwerksgeräusch, Soundeffekte, deutsche Sprachansagen
- **PWA:** installierbar, Offline-Cache per Service Worker

## Technik

- [three.js](https://threejs.org/) r186, mit esbuild zu **einer** `index.html` gebündelt (startet auch per Doppelklick)
- Performance: instanzierte Deko, verschmolzene Minen-Geometrie, Partikel- und Glow-Pools, automatische Grafikstufen
- Audio über WebAudio (Fallback auf `<audio>` unter `file://`)
- Fortschritt (Bestwerte, Kristalle, Skins) lokal im Browser gespeichert

### Entwickeln

```bash
npm install
npm run build      # erzeugt index.html und sw.js aus src/
```

Die GitHub Action **Build-Check** baut bei jedem Push neu und schlägt fehl, wenn `index.html`/`sw.js` nicht zum Quellcode passen (also `npm run build` vor dem Commit vergessen wurde).

| Datei | Inhalt |
|---|---|
| `src/game.js` | Spielablauf, HUD, Menüs, Kamera |
| `src/world.js` | Welten, Himmel, Deko, Partikel |
| `src/config.js` | Balance, Welten, Skins, Aufträge, Grafikstufen |
| `src/progress.js` | Profil, Freischaltungen, Tages-Challenge |
| `src/audio.js` / `src/input.js` | Sound / Tastatur, Touch, Gamepad |
| `src/models.js` + `src/models/*.glb` | In Blender modellierte Drohne, Mine und Kristall (werden ins Bundle eingebettet) |
| `blender/kristalljaeger-modelle.blend` | Blender-Quelldatei der Modelle, Kamera & Licht für die Skin-Vorschaubilder |

**Modelle ändern:** `.blend` in Blender öffnen, Objekt „Drone“, „Mine“ oder „Crystal“ bearbeiten (Materialnamen `Body`, `Accent`, `Glow` beibehalten – das Spiel färbt danach um), als GLB nach `src/models/` exportieren (+Y oben, Modifikatoren anwenden), dann `npm run build`.

## Credits

- Musik, Soundeffekte, Sprachansagen, Titelbild und App-Icon: generiert mit ElevenLabs
- 3D-Modelle (Drohne, Minen, Kristalle) und Hangar-Vorschaubilder: Blender (über Blender MCP)
- HUD/UI-Entwürfe: Figma
- Code: erstellt mit Claude Code
