import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as C from './config.js';
import { AudioManager } from './audio.js';
import { Input } from './input.js';
import { createWorld, GlowLayer, Particles, rand } from './world.js';

// ---------------------------------------------------------------------------
// Helfer & Einstellungen
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const fmt = (n) => Math.round(n).toLocaleString('de-DE').replace(/\./g, ' ');
const color = (hex, scale = 1) => new THREE.Color(hex).multiplyScalar(scale);

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Speicher nicht verfügbar */ }
}

const settings = { quality: 'auto', music: true, sfx: true, fps: false, ...readStorage(C.STORAGE_KEYS.settings, {}) };
const saveSettings = () => writeStorage(C.STORAGE_KEYS.settings, settings);
let best = Number(readStorage(C.STORAGE_KEYS.best, 0)) || 0;

// ---------------------------------------------------------------------------
// Renderer, Welt, Kamera
// ---------------------------------------------------------------------------
const touchPreferred = C.FORCE_TOUCH || C.IS_COARSE_POINTER;
const renderer = new THREE.WebGLRenderer({ antialias: !touchPreferred, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('stage').appendChild(renderer.domElement);

const world = createWorld();
const { scene, sun } = world;
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 800);
camera.position.set(0, 18, 36);
const glow = new GlowLayer(scene);
const particles = new Particles(scene);
const audio = new AudioManager();
audio.setMusicOn(settings.music);
audio.setSfxOn(settings.sfx);

let composer = null;
let quality = 'high';

function applyQuality(name) {
  quality = name;
  const q = C.QUALITY[name];
  const pixelRatio = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (renderer.shadowMap.enabled !== q.shadows) {
    renderer.shadowMap.enabled = q.shadows;
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
  }
  if (sun.shadow.mapSize.x !== q.shadowSize) {
    sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
  }
  world.setDetail(q, pixelRatio);
  if (q.bloom && !composer) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.4, 0.55));
    composer.addPass(new OutputPass());
  }
  if (composer) {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  updateSettingsUI();
}

function preferredQuality() {
  if (C.FORCE_QUALITY) return C.FORCE_QUALITY;
  if (settings.quality !== 'auto') return settings.quality;
  return touchPreferred ? 'medium' : 'high';
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = camera.aspect < 1 ? 72 : 60;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
}

// ---------------------------------------------------------------------------
// Spieler-Drohne
// ---------------------------------------------------------------------------
const std = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.4, ...extra });

const player = new THREE.Group();
const tilt = new THREE.Group();
player.add(tilt);
{
  const body = std('#6b6580', { metalness: 0.6, roughness: 0.35 });
  const glowMat = new THREE.MeshStandardMaterial({ color: '#5eead4', emissive: '#5eead4', emissiveIntensity: 2.4, flatShading: true });
  tilt.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), body));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), glowMat);
  eye.position.set(0, 0.05, -0.5);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), body);
  antenna.position.set(0.15, 0.7, 0.1);
  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), glowMat);
  antennaTip.position.set(0.15, 0.97, 0.1);
  tilt.add(eye, antenna, antennaTip);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.45), body);
    wing.position.set(side * 0.85, 0, 0.05);
    wing.rotation.z = side * -0.15;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.13, 0.13), glowMat);
    tip.position.set(side * 1.25, -0.06, 0.2);
    tilt.add(wing, tip);
  }
  tilt.traverse((o) => { if (o.isMesh) o.castShadow = true; });
}
const thruster = new THREE.Mesh(
  new THREE.ConeGeometry(0.2, 1, 8),
  new THREE.MeshBasicMaterial({ color: '#99f6e4', transparent: true, opacity: 0.85, toneMapped: false })
);
thruster.rotation.x = Math.PI / 2;
tilt.add(thruster);
tilt.scale.setScalar(1.35);
scene.add(player);

// ---------------------------------------------------------------------------
// Kristalle, Minen, Power-ups – Geometrien & Materialien
// ---------------------------------------------------------------------------
const crystalGeo = new THREE.OctahedronGeometry(0.62, 0);
crystalGeo.scale(1, 1.7, 1);
const crystalMats = {};
const crystalBurst = {};
const crystalGlow = {};
for (const [key, t] of Object.entries(C.CRYSTAL_TYPES)) {
  crystalMats[key] = std(t.color, { emissive: t.emissive, emissiveIntensity: 1.6, roughness: 0.25 });
  crystalBurst[key] = color(t.burst);
  crystalGlow[key] = color(t.color, 0.7);
}

const UP = new THREE.Vector3(0, 1, 0);
const SPIKE_DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());

// Kern + 14 Stacheln zu einer Geometrie verschmolzen: 1 Draw Call statt 15 pro Mine
const mineGeo = (() => {
  const parts = [new THREE.IcosahedronGeometry(0.6, 0)];
  const q = new THREE.Quaternion();
  for (const dir of SPIKE_DIRS) {
    const spike = new THREE.ConeGeometry(0.13, 0.55, 5).toNonIndexed();
    spike.applyQuaternion(q.setFromUnitVectors(UP, dir));
    spike.translate(dir.x * 0.62, dir.y * 0.62, dir.z * 0.62);
    parts.push(spike);
  }
  return mergeGeometries(parts);
})();
const eyeGeo = mergeGeometries([
  new THREE.SphereGeometry(0.1, 8, 6).translate(-0.18, 0.12, -0.55),
  new THREE.SphereGeometry(0.1, 8, 6).translate(0.18, 0.12, -0.55),
]);
const mineMats = {
  normal: { body: std('#4a0f14', { metalness: 0.5, roughness: 0.5 }), eye: new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 2 }) },
  hunter: { body: std('#2e1065', { metalness: 0.5, roughness: 0.45 }), eye: new THREE.MeshStandardMaterial({ color: '#c084fc', emissive: '#c084fc', emissiveIntensity: 2.5 }) },
};
const mineGlow = { normal: color('#ef4444', 0.55), hunter: color('#a855f7', 0.7) };

