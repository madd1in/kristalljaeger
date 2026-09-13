// Spielbalance, Grafikstufen und Asset-Liste

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

// pixelRatio ist eine Obergrenze; grass/dust sind Anteile der maximalen Deko-Menge
export const QUALITY = {
  high: { label: 'Hoch', pixelRatio: 2, shadows: true, shadowSize: 2048, bloom: true, grass: 1, dust: 1 },
  medium: { label: 'Mittel', pixelRatio: 1.5, shadows: true, shadowSize: 1024, bloom: false, grass: 0.6, dust: 0.5 },
  low: { label: 'Niedrig', pixelRatio: 0.85, shadows: false, shadowSize: 512, bloom: false, grass: 0.3, dust: 0.25 },
};
export const QUALITY_ORDER = ['high', 'medium', 'low'];

export const ASSETS = {
  image: { title: 'assets/title.webp' },
  audio: {
    bgm: 'assets/bgm.mp3',
    pickup: 'assets/sfx-pickup.mp3',
    hit: 'assets/sfx-hit.mp3',
    boost: 'assets/sfx-boost.mp3',
    powerup: 'assets/sfx-powerup.mp3',
    smash: 'assets/sfx-smash.mp3',
    start: 'assets/start.mp3',
    warn: 'assets/warn10.mp3',
    end: 'assets/end.mp3',
    storm: 'assets/storm.mp3',
    record: 'assets/record.mp3',
  },
};

export const STORAGE_KEYS = { best: 'kristalljaeger.best', settings: 'kristalljaeger.settings' };

const params = new URLSearchParams(window.location.search);
export const FORCE_TOUCH = params.has('touch');
export const FORCE_QUALITY = QUALITY[params.get('q')] ? params.get('q') : null;
export const IS_COARSE_POINTER = window.matchMedia('(pointer: coarse)').matches;
