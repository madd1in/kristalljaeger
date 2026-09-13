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
- **Aufträge:** 3 zufällige pro Runde (z. B. „Ramme 3 Minen“, „Kombo x5“), je +100 Punkte
- **📅 Tages-Challenge:** jeden Tag dieselbe Welt, dieselben Aufträge und Spawns für alle – eigener Tages-Bestwert
- **🛸 Hangar:** 5 Drohnen-Skins, freigeschaltet über insgesamt gesammelte Kristalle
- **Kombos** bis x5, Kristallarten Türkis (10) / Pink (30) / Gold (50)
- **Power-ups:** 🧲 Magnet · ✖2 Punkte · ⏱ +5 Sekunden · 🛡 Schild
- **Kristallsturm** zur Halbzeit, **Jäger-Mine** ab Sekunde 25, **Rang S–D**
- **Grafikstufen** Auto / Hoch / Mittel / Niedrig (Auto regelt bei Rucklern herunter), Bloom auf „Hoch“
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

| Datei | Inhalt |
|---|---|
| `src/game.js` | Spielablauf, HUD, Menüs, Kamera |
| `src/world.js` | Welten, Himmel, Deko, Partikel |
| `src/config.js` | Balance, Welten, Skins, Aufträge, Grafikstufen |
| `src/progress.js` | Profil, Freischaltungen, Tages-Challenge |
| `src/audio.js` / `src/input.js` | Sound / Tastatur, Touch, Gamepad |

## Credits

- Musik, Soundeffekte, Sprachansagen, Titelbild und App-Icon: generiert mit ElevenLabs
- HUD/UI-Entwürfe: Figma
- Code: erstellt mit Claude Code