const powerGeo = {
  magnet: mergeGeometries([
    new THREE.TorusGeometry(0.4, 0.14, 8, 18, Math.PI).rotateZ(Math.PI),
    new THREE.BoxGeometry(0.3, 0.24, 0.3).translate(-0.4, 0.1, 0),
    new THREE.BoxGeometry(0.3, 0.24, 0.3).translate(0.4, 0.1, 0),
  ]),
  double: mergeGeometries([
    new THREE.OctahedronGeometry(0.34, 0).translate(-0.24, 0, 0),
    new THREE.OctahedronGeometry(0.34, 0).translate(0.24, 0, 0),
  ]),
  time: mergeGeometries([
    new THREE.TorusGeometry(0.42, 0.09, 8, 24),
    new THREE.BoxGeometry(0.06, 0.3, 0.06).translate(0, 0.13, 0),
    new THREE.BoxGeometry(0.22, 0.06, 0.06).translate(0.1, 0, 0),
  ]),
  shield: new THREE.CylinderGeometry(0.5, 0.5, 0.18, 6).rotateX(Math.PI / 2),
};
const cageGeo = new THREE.IcosahedronGeometry(0.9, 0);
const powerMats = {};
const powerGlow = {};
for (const [key, p] of Object.entries(C.POWERUPS)) {
  powerMats[key] = {
    core: std(p.color, { emissive: p.color, emissiveIntensity: 1.1 }),
    cage: new THREE.MeshBasicMaterial({ color: p.color, wireframe: true, transparent: true, opacity: 0.55, toneMapped: false }),
  };
  powerGlow[key] = color(p.color, 0.8);
}

const COLORS = {
  hit: color('#fb7185'),
  smash: color('#f97316'),
  smashDark: color('#fecaca'),
  boost: color('#5eead4'),
  trail: color('#99f6e4', 0.8),
  playerGlow: color('#5eead4', 0.55),
  magnetGlow: color('#f87171', 0.7),
  doubleGlow: color('#a78bfa', 0.7),
};

// ---------------------------------------------------------------------------
// Spielzustand
// ---------------------------------------------------------------------------
let state = 'loading'; // loading | menu | playing | paused | over
let settingsReturn = 'start';
let touchUI = false;
const game = {};
const crystals = [];
const mines = [];
let powerup = null;
const vel = new THREE.Vector3();
const moveDir = new THREE.Vector3();
const _v = new THREE.Vector3();
const _proj = new THREE.Vector3();
let yaw = 0;
let shake = 0;
let trailTimer = 0;

const input = new Input({ onKey });

function resetGame() {
  Object.assign(game, {
    score: 0, timeLeft: C.GAME_TIME, shield: C.MAX_SHIELD, combo: 0, comboTimer: 0, bestCombo: 0,
    collected: 0, minesSmashed: 0, powerupsTaken: 0, invuln: 0, elapsed: 0, warned: false,
    boostCd: 0, boostT: 0, mineTimer: 0, stormStarted: false, stormT: 0, stormSpawn: 0,
    powerupTimer: 7, buffs: { magnet: 0, double: 0 }, respawns: [],
  });
}

function freeSpot(minPlayerDist) {
  for (let tries = 0; tries < 40; tries++) {
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(Math.random()) * (C.ARENA - 1.5);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.hypot(x - player.position.x, z - player.position.z) < minPlayerDist) continue;
    if (mines.some((m) => Math.hypot(x - m.position.x, z - m.position.z) < 2.5)) continue;
    if (crystals.some((c) => Math.hypot(x - c.position.x, z - c.position.z) < 1.6)) continue;
    return { x, z };
  }
  return { x: rand(-C.ARENA, C.ARENA) * 0.6, z: rand(-C.ARENA, C.ARENA) * 0.6 };
}

function spawnCrystal(kind = null, falling = false) {
  if (crystals.length >= C.MAX_CRYSTALS) return;
  const type = kind || (Math.random() < 0.18 ? 'rare' : 'normal');
  const m = new THREE.Mesh(crystalGeo, crystalMats[type]);
  const { x, z } = freeSpot(3);
  m.position.set(x, falling ? rand(12, 18) : C.HOVER_Y, z);
  m.castShadow = true;
  m.scale.setScalar(falling ? 1 : 0.001);
  m.userData = { type, phase: rand(0, Math.PI * 2), age: falling ? 1 : 0, falling, vy: 0 };
  scene.add(m);
  crystals.push(m);
}

function removeCrystal(index) {
  scene.remove(crystals[index]);
  crystals.splice(index, 1);
}

