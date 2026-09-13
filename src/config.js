// Spielbalance, Welten, Skins, Aufträge, Grafikstufen und Asset-Liste

export const ARENA = 19;              // Spielfeld-Radius
export const GAME_TIME = 60;          // Sekunden pro Runde
export const HOVER_Y = 1.6;
export const MAX_SHIELD = 3;
export const CRYSTAL_COUNT = 10;      // normale Kristalle gleichzeitig
export const MAX_CRYSTALS = 28;       // Obergrenze inkl. Kristallsturm
export const START_MINES = 4;
export const MAX_MINES = 9;
export const BOOST_COOLDOWN = 2.5;
export const BOOST_TIME = 0.45;
export const COMBO_WINDOW = 2.2;
export const STORM_AT = 30;           // Restzeit, bei der der Kristallsturm startet
export const STORM_DURATION = 6;
export const HUNTER_AFTER = 25;       // Spielzeit bis zur Jäger-Mine
export const POWERUP_EVERY = [9, 13]; // Sekunden zwischen Power-ups
export const POWERUP_LIFETIME = 9;
export const MISSION_BONUS = 100;

export const LAVA = { every: [2.8, 4.6], warn: 1.4, radius: 2.4, aimAtPlayer: 0.55 };

// Titan-Mine (Boss): nur mit Boost verwundbar
export const TITAN = { hp: 5, speed: 2.3, reach: 2.5, points: 400, hitPoints: 50, goldDrop: 8, normalAt: 20, endlessFirst: 45, endlessEvery: 60 };

// Endlos-Modus: kein Timer, Schwierigkeit steigt, Ende bei 0 Schild
export const ENDLESS = { stormEvery: 50, mineEvery: 8, maxMines: 12, shieldWeight: 45 };

export const ACHIEVEMENTS = [
  { id: 'first', icon: '🚀', name: 'Erster Flug', text: 'Spiele deine erste Runde' },
  { id: 'combo5', icon: '🔥', name: 'Kombo-König', text: 'Erreiche Kombo x5' },
  { id: 'smash5', icon: '💥', name: 'Minenbrecher', text: 'Ramme 5 Minen in einer Runde' },
  { id: 'titan', icon: '🗿', name: 'Titanbezwinger', text: 'Besiege die Titan-Mine' },
  { id: 'missions3', icon: '🎯', name: 'Perfektionist', text: 'Erfülle alle 3 Aufträge einer Runde' },
  { id: 'rankS', icon: '👑', name: 'Legende', text: 'Erreiche Rang S' },
  { id: 'frost', icon: '❄️', name: 'Eisläufer', text: 'Schalte die Frostinsel frei' },
  { id: 'volcano', icon: '🌋', name: 'Feuerprobe', text: 'Schalte die Vulkaninsel frei' },
  { id: 'gold10', icon: '🥇', name: 'Goldgräber', text: 'Sammle insgesamt 10 goldene Kristalle' },
  { id: 'crystals1000', icon: '💎', name: 'Kristallsammler', text: 'Sammle insgesamt 1 000 Kristalle' },
  { id: 'endless180', icon: '⏳', name: 'Unermüdlich', text: 'Überlebe 3 Minuten im Endlos-Modus' },
  { id: 'daily', icon: '📅', name: 'Tagesjäger', text: 'Spiele eine Tages-Challenge' },
];
export const ICE = { patches: 7, drag: 0.65, accel: 0.55 };

export const CRYSTAL_TYPES = {
  normal: { points: 10, color: '#14b8a6', emissive: '#0d9488', burst: '#99f6e4' },
  rare: { points: 30, color: '#ec4899', emissive: '#be185d', burst: '#f9a8d4' },
  gold: { points: 50, color: '#f59e0b', emissive: '#d97706', burst: '#fde68a' },
};

export const POWERUPS = {
  magnet: { label: 'MAGNET!', icon: '🧲', color: '#f87171', duration: 8, weight: 30 },
  double: { label: 'PUNKTE x2!', icon: '✖2', color: '#a78bfa', duration: 8, weight: 25 },
  time: { label: '+5 SEKUNDEN!', icon: '⏱', color: '#fbbf24', duration: 0, weight: 25 },
  shield: { label: 'SCHILD +1!', icon: '🛡', color: '#34d399', duration: 0, weight: 20 },
};

