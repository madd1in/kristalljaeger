# 💎 Kristalljäger

Kleines 3D-Arcade-Spiel für den Browser (Desktop & Handy). Du steuerst eine Drohne über eine schwebende Low-Poly-Insel, sammelst in 60 Sekunden so viele Kristalle wie möglich und weichst Minen aus – oder rammst sie mit dem Boost.

**▶ Spielen:** https://madd1in.github.io/kristalljaeger/

## Steuerung

| | Desktop | Handy / Tablet |
|---|---|---|
| Fliegen | WASD / Pfeiltasten | Links auf dem Bildschirm ziehen (Joystick) |
| Boost (rammt Minen) | Leertaste | BOOST-Button rechts |
| Pause | P / Esc | ❚❚-Button |
| Ton an/aus | M | Einstellungen |
| FPS-Anzeige | F | Einstellungen |

## Features

- **Kombos:** Kristalle schnell hintereinander sammeln → bis zu x5 Punkte
- **Kristallarten:** Türkis (10), Pink (30), Gold (50, nur im Kristallsturm)
- **Power-ups:** 🧲 Magnet · ✖2 Punkte · ⏱ +5 Sekunden · 🛡 Schild
- **Boost-Rammen:** Minen während des Boosts zerstören (+25, Jäger-Mine +60)
- **Kristallsturm** zur Halbzeit: Kristalle regnen vom Himmel
- **Jäger-Mine** ab Sekunde 25: verfolgt die Drohne
- **Rang S–D**, Statistiken und lokaler Bestwert
- **Grafikstufen** Auto / Hoch / Mittel / Niedrig – Auto regelt bei Rucklern automatisch herunter
- Ladebalken, Hintergrundmusik, Soundeffekte und deutsche Sprachansagen

## Technik

- [three.js](https://threejs.org/) (r186), gebündelt mit esbuild in **eine** `index.html` – startet auch offline und per Doppelklick
- Performance: instanzierte Deko (Bäume, Gras, Wolken), verschmolzene Minen-Geometrie, Partikel- und Glow-Pools → wenige Draw Calls; Bloom nur auf „Hoch“
- Audio über WebAudio (Fallback auf `<audio>` unter `file://`)

### Entwickeln

```bash
npm install
npm run build      # erzeugt index.html aus src/
```

Quellcode liegt in `src/` (`game.js`, `world.js`, `audio.js`, `input.js`, `config.js`, `index.html`), Styles in `style.css`, Assets in `assets/`.

## Credits

- Musik, Soundeffekte, Sprachansagen und Titelbild: generiert mit ElevenLabs
- HUD/UI-Entwürfe: Figma
- Code: erstellt mit Claude Code