function spawnMine(hunter = false) {
  const kind = hunter ? 'hunter' : 'normal';
  const g = new THREE.Group();
  const body = new THREE.Mesh(mineGeo, mineMats[kind].body);
  body.castShadow = true;
  g.add(body, new THREE.Mesh(eyeGeo, mineMats[kind].eye));
  const { x, z } = freeSpot(hunter ? 12 : 9);
  g.position.set(x, C.HOVER_Y, z);
  g.scale.setScalar(0.001);
  g.userData = { hunter, target: new THREE.Vector3(x, C.HOVER_Y, z), age: 0, spin: rand(0.6, 1.4), vx: 0, vz: 0 };
  scene.add(g);
  mines.push(g);
}

function pickPowerupType() {
  const entries = Object.entries(C.POWERUPS).filter(([key]) => !(key === 'shield' && game.shield >= C.MAX_SHIELD));
  let r = Math.random() * entries.reduce((sum, [, p]) => sum + p.weight, 0);
  for (const [key, p] of entries) {
    r -= p.weight;
    if (r <= 0) return key;
  }
  return entries[0][0];
}

function makePowerup(type) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(powerGeo[type], powerMats[type].core);
  core.castShadow = true;
  const cage = new THREE.Mesh(cageGeo, powerMats[type].cage);
  g.add(core, cage);
  g.userData = { type, age: 0, core, cage };
  return g;
}

function spawnPowerup(type = pickPowerupType()) {
  removePowerup();
  powerup = makePowerup(type);
  const { x, z } = freeSpot(5);
  powerup.position.set(x, C.HOVER_Y + 0.3, z);
  scene.add(powerup);
}

function removePowerup() {
  if (!powerup) return;
  scene.remove(powerup);
  powerup = null;
}

function resetWorld() {
  for (const c of crystals) scene.remove(c);
  for (const m of mines) scene.remove(m);
  crystals.length = 0;
  mines.length = 0;
  removePowerup();
  player.position.set(0, C.HOVER_Y, 0);
  player.visible = true;
  vel.set(0, 0, 0);
  yaw = 0;
  for (let i = 0; i < C.CRYSTAL_COUNT; i++) spawnCrystal();
  for (let i = 0; i < C.START_MINES; i++) spawnMine();
}

// ---------------------------------------------------------------------------
// Screens & HUD
// ---------------------------------------------------------------------------
const SCREENS = ['loading', 'start', 'pause', 'over', 'settings'];
let opaqueScreen = true; // Lade- und Startbildschirm verdecken die 3D-Szene komplett → nicht rendern

function showScreen(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  $('touch').hidden = !(touchUI && state === 'playing');
  opaqueScreen = id === 'loading' || id === 'start';
}

const domCache = new Map();
function setText(id, value) {
  if (domCache.get(id) === value) return;
  domCache.set(id, value);
  $(id).textContent = value;
}
function setFlag(id, cls, on) {
  const key = `${id}.${cls}`;
  if (domCache.get(key) === on) return;
  domCache.set(key, on);
  $(id).classList.toggle(cls, on);
}
function setStyle(id, prop, value) {
  const key = `${id}:${prop}`;
  if (domCache.get(key) === value) return;
  domCache.set(key, value);
  $(id).style.setProperty(prop, value);
}

function updateHud() {
  setText('score', fmt(game.score));
  const s = Math.ceil(game.timeLeft);
  setText('time', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
  setFlag('timerPanel', 'urgent', game.timeLeft <= 10);
  for (let i = 0; i < C.MAX_SHIELD; i++) setFlag(`pip${i}`, 'off', i >= game.shield);

  const boostReady = 1 - game.boostCd / C.BOOST_COOLDOWN;
  setStyle('boostFill', 'width', `${Math.round(boostReady * 100)}%`);
  if (touchUI) {
    setStyle('btnBoost', '--cd', boostReady.toFixed(2));
    setFlag('btnBoost', 'ready', boostReady >= 1);
  }

  setFlag('combo', 'show', game.combo > 1);
  if (game.combo > 1) {
    setText('comboText', `KOMBO x${game.combo}`);
    setStyle('comboFill', 'width', `${Math.round((game.comboTimer / C.COMBO_WINDOW) * 100)}%`);
  }

  for (const key of ['magnet', 'double']) {
    const left = game.buffs[key];
    setFlag(`buff-${key}`, 'show', left > 0);
    if (left > 0) setStyle(`buffFill-${key}`, 'width', `${Math.round((left / C.POWERUPS[key].duration) * 100)}%`);
  }
}

function restartAnimation(el, className) {
  el.className = '';
  void el.offsetWidth;
  el.className = className;
}

function toast(text, kind = '') {
  const el = $('toast');
  el.textContent = text;
  restartAnimation(el, `show ${kind}`.trim());
}

function announce(text, kind = '') {
  const el = $('announce');
  el.textContent = text;
  restartAnimation(el, `show ${kind}`.trim());
}

const popupEls = [...document.querySelectorAll('#popups span')];
let popupIndex = 0;
function popup(worldPos, text, kind = '') {
  _proj.copy(worldPos).project(camera);
  if (_proj.z > 1) return;
  const el = popupEls[popupIndex];
  popupIndex = (popupIndex + 1) % popupEls.length;
  el.textContent = text;
  el.style.left = `${(_proj.x * 0.5 + 0.5) * window.innerWidth}px`;
  el.style.top = `${(-_proj.y * 0.5 + 0.5) * window.innerHeight}px`;
  restartAnimation(el, `show ${kind}`.trim());
}

function flash() {
  const el = $('flash');
  el.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('on')));
}