export const RANKS = [
  { min: 1600, rank: 'S', text: 'Kristall-Legende' },
  { min: 1100, rank: 'A', text: 'Meisterjäger' },
  { min: 700, rank: 'B', text: 'Profi' },
  { min: 350, rank: 'C', text: 'Solide Jagd' },
  { min: 0, rank: 'D', text: 'Übung macht den Meister' },
];

// Welten: Farben der Umgebung, Deko-Stil und Gefahr
export const BIOMES = {
  meadow: {
    name: 'Wieseninsel', icon: '🌿', unlock: null, hazard: null, voice: 'start', music: 'bgm',
    sky: ['#130a2e', '#7a3c78', '#0c3a4d'], fog: '#2a1d52', exposure: 1.05, bloomThreshold: 0.55,
    hemi: ['#a5e8ff', '#46206a', 1.3], sun: ['#ffd2a1', 2.7],
    ground: ['#3b6b33', '#4f853b'], side: '#5b4636', under: ['#5d4c73', '#241b38'],
    trees: 'meadow', rock: '#6b6280', grass: ['#5fa447', '#7cc45a'], flowers: true,
    deco: [['#5eead4', '#14b8a6'], ['#f472b6', '#db2777']],
    clouds: ['#6f5fa8', '#c9b6ee'], floaterTop: '#4f8a3f',
    dust: { mode: 0, color: '#fef3c7' }, ring: '#5eead4',
  },
  frost: {
    name: 'Frostinsel', icon: '❄️', unlock: { biome: 'meadow', score: 700 }, hazard: 'ice', voice: 'frost', music: 'bgmFrost',
    sky: ['#0a1330', '#3d6aa3', '#0b2a44'], fog: '#1d3558', exposure: 0.8, bloomThreshold: 0.95,
    hemi: ['#c7dcf5', '#1e3a8a', 0.9], sun: ['#dbeafe', 1.5],
    ground: ['#7f96b2', '#a3b7cc'], side: '#5a7190', under: ['#5b7598', '#1e2b4a'],
    trees: 'frost', rock: '#7c8ba1', grass: ['#8fa4bc', '#b3c3d6'], flowers: false,
    deco: [['#93c5fd', '#3b82f6'], ['#a5f3fc', '#22d3ee']],
    clouds: ['#4d6592', '#9fb2d6'], floaterTop: '#b9c8d9',
    dust: { mode: 1, color: '#e0f2fe' }, ring: '#93c5fd',
  },
  volcano: {
    name: 'Vulkaninsel', icon: '🌋', unlock: { biome: 'frost', score: 700 }, hazard: 'lava', voice: 'volcano', music: 'bgmVolcano', titan: true,
    sky: ['#12060a', '#7a2412', '#2a0a0a'], fog: '#3a100c', exposure: 1.1, bloomThreshold: 0.55,
    hemi: ['#fdba74', '#450a0a', 1.05], sun: ['#ffb38a', 2.5],
    ground: ['#2e2628', '#3d3234'], side: '#211a1b', under: ['#3b2a2a', '#120b0b'],
    trees: 'volcano', rock: '#44403c', grass: ['#57534e', '#78716c'], flowers: false,
    deco: [['#fb923c', '#ea580c'], ['#f87171', '#dc2626']],
    clouds: ['#3f1d1d', '#7c3a22'], floaterTop: '#3a2f31',
    dust: { mode: 2, color: '#fb923c' }, ring: '#f97316',
  },
};
export const BIOME_ORDER = ['meadow', 'frost', 'volcano'];

// Drohnen-Skins – freigeschaltet über insgesamt gesammelte Kristalle
export const SKINS = [
  { id: 'standard', name: 'Standard', body: '#6b6580', glow: '#5eead4', unlock: 0 },
  { id: 'neon', name: 'Neon', body: '#4c1d95', glow: '#f472b6', unlock: 150 },
  { id: 'gold', name: 'Goldrausch', body: '#a16207', glow: '#fde047', unlock: 400 },
  { id: 'stealth', name: 'Schatten', body: '#1f2937', glow: '#ef4444', unlock: 800 },
  { id: 'aurora', name: 'Aurora', body: '#e2e8f0', glow: '#34d399', unlock: 1500 },
];