function vibrate(ms) {
  if (touchUI && navigator.vibrate) navigator.vibrate(ms);
}

function updateSettingsUI() {
  for (const btn of document.querySelectorAll('#qualitySeg button')) {
    const q = btn.dataset.quality;
    btn.setAttribute('aria-pressed', String(settings.quality === q));
    if (q === 'auto') btn.textContent = settings.quality === 'auto' ? `Auto (${C.QUALITY[quality].label})` : 'Auto';
  }
  $('tglMusic').setAttribute('aria-pressed', String(settings.music));
  $('tglSfx').setAttribute('aria-pressed', String(settings.sfx));
  $('tglFps').setAttribute('aria-pressed', String(settings.fps));
  $('fps').hidden = !settings.fps;
  $('qualityNote').textContent = settings.quality === 'auto'
    ? 'Auto senkt die Grafik von selbst, wenn das Spiel ruckelt.'
    : 'Tipp: Bei Rucklern "Mittel" oder "Niedrig" wählen.';
}

// ---------------------------------------------------------------------------
// Spielablauf
// ---------------------------------------------------------------------------
function startGame() {
  audio.unlock();
  audio.startMusic();
  audio.setPaused(false);
  input.consumeBoost();
  resetGame();
  resetWorld();
  state = 'playing';
  domCache.clear();
  showScreen(null);
  $('hud').hidden = false;
  updateHud();
  audio.voice('start');
}

function endGame(reason) {
  state = 'over';
  player.visible = true;
  const isBest = game.score > best && game.score > 0;
  if (isBest) {
    best = game.score;
    writeStorage(C.STORAGE_KEYS.best, best);
  }
  const rank = C.RANKS.find((r) => game.score >= r.min);
  $('overTitle').textContent = reason === 'time' ? 'ZEIT ABGELAUFEN!' : 'SCHILD ZERSTÖRT!';
  $('overScore').textContent = `${fmt(game.score)} Punkte`;
  $('overRank').textContent = rank.rank;
  $('overRank').dataset.rank = rank.rank;
  $('overRankText').textContent = rank.text;
  $('stCrystals').textContent = String(game.collected);
  $('stCombo').textContent = `x${Math.max(1, game.bestCombo)}`;
  $('stMines').textContent = String(game.minesSmashed);
  $('stPower').textContent = String(game.powerupsTaken);
  $('overBest').hidden = !isBest;
  showScreen('over');
  if (isBest) audio.voice('record');
  else if (reason === 'time') audio.voice('end');
  $('btnAgain').focus({ preventScroll: true });
}

function toMenu() {
  state = 'menu';
  $('hud').hidden = true;
  resetGame();
  resetWorld();
  audio.setPaused(false);
  $('bestStart').hidden = best <= 0;
  $('bestStart').textContent = `Bestwert: ${fmt(best)}`;
  showScreen('start');
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    input.resetJoystick?.();
    audio.setPaused(true);
    showScreen('pause');
  } else if (state === 'paused') {
    state = 'playing';
    audio.setPaused(false);
    showScreen(null);
  }
}

function openSettings() {
  settingsReturn = state === 'paused' ? 'pause' : 'start';
  updateSettingsUI();
  showScreen('settings');
}

function closeSettings() {
  showScreen(settingsReturn);
}

function addCombo() {
  game.combo = game.comboTimer > 0 ? Math.min(game.combo + 1, 5) : 1;
  game.comboTimer = C.COMBO_WINDOW;
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  return game.combo * (game.buffs.double > 0 ? 2 : 1);
}

function collect(crystal, index) {
  const { type } = crystal.userData;
  const pts = C.CRYSTAL_TYPES[type].points * addCombo();
  game.score += pts;
  game.collected++;
  particles.burst(crystal.position, crystalBurst[type], type === 'normal' ? 14 : 22);
  audio.play('pickup', { volume: 0.8, rate: 1 + (game.combo - 1) * 0.07 });
  popup(crystal.position, `+${pts}`, type);
  if (game.combo >= 3) toast(`KOMBO x${game.combo}!`, type === 'normal' ? '' : type);
  removeCrystal(index);
  if (crystals.length < C.CRYSTAL_COUNT) spawnCrystal();
}

function smashMine(mine, index) {
  const { hunter } = mine.userData;
  const pts = (hunter ? 60 : 25) * addCombo();
  game.score += pts;
  game.minesSmashed++;
  particles.burst(mine.position, COLORS.smash, 26, 9);
  particles.burst(mine.position, COLORS.smashDark, 12, 5);
  audio.play('smash');
  shake = Math.max(shake, 0.35);
  vibrate(40);
  popup(mine.position, `+${pts}`, 'smash');
  toast(hunter ? 'JÄGER ZERSTÖRT!' : 'MINE GERAMMT!', 'smash');
  game.respawns.push({ t: hunter ? 8 : 3, hunter });
  scene.remove(mine);
  mines.splice(index, 1);
}

function takePowerup() {
  const { type } = powerup.userData;
  const p = C.POWERUPS[type];
  if (type === 'time') {
    game.timeLeft = Math.min(game.timeLeft + 5, 99);
    if (game.timeLeft > 10) game.warned = false;
  } else if (type === 'shield') {
    if (game.shield < C.MAX_SHIELD) game.shield++;
    else game.score += 50;
  } else {
    game.buffs[type] = p.duration;
  }
  game.powerupsTaken++;
  particles.burst(powerup.position, powerGlow[type], 26, 7);
  audio.play('powerup');
  announce(p.label, type);
  vibrate(30);
  removePowerup();
}

function hit(mine) {
  game.shield--;
  game.invuln = 1.6;
  game.combo = 0;
  game.comboTimer = 0;
  _v.subVectors(player.position, mine.position).setY(0).normalize();
  vel.addScaledVector(_v, 16);
  shake = 0.7;
  flash();
  audio.play('hit');
  vibrate(120);
  particles.burst(player.position, COLORS.hit, 20, 7);
  if (game.shield <= 0) {
    updateHud();
    endGame('shield');
    return;
  }
  toast('SCHILD −1', 'hit');
}

function updatePlayer(dt, t) {
  input.move(moveDir);
  game.boostCd = Math.max(0, game.boostCd - dt);
  game.boostT = Math.max(0, game.boostT - dt);

  if (input.consumeBoost() && game.boostCd === 0) {
    game.boostT = C.BOOST_TIME;
    game.boostCd = C.BOOST_COOLDOWN;
    if (moveDir.lengthSq() > 0.01) _v.copy(moveDir).normalize();
    else if (Math.hypot(vel.x, vel.z) > 0.5) _v.set(vel.x, 0, vel.z).normalize();
    else _v.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    vel.addScaledVector(_v, 9);
    audio.play('boost', { volume: 0.7 });
    particles.burst(player.position, COLORS.boost, 10, 4);
  }

  const boosting = game.boostT > 0;
  vel.addScaledVector(moveDir, (boosting ? 70 : 30) * dt);
  vel.multiplyScalar(Math.exp(-3.2 * dt));
  const maxSpeed = boosting ? 20 : 9.5;
  if (vel.length() > maxSpeed) vel.setLength(maxSpeed);

  player.position.addScaledVector(vel, dt);
  const r = Math.hypot(player.position.x, player.position.z);
  if (r > C.ARENA) {
    const nx = player.position.x / r;
    const nz = player.position.z / r;
    player.position.x = nx * C.ARENA;
    player.position.z = nz * C.ARENA;
    const out = vel.x * nx + vel.z * nz;
    if (out > 0) {
      vel.x -= out * nx;
      vel.z -= out * nz;
    }
  }
  player.position.y = C.HOVER_Y + Math.sin(t * 3) * 0.12;

  const speed = Math.hypot(vel.x, vel.z);
  let turn = 0;
  if (speed > 0.6) {
    turn = wrapAngle(Math.atan2(-vel.x, -vel.z) - yaw);
    yaw += turn * Math.min(1, 10 * dt);
  }
  player.rotation.y = yaw;
  tilt.rotation.z = THREE.MathUtils.lerp(tilt.rotation.z, clamp(turn * 0.6, -0.5, 0.5), 1 - Math.exp(-8 * dt));
  tilt.rotation.x = THREE.MathUtils.lerp(tilt.rotation.x, -(speed / 20) * 0.4, 1 - Math.exp(-8 * dt));
  thruster.scale.set(1, 0.4 + speed / 9 + (boosting ? 1.2 : 0), 1);
  thruster.position.z = 0.6 + thruster.scale.y * 0.5;

  trailTimer -= dt;
  if (trailTimer <= 0 && speed > 1.5) {
    trailTimer = boosting ? 0.015 : 0.045;
    const back = 1.1;
    particles.emit(
      player.position.x + Math.sin(yaw) * back, player.position.y - 0.05, player.position.z + Math.cos(yaw) * back,
      rand(-0.3, 0.3), rand(-0.1, 0.4), rand(-0.3, 0.3),
      boosting ? 0.45 : 0.3, boosting ? 0.9 : 0.5, boosting ? COLORS.boost : COLORS.trail, 0
    );
  }

  game.invuln = Math.max(0, game.invuln - dt);
  player.visible = game.invuln > 0 ? Math.floor(t * 16) % 2 === 0 : true;
}

function updateCrystals(dt, t) {
  for (const c of crystals) {
    const u = c.userData;
    if (u.falling) {
      u.vy -= 30 * dt;
      c.position.y += u.vy * dt;
      c.rotation.y += dt * 6;
      if (c.position.y <= C.HOVER_Y + 0.25) {
        c.position.y = C.HOVER_Y + 0.25;
        u.falling = false;
        particles.burst(c.position, crystalBurst[u.type], 8, 3);
      }
      continue;
    }
    u.age += dt;
    c.scale.setScalar(Math.min(1, u.age * 3) * (1 + Math.sin(t * 4 + u.phase) * 0.06));
    c.rotation.y += dt * 1.8;
    c.position.y = C.HOVER_Y + 0.25 + Math.sin(t * 2 + u.phase) * 0.2;
  }
}