// Aufträge: stat verweist auf einen Zähler im Spielzustand
export const MISSIONS = [
  { id: 'crystals25', text: 'Sammle 25 Kristalle', stat: 'collected', goal: 25 },
  { id: 'combo5', text: 'Erreiche Kombo x5', stat: 'bestCombo', goal: 5 },
  { id: 'smash3', text: 'Ramme 3 Minen', stat: 'minesSmashed', goal: 3 },
  { id: 'gold3', text: 'Sammle 3 goldene Kristalle', stat: 'gold', goal: 3 },
  { id: 'pink5', text: 'Sammle 5 pinke Kristalle', stat: 'rare', goal: 5 },
  { id: 'power2', text: 'Schnapp dir 2 Power-ups', stat: 'powerupsTaken', goal: 2 },
  { id: 'hunter', text: 'Zerstöre die Jäger-Mine', stat: 'huntersSmashed', goal: 1 },
  { id: 'score800', text: 'Erreiche 800 Punkte', stat: 'score', goal: 800 },
  { id: 'nohit30', text: '30 Sekunden ohne Treffer', stat: 'noHitBest', goal: 30 },
];

// pixelRatio ist eine Obergrenze; grass/dust sind Anteile der maximalen Deko-Menge
export const QUALITY = {
  high: { label: 'Hoch', pixelRatio: 2, shadows: true, shadowSize: 2048, bloom: true, grass: 1, dust: 1 },
  medium: { label: 'Mittel', pixelRatio: 1.5, shadows: true, shadowSize: 1024, bloom: false, grass: 0.6, dust: 0.5 },
  low: { label: 'Niedrig', pixelRatio: 0.85, shadows: false, shadowSize: 512, bloom: false, grass: 0.3, dust: 0.25 },
};
export const QUALITY_ORDER = ['high', 'medium', 'low'];

export const ASSETS = {
  image: { title: 'assets/title.jpg' },
  audio: {
    bgm: 'assets/bgm.mp3',
    bgmFrost: 'assets/bgm-frost.mp3',
    bgmVolcano: 'assets/bgm-volcano.mp3',
    engine: 'assets/sfx-engine.mp3',
    titanRoar: 'assets/sfx-titan.mp3',
    titanHit: 'assets/sfx-titan-hit.mp3',
    titan: 'assets/voice-titan.mp3',
    titanDown: 'assets/voice-titan-down.mp3',
    endless: 'assets/voice-endless.mp3',
    achievement: 'assets/voice-achievement.mp3',
    pickup: 'assets/sfx-pickup.mp3',
    hit: 'assets/sfx-hit.mp3',
    boost: 'assets/sfx-boost.mp3',
    powerup: 'assets/sfx-powerup.mp3',
    smash: 'assets/sfx-smash.mp3',
    eruption: 'assets/sfx-eruption.mp3',
    mission: 'assets/sfx-mission.mp3',
    unlock: 'assets/sfx-unlock.mp3',
    click: 'assets/sfx-click.mp3',
    start: 'assets/start.mp3',
    frost: 'assets/voice-frost.mp3',
    volcano: 'assets/voice-volcano.mp3',
    warn: 'assets/warn10.mp3',
    end: 'assets/end.mp3',
    storm: 'assets/storm.mp3',
    record: 'assets/record.mp3',
    newWorld: 'assets/voice-unlock.mp3',
  },
};

export const STORAGE_KEYS = { best: 'kristalljaeger.best', settings: 'kristalljaeger.settings', profile: 'kristalljaeger.profile' };

const params = new URLSearchParams(window.location.search);
export const FORCE_TOUCH = params.has('touch');
export const FORCE_QUALITY = QUALITY[params.get('q')] ? params.get('q') : null;
export const IS_COARSE_POINTER = window.matchMedia('(pointer: coarse)').matches;