function updateMines(dt, t, moving) {
  mineMats.normal.eye.emissiveIntensity = 1.6 + Math.sin(t * 6);
  mineMats.hunter.eye.emissiveIntensity = 2.2 + Math.sin(t * 9) * 1.2;
  const wanderSpeed = 2 + (game.elapsed / C.GAME_TIME) * 2.5;
  for (const m of mines) {
    const d = m.userData;
    d.age += dt;
    const grow = Math.min(1, d.age * 2);
    m.scale.setScalar(d.hunter ? grow * (1.2 + Math.sin(t * 8) * 0.05) : grow);
    m.rotation.y += dt * d.spin * (d.hunter ? 2 : 1);
    m.rotation.x += dt * d.spin * 0.5;
    m.position.y = C.HOVER_Y + Math.sin(t * 2.5 + d.spin * 10) * 0.15;
    if (!moving) continue;

    if (d.hunter) {
      _v.set(player.position.x - m.position.x, 0, player.position.z - m.position.z);
      const len = _v.length();
      if (len > 0.01) {
        const hunterSpeed = 3.1 + (game.elapsed / C.GAME_TIME) * 1.2;
        const steer = Math.min(1, 1.6 * dt);
        d.vx += ((_v.x / len) * hunterSpeed - d.vx) * steer;
        d.vz += ((_v.z / len) * hunterSpeed - d.vz) * steer;
      }
      m.position.x += d.vx * dt;
      m.position.z += d.vz * dt;
      continue;
    }

    _v.subVectors(d.target, m.position).setY(0);
    if (_v.length() < 0.8) {
      if (Math.random() < 0.35) {
        d.target.set(player.position.x + rand(-4, 4), C.HOVER_Y, player.position.z + rand(-4, 4));
      } else {
        const { x, z } = freeSpot(0);
        d.target.set(x, C.HOVER_Y, z);
      }
      const tr = Math.hypot(d.target.x, d.target.z);
      if (tr > C.ARENA - 1) d.target.multiplyScalar((C.ARENA - 1) / tr);
    } else {
      m.position.addScaledVector(_v.normalize(), wanderSpeed * dt);
    }
  }
}

function updatePowerupVisual(dt, t) {
  if (!powerup) return;
  const u = powerup.userData;
  u.core.rotation.y += dt * 2.2;
  u.cage.rotation.x += dt * 0.8;
  u.cage.rotation.y -= dt * 1.1;
  powerup.position.y = C.HOVER_Y + 0.35 + Math.sin(t * 3) * 0.2;
  powerup.scale.setScalar(Math.min(1, u.age * 4 + 0.001));
  powerup.visible = u.age < C.POWERUP_LIFETIME - 2 || Math.floor(t * 10) % 2 === 0;
}

function updateGame(dt, t) {
  game.elapsed += dt;
  game.timeLeft -= dt;
  if (!game.warned && game.timeLeft <= 10) {
    game.warned = true;
    audio.voice('warn');
  }
  if (game.timeLeft <= 0) {
    game.timeLeft = 0;
    updateHud();
    endGame('time');
    return;
  }

  game.buffs.magnet = Math.max(0, game.buffs.magnet - dt);
  game.buffs.double = Math.max(0, game.buffs.double - dt);

  updatePlayer(dt, t);

  game.comboTimer = Math.max(0, game.comboTimer - dt);
  if (game.comboTimer === 0) game.combo = 0;

  // Kristallsturm zur Halbzeit
  if (!game.stormStarted && game.timeLeft <= C.STORM_AT) {
    game.stormStarted = true;
    game.stormT = C.STORM_DURATION;
    audio.voice('storm');
    announce('KRISTALLSTURM!', 'storm');
  }
  if (game.stormT > 0) {
    game.stormT -= dt;
    game.stormSpawn -= dt;
    if (game.stormSpawn <= 0) {
      game.stormSpawn = 0.3;
      const roll = Math.random();
      spawnCrystal(roll < 0.3 ? 'gold' : roll < 0.5 ? 'rare' : 'normal', true);
    }
  }

  updateCrystals(dt, t);
  const magnet = game.buffs.magnet > 0;
  for (let i = crystals.length - 1; i >= 0; i--) {
    const c = crystals[i];
    if (c.userData.falling || c.userData.age < 0.2) continue;
    const dx = player.position.x - c.position.x;
    const dz = player.position.z - c.position.z;
    const d = Math.hypot(dx, dz);
    if (magnet && d < 8 && d > 0.01) {
      const pull = Math.min(d, (6 + (8 - d) * 2) * dt);
      c.position.x += (dx / d) * pull;
      c.position.z += (dz / d) * pull;
    }
    if (d < 1.3) collect(c, i);
  }

  if (powerup) {
    powerup.userData.age += dt;
    if (powerup.userData.age > C.POWERUP_LIFETIME) {
      removePowerup();
    } else if (Math.hypot(powerup.position.x - player.position.x, powerup.position.z - player.position.z) < 1.5) {
      takePowerup();
    }
  } else {
    game.powerupTimer -= dt;
    if (game.powerupTimer <= 0) {
      game.powerupTimer = rand(...C.POWERUP_EVERY);
      spawnPowerup();
    }
  }

  // Minen: Nachschub, Jäger, Respawns
  game.mineTimer += dt;
  const normalMines = mines.filter((m) => !m.userData.hunter).length + game.respawns.filter((r) => !r.hunter).length;
  if (game.mineTimer >= 10 && normalMines < C.MAX_MINES) {
    game.mineTimer = 0;
    spawnMine();
  }
  if (game.elapsed >= C.HUNTER_AFTER && !mines.some((m) => m.userData.hunter) && !game.respawns.some((r) => r.hunter)) {
    spawnMine(true);
    toast('JÄGER-MINE!', 'hunter');
  }
  for (let i = game.respawns.length - 1; i >= 0; i--) {
    game.respawns[i].t -= dt;
    if (game.respawns[i].t <= 0) {
      spawnMine(game.respawns[i].hunter);
      game.respawns.splice(i, 1);
    }
  }
  updateMines(dt, t, true);

  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    if (m.userData.age < 1) continue;
    const reach = m.userData.hunter ? 1.55 : 1.35;
    if (Math.hypot(m.position.x - player.position.x, m.position.z - player.position.z) >= reach) continue;
    if (game.boostT > 0) {
      smashMine(m, i);
    } else if (game.invuln === 0) {
      hit(m);
      if (state !== 'playing') return;
      break;
    }
  }

  updateHud();
}

function updateGlows() {
  glow.begin();
  for (const c of crystals) glow.add(c.position.x, c.position.z, c.userData.falling ? 1.2 : 2.3, crystalGlow[c.userData.type]);
  for (const m of mines) glow.add(m.position.x, m.position.z, m.userData.hunter ? 3.2 : 2.4, mineGlow[m.userData.hunter ? 'hunter' : 'normal']);
  if (powerup) glow.add(powerup.position.x, powerup.position.z, 3.2, powerGlow[powerup.userData.type]);
  let playerColor = COLORS.playerGlow;
  if (game.buffs?.magnet > 0) playerColor = COLORS.magnetGlow;
  else if (game.buffs?.double > 0) playerColor = COLORS.doubleGlow;
  glow.add(player.position.x, player.position.z, game.boostT > 0 ? 3.4 : 2.6, playerColor);
  glow.end();
}

// ---------------------------------------------------------------------------
// Kamera, Performance, Hauptschleife
// ---------------------------------------------------------------------------
const camGoal = new THREE.Vector3();
const lookGoal = new THREE.Vector3();
const look = new THREE.Vector3();

function updateCamera(dt, t) {
  if (state === 'menu' || state === 'loading') {
    const a = t * 0.1;
    const dist = camera.aspect < 1 ? 48 : 36;
    camGoal.set(Math.sin(a) * dist, camera.aspect < 1 ? 26 : 18, Math.cos(a) * dist);
    lookGoal.set(0, -1, 0);
    camera.position.lerp(camGoal, 1 - Math.exp(-2 * dt));
  } else {
    const portrait = camera.aspect < 1;
    camGoal.set(player.position.x * 0.8, portrait ? 25 : 16, player.position.z * 0.8 + (portrait ? 14 : 16));
    lookGoal.set(player.position.x, 0, player.position.z - (portrait ? 1 : 2));
    camera.position.lerp(camGoal, 1 - Math.exp(-4 * dt));
  }
  look.lerp(lookGoal, 1 - Math.exp(-6 * dt));
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 1.8);
  }
  camera.lookAt(look);
}

const perf = { frames: 0, time: 0, fps: 60, slow: 0 };
function trackPerformance(rawDt) {
  if (rawDt > 0.25) return; // Tab war im Hintergrund
  perf.frames++;
  perf.time += rawDt;
  if (perf.time < 0.5) return;
  perf.fps = perf.frames / perf.time;
  perf.frames = 0;
  perf.time = 0;
  if (settings.fps) setText('fps', `${Math.round(perf.fps)} FPS · ${C.QUALITY[quality].label}`);
  if (settings.quality !== 'auto' || C.FORCE_QUALITY || state !== 'playing') return;
  perf.slow = perf.fps < 48 ? perf.slow + 0.5 : Math.max(0, perf.slow - 0.5);
  const next = C.QUALITY_ORDER[C.QUALITY_ORDER.indexOf(quality) + 1];
  if (perf.slow >= 2 && next) {
    perf.slow = 0;
    applyQuality(next);
  }
}

let last = performance.now();
let time = 0;
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(rawDt, 0.05);
  trackPerformance(rawDt);

  if (state !== 'paused') {
    time += dt;
    if (state === 'playing') {
      updateGame(dt, time);
    } else {
      updateCrystals(dt, time);
      updateMines(dt, time, false);
      if (state === 'menu' || state === 'loading') {
        player.position.y = C.HOVER_Y + Math.sin(time * 3) * 0.12;
        player.rotation.y += dt * 0.6;
      }
    }
    if (powerup && state !== 'playing') powerup.userData.age = Math.min(powerup.userData.age, 1);
    updatePowerupVisual(dt, time);
    particles.update(dt, time);
    updateGlows();
    updateCamera(dt, time);
  }
  if (opaqueScreen) return;
  world.update(state === 'paused' ? 0 : dt, time, camera);

  if (C.QUALITY[quality].bloom && composer) composer.render();
  else renderer.render(scene, camera);
});

// ---------------------------------------------------------------------------
// Laden mit Fortschrittsbalken
// ---------------------------------------------------------------------------
function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });
}

async function loadAll() {
  const audioEntries = Object.entries(C.ASSETS.audio);
  const total = audioEntries.length + 2; // + Titelbild + Shader
  let done = 0;
  const progress = (label) => {
    done++;
    const pct = Math.round((done / total) * 100);
    $('loadFill').style.width = `${pct}%`;
    $('loadPct').textContent = `${pct} %`;
    if (label) $('loadLabel').textContent = label;
  };

  $('loadLabel').textContent = 'Lade Musik & Sounds …';
  await Promise.all([
    loadImage(C.ASSETS.image.title).then(() => progress()),
    ...audioEntries.map(([name, url]) => audio.load(name, url).then(() => progress(name === 'bgm' ? 'Musik geladen …' : null))),
  ]);

  // Shader vorkompilieren, damit das erste Power-up nicht ruckelt
  $('loadLabel').textContent = 'Bereite 3D-Grafik vor …';
  const previews = Object.keys(C.POWERUPS).map((type) => {
    const p = makePowerup(type);
    p.position.set(0, -60, 0);
    scene.add(p);
    return p;
  });
  await new Promise((r) => requestAnimationFrame(r));
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    renderer.compile(scene, camera);
  }
  previews.forEach((p) => scene.remove(p));
  progress('Bereit!');
}

// ---------------------------------------------------------------------------
// Eingabe & UI-Verdrahtung
// ---------------------------------------------------------------------------
function onKey(e) {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && state === 'playing') e.preventDefault();
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!$('settings').hidden) closeSettings();
    else togglePause();
  }
  if (e.code === 'KeyM') {
    audio.setMuted(!audio.muted);
    toast(audio.muted ? 'TON AUS' : 'TON AN');
  }
  if (e.code === 'KeyF') {
    settings.fps = !settings.fps;
    saveSettings();
    updateSettingsUI();
  }
}

function enableTouchUI() {
  if (touchUI) return;
  touchUI = true;
  document.body.classList.add('touch');
  $('touch').hidden = state !== 'playing';
}

input.bindTouch({ zone: $('joyZone'), base: $('joyBase'), knob: $('joyKnob'), boost: $('btnBoost') });
if (touchPreferred) enableTouchUI();
window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') enableTouchUI(); }, { capture: true });

$('btnStart').addEventListener('click', startGame);
$('btnAgain').addEventListener('click', startGame);
$('btnRestart').addEventListener('click', startGame);
$('btnMenu').addEventListener('click', toMenu);
$('btnMenuPause').addEventListener('click', toMenu);
$('btnResume').addEventListener('click', togglePause);
$('btnPauseHud').addEventListener('click', togglePause);
$('btnSettingsStart').addEventListener('click', openSettings);
$('btnSettingsPause').addEventListener('click', openSettings);
$('btnSettingsBack').addEventListener('click', closeSettings);

for (const btn of document.querySelectorAll('#qualitySeg button')) {
  btn.addEventListener('click', () => {
    settings.quality = btn.dataset.quality;
    saveSettings();
    perf.slow = 0;
    applyQuality(preferredQuality());
  });
}
$('tglMusic').addEventListener('click', () => {
  settings.music = !settings.music;
  audio.setMusicOn(settings.music);
  saveSettings();
  updateSettingsUI();
});
$('tglSfx').addEventListener('click', () => {
  settings.sfx = !settings.sfx;
  audio.setSfxOn(settings.sfx);
  saveSettings();
  updateSettingsUI();
});
$('tglFps').addEventListener('click', () => {
  settings.fps = !settings.fps;
  saveSettings();
  updateSettingsUI();
});

window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause();
});

// Test-Hooks (Playwright)
function moveToNearest(list) {
  let target = null;
  let bestDist = Infinity;
  for (const o of list) {
    const d = o.position.distanceTo(player.position);
    if (d < bestDist) {
      bestDist = d;
      target = o;
    }
  }
  if (target) player.position.set(target.position.x, player.position.y, target.position.z);
}

window.__kj = {
  snapshot: () => ({
    state, quality, fps: Math.round(perf.fps), score: game.score, timeLeft: Number(game.timeLeft.toFixed(2)),
    shield: game.shield, combo: game.combo, collected: game.collected, smashed: game.minesSmashed,
    crystals: crystals.length, mines: mines.length, hunter: mines.some((m) => m.userData.hunter),
    powerup: powerup?.userData.type ?? null, buffs: { ...game.buffs }, touchUI,
    player: { x: Number(player.position.x.toFixed(2)), z: Number(player.position.z.toFixed(2)) },
    drawCalls: renderer.info.render.calls,
  }),
  debugMoveToNearestCrystal: () => moveToNearest(crystals),
  debugMoveToNearestMine: () => moveToNearest(mines),
  debugMoveToPowerup: () => powerup && player.position.set(powerup.position.x, player.position.y, powerup.position.z),
  debugSpawnPowerup: (type) => spawnPowerup(type),
  debugSetTime: (s) => { game.timeLeft = s; },
  debugSetElapsed: (s) => { game.elapsed = s; },
  debugBoost: () => { input.boostQueued = true; },
};

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
resetGame();
resetWorld();
resize();
applyQuality(preferredQuality());
showScreen('loading');

loadAll().then(() => {
  state = 'menu';
  $('btnStart').disabled = false;
  toMenu();
});
