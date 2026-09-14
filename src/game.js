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
import { loadModels } from './models.js';
import {
  dailyBiome, hashString, isBiomeUnlocked, isSkinUnlocked, loadProfile, mulberry32, pickMissions,
  readStorage, saveProfile, todayKey, writeStorage,
} from './progress.js';

// ---------------------------------------------------------------------------
// Helfer, Einstellungen, Profil
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const fmt = (n) => Math.round(n).toLocaleString('de-DE').replace(/\./g, ' ');
const clock = (seconds, roundUp) => {
  const s = roundUp ? Math.ceil(seconds) : Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const color = (hex, scale = 1) => new THREE.Color(hex).multiplyScalar(scale);
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

const settings = { quality: 'auto', music: true, sfx: true, fps: false, shake: true, vibration: true, ...readStorage(C.STORAGE_KEYS.settings, {}) };
const saveSettings = () => writeStorage(C.STORAGE_KEYS.settings, settings);
const profile = loadProfile();

// Spiel-Zufall: normal Math.random, in der Tages-Challenge ein Seed-Generator
let rng = Math.random;
const rr = (a, b) => a + rng() * (b - a);

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
let engine = null;

let composer = null;
let bloomPass = null;
let quality = 'high';

// Welt wechseln inkl. Belichtung/Bloom-Schwelle (Schnee würde sonst überstrahlen)
function switchWorld(key) {
  const b = C.BIOMES[key];
  world.setBiome(key);
  renderer.toneMappingExposure = b.exposure;
  if (bloomPass) bloomPass.threshold = b.bloomThreshold;
  audio.setMusic(b.music);
}

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
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.4, C.BIOMES[world.biome?.key ?? 'meadow'].bloomThreshold);
    composer.addPass(bloomPass);
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
// Spieler-Drohne (Materialien je Skin austauschbar)
// ---------------------------------------------------------------------------
const std = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.4, ...extra });

const droneBody = std('#6b6580', { metalness: 0.6, roughness: 0.35 });
const droneGlow = new THREE.MeshStandardMaterial({ color: '#5eead4', emissive: '#5eead4', emissiveIntensity: 2.4, flatShading: true });
const thrusterMat = new THREE.MeshBasicMaterial({ color: '#99f6e4', transparent: true, opacity: 0.85, toneMapped: false });

const player = new THREE.Group();
const tilt = new THREE.Group();
player.add(tilt);
{
  tilt.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), droneBody));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), droneGlow);
  eye.position.set(0, 0.05, -0.5);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), droneBody);
  antenna.position.set(0.15, 0.7, 0.1);
  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), droneGlow);
  antennaTip.position.set(0.15, 0.97, 0.1);
  tilt.add(eye, antenna, antennaTip);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.45), droneBody);
    wing.position.set(side * 0.85, 0, 0.05);
    wing.rotation.z = side * -0.15;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.13, 0.13), droneGlow);
    tip.position.set(side * 1.25, -0.06, 0.2);
    tilt.add(wing, tip);
  }
  tilt.traverse((o) => { if (o.isMesh) o.castShadow = true; });
}
// Triebwerksflammen: zuerst eine mittig (Platzhalter-Drohne), nach dem Laden je eine pro Gondel
const thrusterGeo = new THREE.ConeGeometry(0.2, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5);
let thrusters = [];
function setThrusters(spots) {
  for (const t of thrusters) tilt.remove(t);
  thrusters = spots.map(({ x, y, z, r }) => {
    const t = new THREE.Mesh(thrusterGeo, thrusterMat);
    t.position.set(x, y, z);
    t.scale.set(r, r, 1);
    t.userData.baseScale = r;
    tilt.add(t);
    return t;
  });
}
setThrusters([{ x: 0, y: 0, z: 0.6, r: 1 }]);
tilt.scale.setScalar(1.35);

// Blender-Drohne einsetzen: Hülle (Body/Accent als Vertex-Helligkeit) + Leuchtteile
function useDroneModel(model) {
  for (const child of [...tilt.children]) {
    if (!thrusters.includes(child)) tilt.remove(child);
  }
  droneBody.vertexColors = true;
  droneBody.needsUpdate = true;
  const shell = new THREE.Mesh(model.shell, droneBody);
  const glowParts = new THREE.Mesh(model.glow, droneGlow);
  shell.castShadow = true;
  glowParts.castShadow = true;
  tilt.add(shell, glowParts);
  // Gondel-Enden im Modell: x ±0.6, y -0.2, z +0.7 (Blender -Y = hinten)
  setThrusters([{ x: -0.6, y: -0.2, z: 0.7, r: 0.55 }, { x: 0.6, y: -0.2, z: 0.7, r: 0.55 }]);
  tilt.scale.setScalar(1.45);
}
scene.add(player);

const COLORS = {
  hit: color('#fb7185'),
  smash: color('#f97316'),
  smashLight: color('#fecaca'),
  ember: color('#fb923c'),
  lava: [color('#f97316'), color('#ef4444'), color('#fde047')],
  lavaWarn: color('#ef4444', 0.9),
  ice: color('#e0f2fe'),
  boost: color('#5eead4'),
  trail: color('#99f6e4', 0.8),
  playerGlow: color('#5eead4', 0.55),
  magnetGlow: color('#f87171', 0.7),
  doubleGlow: color('#a78bfa', 0.7),
};

function applySkin(id) {
  const skin = C.SKINS.find((s) => s.id === id) || C.SKINS[0];
  droneBody.color.set(skin.body);
  droneGlow.color.set(skin.glow);
  droneGlow.emissive.set(skin.glow);
  thrusterMat.color.set(skin.glow).lerp(new THREE.Color('#ffffff'), 0.45);
  COLORS.boost.set(skin.glow);
  COLORS.trail.set(skin.glow).multiplyScalar(0.8);
  COLORS.playerGlow.set(skin.glow).multiplyScalar(0.55);
}

// ---------------------------------------------------------------------------
// Kristalle, Minen, Power-ups – Geometrien & Materialien
// ---------------------------------------------------------------------------
let crystalGeo = new THREE.OctahedronGeometry(0.62, 0);
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
let mineGeo = (() => {
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
let eyeGeo = mergeGeometries([
  new THREE.SphereGeometry(0.1, 8, 6).translate(-0.18, 0.12, -0.55),
  new THREE.SphereGeometry(0.1, 8, 6).translate(0.18, 0.12, -0.55),
]);
const mineMats = {
  normal: { body: std('#4a0f14', { metalness: 0.5, roughness: 0.5 }), eye: new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 2 }) },
  hunter: { body: std('#2e1065', { metalness: 0.5, roughness: 0.45 }), eye: new THREE.MeshStandardMaterial({ color: '#c084fc', emissive: '#c084fc', emissiveIntensity: 2.5 }) },
};
const mineGlow = { normal: color('#ef4444', 0.55), hunter: color('#a855f7', 0.7), titan: color('#f97316', 0.5) };

// Titan-Mine: gleiche Grundform, dunkles Metall, glühende Ringe
const titanMats = {
  body: std('#8a8a96', { metalness: 0.55, roughness: 0.4 }),
  eye: new THREE.MeshStandardMaterial({ color: '#fb923c', emissive: '#f97316', emissiveIntensity: 3 }),
  ring: new THREE.MeshStandardMaterial({ color: '#f97316', emissive: '#ea580c', emissiveIntensity: 1.3, flatShading: true }),
};
const titanRingGeo = new THREE.TorusGeometry(1.15, 0.08, 6, 32);

// Titan: nach dem Laden eigenes Blender-Modell (größer modelliert → kleinerer Skalierungsfaktor)
const titanModel = { shell: null, glow: null, scale: 2.4 };

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

// ---------------------------------------------------------------------------
// Spielzustand
// ---------------------------------------------------------------------------
let state = 'loading'; // loading | menu | hangar | playing | paused | over
let mode = 'normal';   // normal | daily
let biomeKey = profile.biome;
let settingsReturn = 'start';
let touchUI = false;
let lastResult = null;
const game = {};
const crystals = [];
const mines = [];
let powerup = null;
const vel = new THREE.Vector3();
const moveDir = new THREE.Vector3();
const _v = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _glowColor = new THREE.Color();
let yaw = 0;
let shake = 0;
let trailTimer = 0;

const input = new Input({ onKey });

function resetGame() {
  if (game.titan) scene.remove(game.titan.mesh);
  Object.assign(game, {
    score: 0, timeLeft: C.GAME_TIME, shield: C.MAX_SHIELD, combo: 0, comboTimer: 0, bestCombo: 0,
    collected: 0, rare: 0, gold: 0, minesSmashed: 0, huntersSmashed: 0, powerupsTaken: 0,
    noHitTime: 0, noHitBest: 0, invuln: 0, elapsed: 0, warned: false,
    boostCd: 0, boostT: 0, mineTimer: 0, stormStarted: false, stormT: 0, stormSpawn: 0,
    powerupTimer: 7, buffs: { magnet: 0, double: 0 }, respawns: [],
    lavaTimer: 3, vents: [], onIce: false, coachT: 0, missions: [],
    endless: false, titan: null, titanSpawned: false, titanNext: 0, titansDefeated: 0, stormNext: 0,
    newAchievements: [],
  });
}

// Schwierigkeits-Fortschritt 0..1.6 – im Endlos-Modus gedeckelt, damit es fair bleibt
const difficulty = () => Math.min(1.6, game.elapsed / C.GAME_TIME);

function addShake(amount) {
  if (settings.shake) shake = Math.max(shake, amount);
}

// --- Erfolge -------------------------------------------------------------------------
const achievementQueue = [];
let achievementShowing = false;

function unlockAchievement(id) {
  if (profile.achievements[id]) return;
  profile.achievements[id] = Date.now();
  saveProfile(profile);
  const achievement = C.ACHIEVEMENTS.find((a) => a.id === id);
  game.newAchievements?.push(achievement);
  achievementQueue.push(achievement);
  showNextAchievement();
}

function showNextAchievement() {
  if (achievementShowing || !achievementQueue.length) return;
  const a = achievementQueue.shift();
  achievementShowing = true;
  $('achievementIcon').textContent = a.icon;
  $('achievementName').textContent = a.name;
  $('achievementText').textContent = a.text;
  restartAnimation($('achievementToast'), 'show');
  audio.play('unlock', { volume: 0.8 });
  if (!audio.currentVoice && state === 'playing') audio.voice('achievement');
  setTimeout(() => {
    achievementShowing = false;
    showNextAchievement();
  }, 3200);
}

// --- Titan-Mine (Boss) ---------------------------------------------------------------
function spawnTitan() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(titanModel.shell ?? mineGeo, titanMats.body);
  body.castShadow = true;
  const ringA = new THREE.Mesh(titanRingGeo, titanMats.ring);
  ringA.rotation.x = Math.PI / 2;
  const ringB = new THREE.Mesh(titanRingGeo, titanMats.ring);
  ringB.rotation.y = Math.PI / 2;
  g.add(body, new THREE.Mesh(titanModel.glow ?? eyeGeo, titanMats.eye), ringA, ringB);
  const { x, z } = freeSpot(14);
  g.position.set(x, C.HOVER_Y + 0.6, z);
  g.scale.setScalar(0.001);
  scene.add(g);
  game.titan = { mesh: g, rings: [ringA, ringB], hp: C.TITAN.hp, vx: 0, vz: 0, hitCd: 0, age: 0 };
  audio.play('titanRoar');
  audio.voice('titan');
  announce('TITAN-MINE!', 'titan');
  addShake(0.6);
}

function removeTitan() {
  if (!game.titan) return;
  scene.remove(game.titan.mesh);
  game.titan = null;
}

function damageTitan() {
  const T = game.titan;
  T.hp--;
  T.hitCd = 0.7;
  _v.set(player.position.x - T.mesh.position.x, 0, player.position.z - T.mesh.position.z).normalize();
  vel.copy(_v).multiplyScalar(15);
  game.boostT = 0;
  T.vx = -_v.x * 7;
  T.vz = -_v.z * 7;
  const pts = C.TITAN.hitPoints * addCombo();
  game.score += pts;
  particles.burst(T.mesh.position, COLORS.smash, 30, 10);
  particles.burst(T.mesh.position, COLORS.smashLight, 14, 6);
  audio.play('titanHit');
  addShake(0.5);
  vibrate(60);
  popup(T.mesh.position, `+${pts}`, 'smash');
  if (T.hp <= 0) defeatTitan();
  else toast(`TITAN ${T.hp}/${C.TITAN.hp}`, 'smash');
}

function defeatTitan() {
  const pos = game.titan.mesh.position.clone();
  removeTitan();
  for (let i = 0; i < 3; i++) particles.burst(pos, COLORS.lava[i], 34, 13);
  audio.play('smash', { rate: 0.7 });
  audio.voice('titanDown');
  addShake(1);
  vibrate(200);
  const pts = C.TITAN.points * (game.buffs.double > 0 ? 2 : 1);
  game.score += pts;
  game.titansDefeated++;
  if (game.shield < C.MAX_SHIELD) game.shield++;
  announce(`TITAN BESIEGT! +${pts}`, 'storm');
  for (let i = 0; i < C.TITAN.goldDrop; i++) {
    const a = (i / C.TITAN.goldDrop) * Math.PI * 2;
    spawnCrystal('gold', true, { x: pos.x + Math.cos(a) * 3, z: pos.z + Math.sin(a) * 3 });
  }
  unlockAchievement('titan');
}

function updateTitan(dt, t) {
  const T = game.titan;
  if (!T) return;
  const m = T.mesh;
  T.age += dt;
  T.hitCd = Math.max(0, T.hitCd - dt);
  m.scale.setScalar(Math.min(1, T.age * 1.2) * titanModel.scale);
  m.rotation.y += dt * 0.8;
  T.rings[0].rotation.z += dt * 2;
  T.rings[1].rotation.x += dt * 1.6;
  titanMats.eye.emissiveIntensity = 1.4 + Math.sin(t * 8) * 0.6;
  m.position.y = C.HOVER_Y + 0.6 + Math.sin(t * 1.8) * 0.3;
  if (T.age < 1.2) return;

  _v.set(player.position.x - m.position.x, 0, player.position.z - m.position.z);
  const dist = _v.length();
  const speed = C.TITAN.speed + (C.TITAN.hp - T.hp) * 0.25;
  if (dist > 0.01) {
    const steer = Math.min(1, 1.1 * dt);
    T.vx += ((_v.x / dist) * speed - T.vx) * steer;
    T.vz += ((_v.z / dist) * speed - T.vz) * steer;
  }
  m.position.x += T.vx * dt;
  m.position.z += T.vz * dt;
  const r = Math.hypot(m.position.x, m.position.z);
  if (r > C.ARENA - 1) {
    m.position.x *= (C.ARENA - 1) / r;
    m.position.z *= (C.ARENA - 1) / r;
  }
  if (dist < C.TITAN.reach && T.hitCd === 0) {
    if (game.boostT > 0) damageTitan();
    else if (game.invuln === 0) hit(m.position.x, m.position.z, 'titan');
  }
}

function freeSpot(minPlayerDist) {
  for (let tries = 0; tries < 40; tries++) {
    const a = rr(0, Math.PI * 2);
    const r = Math.sqrt(rng()) * (C.ARENA - 1.5);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.hypot(x - player.position.x, z - player.position.z) < minPlayerDist) continue;
    if (mines.some((m) => Math.hypot(x - m.position.x, z - m.position.z) < 2.5)) continue;
    if (crystals.some((c) => Math.hypot(x - c.position.x, z - c.position.z) < 1.6)) continue;
    return { x, z };
  }
  return { x: rr(-C.ARENA, C.ARENA) * 0.6, z: rr(-C.ARENA, C.ARENA) * 0.6 };
}

function spawnCrystal(kind = null, falling = false, at = null) {
  if (crystals.length >= C.MAX_CRYSTALS) return;
  const type = kind || (rng() < 0.18 ? 'rare' : 'normal');
  const m = new THREE.Mesh(crystalGeo, crystalMats[type]);
  let { x, z } = at || freeSpot(3);
  const r = Math.hypot(x, z);
  if (r > C.ARENA - 1) {
    x *= (C.ARENA - 1) / r;
    z *= (C.ARENA - 1) / r;
  }
  m.position.set(x, falling ? rr(12, 18) : C.HOVER_Y, z);
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
  const weight = (key, p) => (key === 'shield' && game.endless ? C.ENDLESS.shieldWeight : p.weight);
  const entries = Object.entries(C.POWERUPS).filter(([key]) => !(key === 'shield' && game.shield >= C.MAX_SHIELD) && !(key === 'time' && game.endless));
  let r = rng() * entries.reduce((sum, [key, p]) => sum + weight(key, p), 0);
  for (const [key, p] of entries) {
    r -= weight(key, p);
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
  removeTitan();
  particles.clear();
  player.position.set(0, C.HOVER_Y, 0);
  player.visible = true;
  vel.set(0, 0, 0);
  yaw = 0;
  for (let i = 0; i < C.CRYSTAL_COUNT; i++) spawnCrystal();
  for (let i = 0; i < C.START_MINES; i++) spawnMine();
}

function setBiome(key) {
  biomeKey = key;
  switchWorld(key);
  resetWorld();
  renderer.compileAsync(scene, camera).catch(() => {});
}

// ---------------------------------------------------------------------------
// Screens & HUD
// ---------------------------------------------------------------------------
const SCREENS = ['loading', 'start', 'pause', 'over', 'settings', 'hangar', 'awards'];
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
  setText('time', game.endless ? clock(game.elapsed, false) : clock(game.timeLeft, true));
  setFlag('timerPanel', 'urgent', !game.endless && game.timeLeft <= 10);
  setFlag('bossBar', 'show', Boolean(game.titan));
  if (game.titan) for (let i = 0; i < C.TITAN.hp; i++) setFlag(`bossPip${i}`, 'off', i >= game.titan.hp);
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

  game.missions.forEach((m, i) => {
    setText(`missionVal${i}`, m.done ? '✓' : `${Math.floor(m.value)}/${m.def.goal}`);
    setFlag(`mission${i}`, 'done', m.done);
  });
  setText('missionChip', `🎯 ${game.missions.filter((m) => m.done).length}/${game.missions.length}`);
  setFlag('coach', 'show', game.coachT > 0);
}

function renderMissionList(listId) {
  $(listId).innerHTML = game.missions.map((m) => `
    <li class="${m.done ? 'done' : ''}"><span>${m.done ? '✓' : '○'} ${escapeHtml(m.def.text)}</span><b>${m.done ? `+${C.MISSION_BONUS}` : `${Math.floor(m.value)}/${m.def.goal}`}</b></li>`).join('');
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
  if (touchUI && settings.vibration && navigator.vibrate) navigator.vibrate(ms);
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
  $('tglShake').setAttribute('aria-pressed', String(settings.shake));
  $('tglVibe').setAttribute('aria-pressed', String(settings.vibration));
  $('fps').hidden = !settings.fps;
  $('qualityNote').textContent = settings.quality === 'auto'
    ? 'Auto senkt die Grafik von selbst, wenn das Spiel ruckelt.'
    : 'Tipp: Bei Rucklern "Mittel" oder "Niedrig" wählen.';
}

function renderStartScreen() {
  $('biomeCards').innerHTML = C.BIOME_ORDER.map((key) => {
    const b = C.BIOMES[key];
    const unlocked = isBiomeUnlocked(profile, key);
    const best = profile.bestByBiome[key] || 0;
    const detail = unlocked
      ? (best > 0 ? `Bestwert ${fmt(best)}` : 'Noch nicht gespielt')
      : `🔒 ${fmt(b.unlock.score)} Pkt. auf ${C.BIOMES[b.unlock.biome].name}`;
    return `<button class="biome-card ${key}${unlocked ? '' : ' locked'}" data-biome="${key}" aria-pressed="${key === profile.biome}" ${unlocked ? '' : 'aria-disabled="true"'}>
      <span class="biome-icon">${b.icon}</span><span class="biome-name">${b.name}</span><span class="biome-detail">${escapeHtml(detail)}</span>
    </button>`;
  }).join('');
  const date = todayKey();
  const dailyBest = profile.daily.date === date ? profile.daily.best : 0;
  const daily = C.BIOMES[dailyBiome(date)];
  $('dailyInfo').textContent = `${daily.icon} ${daily.name}${dailyBest ? ` · Heute: ${fmt(dailyBest)}` : ''}`;
  const endlessBest = profile.endlessBest;
  $('endlessInfo').textContent = endlessBest.time > 0
    ? `Rekord ${clock(endlessBest.time)} · ${fmt(endlessBest.score)}`
    : `${C.BIOMES[profile.biome].icon} ${C.BIOMES[profile.biome].name}`;
  $('btnAwards').textContent = `🏆 ERFOLGE ${Object.keys(profile.achievements).length}/${C.ACHIEVEMENTS.length}`;
}

function renderAwards() {
  const unlocked = Object.keys(profile.achievements).length;
  $('awardsCount').textContent = `${unlocked} von ${C.ACHIEVEMENTS.length} freigeschaltet`;
  $('awardList').innerHTML = C.ACHIEVEMENTS.map((a) => {
    const at = profile.achievements[a.id];
    return `<li class="award${at ? ' got' : ''}">
      <span class="award-icon">${at ? a.icon : '🔒'}</span>
      <span><b>${escapeHtml(a.name)}</b><small>${escapeHtml(a.text)}</small></span>
    </li>`;
  }).join('');
}

function renderHangar() {
  $('totalCrystals').textContent = fmt(profile.totalCrystals);
  $('skinList').innerHTML = C.SKINS.map((skin) => {
    const unlocked = isSkinUnlocked(profile, skin);
    return `<button class="skin${unlocked ? '' : ' locked'}" data-skin="${skin.id}" aria-pressed="${skin.id === profile.skin}" ${unlocked ? '' : 'aria-disabled="true"'}>
      <img class="skin-img" src="assets/skin-${skin.id}.png" alt="" loading="lazy" style="--glow:${skin.glow}">
      <span class="skin-name">${skin.name}</span>
      <span class="skin-detail">${unlocked ? (skin.id === profile.skin ? 'Ausgewählt' : 'Freigeschaltet') : `🔒 ${fmt(skin.unlock)} 💎`}</span>
    </button>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Spielablauf
// ---------------------------------------------------------------------------
function startGame(nextMode = 'normal') {
  mode = nextMode;
  audio.unlock();
  audio.startMusic();
  audio.setPaused(false);
  if (!engine) engine = audio.loop('engine');
  input.consumeBoost();

  const date = todayKey();
  rng = mode === 'daily' ? mulberry32(hashString(`kristalljaeger-${date}`)) : Math.random;
  const key = mode === 'daily' ? dailyBiome(date) : profile.biome;
  if (world.biome?.key !== key) switchWorld(key);
  biomeKey = key;

  resetGame();
  game.endless = mode === 'endless';
  if (game.endless) {
    game.timeLeft = Infinity;
    game.titanNext = C.TITAN.endlessFirst;
    game.stormNext = C.ENDLESS.stormEvery;
  }
  game.missions = pickMissions(rng);
  resetWorld();
  game.coachT = profile.seenTutorial ? 0 : 8;
  state = 'playing';
  domCache.clear();
  showScreen(null);
  $('hud').hidden = false;
  const badge = { daily: '📅 TAGES-CHALLENGE · ', endless: '♾ ENDLOS · ', normal: `${C.BIOMES[key].icon} ` }[mode];
  setText('modeBadge', `${badge}${C.BIOMES[key].name}`);
  setText('timerLabel', game.endless ? 'ÜBERLEBT' : 'ZEIT');
  game.missions.forEach((m, i) => setText(`missionText${i}`, m.def.text));
  updateHud();
  audio.voice(game.endless ? 'endless' : C.BIOMES[key].voice);
}

function endGame(reason) {
  state = 'over';
  player.visible = true;
  engine?.set(0, 1);

  const biomesBefore = C.BIOME_ORDER.filter((k) => isBiomeUnlocked(profile, k));
  const skinsBefore = C.SKINS.filter((s) => isSkinUnlocked(profile, s)).map((s) => s.id);
  profile.totalCrystals += game.collected;
  profile.totalGold += game.gold;
  profile.games++;
  profile.seenTutorial = true;

  let isBest = false;
  if (mode === 'endless') {
    if (game.score > profile.endlessBest.score || game.elapsed > profile.endlessBest.time) {
      isBest = game.score > profile.endlessBest.score;
      profile.endlessBest = {
        score: Math.max(game.score, profile.endlessBest.score),
        time: Math.max(game.elapsed, profile.endlessBest.time),
      };
    }
  } else if (mode === 'daily') {
    const date = todayKey();
    if (profile.daily.date !== date) profile.daily = { date, best: 0 };
    if (game.score > profile.daily.best) {
      profile.daily.best = game.score;
      isBest = game.score > 0;
    }
  } else if (game.score > (profile.bestByBiome[biomeKey] || 0)) {
    profile.bestByBiome[biomeKey] = game.score;
    isBest = game.score > 0;
  }
  const newBiomes = C.BIOME_ORDER.filter((k) => isBiomeUnlocked(profile, k) && !biomesBefore.includes(k));
  const newSkins = C.SKINS.filter((s) => isSkinUnlocked(profile, s) && !skinsBefore.includes(s.id));
  saveProfile(profile);

  const rank = C.RANKS.find((r) => game.score >= r.min);
  unlockAchievement('first');
  if (rank.rank === 'S') unlockAchievement('rankS');
  if (isBiomeUnlocked(profile, 'frost')) unlockAchievement('frost');
  if (isBiomeUnlocked(profile, 'volcano')) unlockAchievement('volcano');
  if (profile.totalGold >= 10) unlockAchievement('gold10');
  if (profile.totalCrystals >= 1000) unlockAchievement('crystals1000');
  if (mode === 'endless' && game.elapsed >= 180) unlockAchievement('endless180');
  if (mode === 'daily') unlockAchievement('daily');

  lastResult = { score: game.score, rank: rank.rank, biome: C.BIOMES[biomeKey].name, mode, time: game.elapsed };
  const modeLabel = { daily: '📅 Tages-Challenge · ', endless: '♾ Endlos-Modus · ', normal: `${C.BIOMES[biomeKey].icon} ` }[mode];
  $('overMode').textContent = `${modeLabel}${C.BIOMES[biomeKey].name}`;
  $('overTitle').textContent = mode === 'endless' ? `ÜBERLEBT: ${clock(game.elapsed)}` : reason === 'time' ? 'ZEIT ABGELAUFEN!' : 'SCHILD ZERSTÖRT!';
  $('overScore').textContent = `${fmt(game.score)} Punkte`;
  $('overRank').textContent = rank.rank;
  $('overRank').dataset.rank = rank.rank;
  $('overRankText').textContent = rank.text;
  $('stCrystals').textContent = String(game.collected);
  $('stCombo').textContent = `x${Math.max(1, game.bestCombo)}`;
  $('stMines').textContent = String(game.minesSmashed);
  $('stPower').textContent = String(game.powerupsTaken);
  $('overBest').hidden = !isBest;
  $('overBest').textContent = { daily: '★ NEUER TAGES-BESTWERT ★', endless: '★ NEUER ENDLOS-REKORD ★', normal: '★ NEUER BESTWERT ★' }[mode];
  renderMissionList('overMissions');
  const unlocks = [
    ...newBiomes.map((k) => `🔓 ${C.BIOMES[k].icon} ${C.BIOMES[k].name} freigeschaltet!`),
    ...newSkins.map((s) => `🔓 Drohnen-Skin „${s.name}“ freigeschaltet!`),
    ...game.newAchievements.map((a) => `🏆 Erfolg: ${a.icon} ${a.name}`),
  ];
  $('overUnlocks').innerHTML = unlocks.map((u) => `<li>${escapeHtml(u)}</li>`).join('');
  $('overUnlocks').hidden = unlocks.length === 0;
  $('btnAgain').textContent = { daily: 'NOCHMAL (TAGES-CHALLENGE)', endless: 'NOCHMAL (ENDLOS)', normal: 'NOCHMAL' }[mode];
  $('btnShare').textContent = '📤 TEILEN';
  showScreen('over');

  if (unlocks.length) audio.play('unlock');
  if (newBiomes.length) audio.voice('newWorld');
  else if (isBest) audio.voice('record');
  else if (reason === 'time') audio.voice('end');
  $('btnAgain').focus({ preventScroll: true });
}

function toMenu() {
  state = 'menu';
  mode = 'normal';
  rng = Math.random;
  engine?.set(0, 1);
  $('hud').hidden = true;
  resetGame();
  if (world.biome?.key !== profile.biome) switchWorld(profile.biome);
  biomeKey = profile.biome;
  resetWorld();
  audio.setPaused(false);
  renderStartScreen();
  showScreen('start');
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    input.resetJoystick?.();
    engine?.set(0, 1);
    audio.setPaused(true);
    renderMissionList('pauseMissions');
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

// Im Hangar steht nur die Drohne im Bild – Kristalle & Minen würden die Nahaufnahme verdecken
function setEntitiesVisible(visible) {
  for (const o of [...crystals, ...mines]) o.visible = visible;
}

function openHangar() {
  state = 'hangar';
  setEntitiesVisible(false);
  renderHangar();
  showScreen('hangar');
}

function closeHangar() {
  state = 'menu';
  setEntitiesVisible(true);
  renderStartScreen();
  showScreen('start');
}

function addCombo() {
  game.combo = game.comboTimer > 0 ? Math.min(game.combo + 1, 5) : 1;
  game.comboTimer = C.COMBO_WINDOW;
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  if (game.combo >= 5) unlockAchievement('combo5');
  return game.combo * (game.buffs.double > 0 ? 2 : 1);
}

function collect(crystal, index) {
  const { type } = crystal.userData;
  const pts = C.CRYSTAL_TYPES[type].points * addCombo();
  game.score += pts;
  game.collected++;
  if (type === 'rare') game.rare++;
  if (type === 'gold') game.gold++;
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
  if (hunter) game.huntersSmashed++;
  if (game.minesSmashed >= 5) unlockAchievement('smash5');
  particles.burst(mine.position, COLORS.smash, 26, 9);
  particles.burst(mine.position, COLORS.smashLight, 12, 5);
  audio.play('smash');
  addShake(0.35);
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

function hit(fromX, fromZ, source = 'mine') {
  game.shield--;
  game.invuln = 1.6;
  game.combo = 0;
  game.comboTimer = 0;
  game.noHitTime = 0;
  _v.set(player.position.x - fromX, 0, player.position.z - fromZ);
  if (_v.lengthSq() < 0.001) _v.set(0, 0, 1);
  vel.addScaledVector(_v.normalize(), 16);
  addShake(0.7);
  flash();
  audio.play('hit');
  vibrate(120);
  particles.burst(player.position, COLORS.hit, 20, 7);
  if (game.shield <= 0) {
    updateHud();
    endGame('shield');
    return;
  }
  toast(source === 'lava' ? 'LAVA! SCHILD −1' : 'SCHILD −1', 'hit');
}

function updateMissions() {
  for (const m of game.missions) {
    if (m.done) continue;
    m.value = Math.min(m.def.goal, game[m.def.stat]);
    if (m.value >= m.def.goal) {
      m.done = true;
      game.score += C.MISSION_BONUS;
      audio.play('mission');
      announce(`AUFTRAG ERFÜLLT! +${C.MISSION_BONUS}`, 'mission');
    }
  }
  if (game.missions.length && game.missions.every((m) => m.done)) unlockAchievement('missions3');
}

// --- Gefahren: Lava-Geysire & Glatteis --------------------------------------------
function spawnVent() {
  let x;
  let z;
  if (rng() < C.LAVA.aimAtPlayer) {
    x = player.position.x + vel.x * 0.5 + rr(-2, 2);
    z = player.position.z + vel.z * 0.5 + rr(-2, 2);
    const r = Math.hypot(x, z);
    if (r > C.ARENA - 1) {
      x *= (C.ARENA - 1) / r;
      z *= (C.ARENA - 1) / r;
    }
  } else {
    ({ x, z } = freeSpot(4));
  }
  game.vents.push({ x, z, t: C.LAVA.warn, r: C.LAVA.radius });
}

function erupt(vent) {
  for (let i = 0; i < 34; i++) {
    particles.emit(
      vent.x + rand(-0.6, 0.6), 0.2, vent.z + rand(-0.6, 0.6),
      rand(-3, 3), rand(8, 16), rand(-3, 3),
      rand(0.7, 1.1), rand(0.9, 1.6), COLORS.lava[i % 3], 16
    );
  }
  const dist = Math.hypot(player.position.x - vent.x, player.position.z - vent.z);
  audio.play('eruption', { volume: clamp(1.2 - dist / 25, 0.25, 1) });
  if (dist < 8) addShake(0.4 * (1 - dist / 8) + 0.1);
  if (dist < vent.r && game.invuln === 0) hit(vent.x, vent.z, 'lava');
}

function updateHazards(dt) {
  const hazard = C.BIOMES[biomeKey].hazard;
  if (hazard !== 'lava') return;
  game.lavaTimer -= dt;
  if (game.lavaTimer <= 0) {
    game.lavaTimer = rr(...C.LAVA.every) * (1 - Math.min(1, difficulty()) * 0.35);
    spawnVent();
  }
  for (let i = game.vents.length - 1; i >= 0; i--) {
    const v = game.vents[i];
    v.t -= dt;
    if (Math.random() < dt * 14) {
      particles.emit(v.x + rand(-1, 1) * v.r * 0.6, 0.1, v.z + rand(-1, 1) * v.r * 0.6, 0, rand(1, 3), 0, 0.5, 0.5, COLORS.ember, -1);
    }
    if (v.t <= 0) {
      game.vents.splice(i, 1);
      erupt(v);
      if (state !== 'playing') return;
    }
  }
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

  const icePatches = world.biome?.icePatches ?? [];
  game.onIce = icePatches.some((p) => (player.position.x - p.x) ** 2 + (player.position.z - p.z) ** 2 < p.r * p.r);

  const boosting = game.boostT > 0;
  const grip = game.onIce ? C.ICE.accel : 1;
  vel.addScaledVector(moveDir, (boosting ? 70 : 30) * grip * dt);
  vel.multiplyScalar(Math.exp(-(game.onIce ? C.ICE.drag : 3.2) * dt));
  const maxSpeed = boosting ? 20 : game.onIce ? 12 : 9.5;
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
  const flame = 0.4 + speed / 9 + (boosting ? 1.2 : 0);
  for (const t of thrusters) t.scale.z = flame * (0.6 + t.userData.baseScale * 0.4);
  engine?.set(0.1 + (speed / 20) * 0.35 + (boosting ? 0.15 : 0), 0.8 + (speed / 20) * 0.7);

  trailTimer -= dt;
  if (trailTimer <= 0 && speed > 1.5) {
    trailTimer = boosting ? 0.015 : 0.045;
    const back = 1.1;
    particles.emit(
      player.position.x + Math.sin(yaw) * back, player.position.y - 0.05, player.position.z + Math.cos(yaw) * back,
      rand(-0.3, 0.3), rand(-0.1, 0.4), rand(-0.3, 0.3),
      boosting ? 0.45 : 0.3, boosting ? 0.9 : 0.5, boosting ? COLORS.boost : COLORS.trail, 0
    );
    if (game.onIce && speed > 3) {
      particles.emit(player.position.x + rand(-0.6, 0.6), 0.15, player.position.z + rand(-0.6, 0.6), rand(-1, 1), rand(0.5, 1.5), rand(-1, 1), 0.4, 0.45, COLORS.ice, 3);
    }
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
  const wanderSpeed = 2 + difficulty() * 2.5;
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
        const hunterSpeed = 3.1 + difficulty() * 1.2;
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
      if (rng() < 0.35) {
        d.target.set(player.position.x + rr(-4, 4), C.HOVER_Y, player.position.z + rr(-4, 4));
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
  game.coachT = Math.max(0, game.coachT - dt);
  game.noHitTime += dt;
  game.noHitBest = Math.max(game.noHitBest, game.noHitTime);
  if (!game.endless) {
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
  }

  game.buffs.magnet = Math.max(0, game.buffs.magnet - dt);
  game.buffs.double = Math.max(0, game.buffs.double - dt);

  updatePlayer(dt, t);

  game.comboTimer = Math.max(0, game.comboTimer - dt);
  if (game.comboTimer === 0) game.combo = 0;

  // Kristallsturm: zur Halbzeit bzw. im Endlos-Modus regelmäßig
  const stormDue = game.endless ? game.elapsed >= game.stormNext : !game.stormStarted && game.timeLeft <= C.STORM_AT;
  if (stormDue) {
    game.stormStarted = true;
    game.stormNext += C.ENDLESS.stormEvery;
    game.stormT = C.STORM_DURATION;
    audio.voice('storm');
    announce('KRISTALLSTURM!', 'storm');
  }
  if (game.stormT > 0) {
    game.stormT -= dt;
    game.stormSpawn -= dt;
    if (game.stormSpawn <= 0) {
      game.stormSpawn = 0.3;
      const roll = rng();
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
      game.powerupTimer = rr(...C.POWERUP_EVERY);
      spawnPowerup();
    }
  }

  // Minen: Nachschub, Jäger, Respawns
  game.mineTimer += dt;
  const normalMines = mines.filter((m) => !m.userData.hunter).length + game.respawns.filter((r) => !r.hunter).length;
  const mineEvery = game.endless ? C.ENDLESS.mineEvery : 10;
  const maxMines = game.endless ? C.ENDLESS.maxMines : C.MAX_MINES;
  if (game.mineTimer >= mineEvery && normalMines < maxMines) {
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
      hit(m.position.x, m.position.z);
      if (state !== 'playing') return;
      break;
    }
  }

  // Titan-Mine: Vulkaninsel kurz vor Schluss, Endlos-Modus regelmäßig
  if (!game.titan) {
    if (game.endless && game.elapsed >= game.titanNext) {
      game.titanNext = game.elapsed + C.TITAN.endlessEvery;
      spawnTitan();
    } else if (!game.endless && C.BIOMES[biomeKey].titan && !game.titanSpawned && game.timeLeft <= C.TITAN.normalAt) {
      game.titanSpawned = true;
      spawnTitan();
    }
  }
  updateTitan(dt, t);
  if (state !== 'playing') return;

  updateHazards(dt);
  if (state !== 'playing') return;
  updateMissions();
  updateHud();
}

function updateGlows(t) {
  glow.begin();
  if (state === 'hangar') {
    glow.add(player.position.x, player.position.z, 2.6, COLORS.playerGlow);
    glow.end();
    return;
  }
  for (const c of crystals) glow.add(c.position.x, c.position.z, c.userData.falling ? 1.2 : 2.3, crystalGlow[c.userData.type]);
  for (const m of mines) glow.add(m.position.x, m.position.z, m.userData.hunter ? 3.2 : 2.4, mineGlow[m.userData.hunter ? 'hunter' : 'normal']);
  if (powerup) glow.add(powerup.position.x, powerup.position.z, 3.2, powerGlow[powerup.userData.type]);
  if (game.titan) glow.add(game.titan.mesh.position.x, game.titan.mesh.position.z, 5.5 + Math.sin(t * 6) * 0.4, mineGlow.titan);
  for (const v of game.vents ?? []) {
    const progress = 1 - v.t / C.LAVA.warn;
    _glowColor.copy(COLORS.lavaWarn).multiplyScalar(0.5 + progress * 0.8 + Math.sin(t * 30) * 0.15 * progress);
    glow.add(v.x, v.z, v.r * 2.4 * (0.35 + 0.65 * progress), _glowColor, 0.07);
  }
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
  const portrait = camera.aspect < 1;
  if (state === 'menu' || state === 'loading') {
    const a = t * 0.1;
    const dist = portrait ? 48 : 36;
    camGoal.set(Math.sin(a) * dist, portrait ? 26 : 18, Math.cos(a) * dist);
    lookGoal.set(0, -1, 0);
    camera.position.lerp(camGoal, 1 - Math.exp(-2 * dt));
  } else if (state === 'hangar') {
    // Drohne im oberen Bildteil halten, unten liegt die Hangar-Karte
    const a = t * 0.35;
    const dist = portrait ? 11 : 9;
    camGoal.set(player.position.x + Math.sin(a) * dist, 3.4, player.position.z + Math.cos(a) * dist);
    lookGoal.set(player.position.x, portrait ? -2.6 : -1.5, player.position.z);
    camera.position.lerp(camGoal, 1 - Math.exp(-3 * dt));
  } else {
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
  input.pollGamepad(onPad);

  if (state !== 'paused') {
    time += dt;
    if (state === 'playing') {
      updateGame(dt, time);
    } else {
      updateCrystals(dt, time);
      updateMines(dt, time, false);
      if (state === 'menu' || state === 'loading' || state === 'hangar') {
        player.position.y = C.HOVER_Y + Math.sin(time * 3) * 0.12;
        player.rotation.y += dt * (state === 'hangar' ? 0.25 : 0.6);
        tilt.rotation.set(0, 0, 0);
      }
    }
    if (powerup && state !== 'playing') powerup.userData.age = Math.min(powerup.userData.age, 1);
    updatePowerupVisual(dt, time);
    particles.update(dt, time);
    updateGlows(time);
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
// Geometrien der Blender-Modelle übernehmen; neue Kristalle/Minen nutzen sie automatisch
function applyModels(models) {
  useDroneModel(models.drone);
  mineGeo = models.mine.shell;
  eyeGeo = models.mine.glow;
  for (const mat of [mineMats.normal.body, mineMats.hunter.body, titanMats.body]) {
    mat.vertexColors = true;
    mat.needsUpdate = true;
  }
  crystalGeo = models.crystal.scale(1.15, 1.15, 1.15);
  Object.assign(titanModel, { shell: models.titan.shell, glow: models.titan.glow, scale: 1.9 });
  for (const [type, geo] of Object.entries(models.powerups)) {
    powerGeo[type] = geo;
    powerMats[type].core.vertexColors = true;
    powerMats[type].core.needsUpdate = true;
  }
  world.setEnvironmentModels(models.env);
  resetWorld();
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = url;
  });
}

async function loadAll() {
  const audioEntries = Object.entries(C.ASSETS.audio);
  const total = audioEntries.length + 3; // + Titelbild + 3D-Modelle + Shader
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
    loadModels()
      .then((models) => {
        applyModels(models);
        progress('3D-Modelle geladen …');
      })
      .catch((err) => {
        console.warn('Blender-Modelle nicht geladen, nutze einfache Formen', err);
        progress();
      }),
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
  document.body.classList.remove('gamepad');
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && state === 'playing') e.preventDefault();
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!$('settings').hidden) closeSettings();
    else if (state === 'hangar') closeHangar();
    else if (!$('awards').hidden) closeAwards();
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

// Gamepad: im Spiel steuern, in Menüs Fokus bewegen und bestätigen
function onPad(button) {
  document.body.classList.add('gamepad');
  if (state === 'playing') {
    if (button === 'a' || button === 'rt' || button === 'rb') input.boostQueued = true;
    if (button === 'start') togglePause();
    return;
  }
  const screenId = SCREENS.find((s) => !$(s).hidden);
  if (!screenId || screenId === 'loading') return;
  const buttons = [...$(screenId).querySelectorAll('button:not([disabled]):not([hidden])')].filter((b) => b.offsetParent !== null);
  if (!buttons.length) return;
  let index = buttons.indexOf(document.activeElement);
  if (button === 'up' || button === 'left') {
    index = index <= 0 ? buttons.length - 1 : index - 1;
    buttons[index].focus();
  } else if (button === 'down' || button === 'right') {
    index = (index + 1) % buttons.length;
    buttons[index].focus();
  } else if (button === 'a') {
    (buttons[index] || buttons[0]).click();
  } else if (button === 'b') {
    if (screenId === 'settings') closeSettings();
    else if (screenId === 'hangar') closeHangar();
    else if (screenId === 'awards') closeAwards();
    else if (screenId === 'pause') togglePause();
    else if (screenId === 'over') toMenu();
  } else if (button === 'start') {
    if (screenId === 'pause') togglePause();
    else if (screenId === 'start') startGame();
    else if (screenId === 'over') startGame(mode);
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
window.addEventListener('gamepadconnected', () => {
  document.body.classList.add('gamepad');
  toast('🎮 CONTROLLER VERBUNDEN');
});

// Erste Interaktion schaltet Audio frei; Menü-Klicks bekommen einen Sound
document.addEventListener('click', (e) => {
  audio.unlock();
  if (state !== 'loading') audio.startMusic();
  if (e.target.closest('button')) audio.play('click', { volume: 0.5 });
}, { capture: true });

$('btnStart').addEventListener('click', () => startGame('normal'));
$('btnDaily').addEventListener('click', () => startGame('daily'));
$('btnAgain').addEventListener('click', () => startGame(mode));
$('btnRestart').addEventListener('click', () => startGame(mode));
$('btnMenu').addEventListener('click', toMenu);
$('btnMenuPause').addEventListener('click', toMenu);
$('btnResume').addEventListener('click', togglePause);
$('btnPauseHud').addEventListener('click', togglePause);
$('btnSettingsStart').addEventListener('click', openSettings);
$('btnSettingsPause').addEventListener('click', openSettings);
$('btnSettingsBack').addEventListener('click', closeSettings);
$('btnHangar').addEventListener('click', openHangar);
$('btnHangarBack').addEventListener('click', closeHangar);
$('btnEndless').addEventListener('click', () => startGame('endless'));
$('btnAwards').addEventListener('click', () => {
  renderAwards();
  showScreen('awards');
});
$('btnAwardsBack').addEventListener('click', closeAwards);
$('btnShare').addEventListener('click', shareResult);
$('tglShake').addEventListener('click', () => {
  settings.shake = !settings.shake;
  saveSettings();
  updateSettingsUI();
});
$('tglVibe').addEventListener('click', () => {
  settings.vibration = !settings.vibration;
  saveSettings();
  updateSettingsUI();
});

function closeAwards() {
  renderStartScreen();
  showScreen('start');
}

async function shareResult() {
  if (!lastResult) return;
  const url = window.location.href.split(/[?#]/)[0];
  const where = lastResult.mode === 'daily' ? `in der Tages-Challenge (${lastResult.biome})`
    : lastResult.mode === 'endless' ? `im Endlos-Modus (${clock(lastResult.time)} überlebt)`
      : `auf der ${lastResult.biome}`;
  const text = `💎 ${fmt(lastResult.score)} Punkte (Rang ${lastResult.rank}) ${where} in Kristalljäger! Schaffst du mehr?`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Kristalljäger', text, url });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    $('btnShare').textContent = '✓ KOPIERT';
  } catch {
    $('btnShare').textContent = 'TEILEN NICHT MÖGLICH';
  }
  setTimeout(() => { $('btnShare').textContent = '📤 TEILEN'; }, 2200);
}

$('biomeCards').addEventListener('click', (e) => {
  const card = e.target.closest('.biome-card');
  if (!card) return;
  const key = card.dataset.biome;
  if (!isBiomeUnlocked(profile, key)) {
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
    return;
  }
  profile.biome = key;
  saveProfile(profile);
  setBiome(key);
  renderStartScreen();
  $('biomeCards').querySelector(`[data-biome="${key}"]`)?.focus();
});

$('skinList').addEventListener('click', (e) => {
  const card = e.target.closest('.skin');
  if (!card) return;
  const skin = C.SKINS.find((s) => s.id === card.dataset.skin);
  if (!isSkinUnlocked(profile, skin)) {
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
    return;
  }
  profile.skin = skin.id;
  saveProfile(profile);
  applySkin(skin.id);
  particles.burst(player.position, COLORS.boost, 18, 4);
  renderHangar();
  $('skinList').querySelector(`[data-skin="${skin.id}"]`)?.focus();
});

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

// Installierbare Web-App
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('btnInstall').hidden = false;
});
$('btnInstall').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  $('btnInstall').hidden = true;
});
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

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
    state, mode, biome: biomeKey, quality, fps: Math.round(perf.fps), score: game.score, timeLeft: Number(game.timeLeft.toFixed(2)),
    shield: game.shield, combo: game.combo, collected: game.collected, smashed: game.minesSmashed,
    crystals: crystals.length, mines: mines.length, hunter: mines.some((m) => m.userData.hunter),
    powerup: powerup?.userData.type ?? null, buffs: { ...game.buffs }, touchUI, onIce: game.onIce, vents: game.vents.length,
    missions: game.missions.map((m) => `${m.def.id}:${Math.floor(m.value)}/${m.def.goal}${m.done ? '✓' : ''}`),
    player: { x: Number(player.position.x.toFixed(2)), z: Number(player.position.z.toFixed(2)) },
    drawCalls: renderer.info.render.calls,
  }),
  profile: () => JSON.parse(JSON.stringify(profile)),
  debugMoveToNearestCrystal: () => moveToNearest(crystals),
  debugMoveToNearestMine: () => moveToNearest(mines),
  debugMoveToPowerup: () => powerup && player.position.set(powerup.position.x, player.position.y, powerup.position.z),
  debugMoveToIce: () => {
    const p = world.biome?.icePatches?.[0];
    if (p) player.position.set(p.x, player.position.y, p.z);
  },
  debugSpawnPowerup: (type) => spawnPowerup(type),
  debugSetTime: (s) => { game.timeLeft = s; },
  debugSetElapsed: (s) => { game.elapsed = s; },
  debugBoost: () => { input.boostQueued = true; },
  debugAddCrystals: (n) => { profile.totalCrystals += n; saveProfile(profile); },
  debugSetBest: (biome, score) => { profile.bestByBiome[biome] = score; saveProfile(profile); renderStartScreen(); },
  debugPad: (button) => onPad(button),
  debugSpawnTitan: () => spawnTitan(),
  debugMoveToTitan: () => {
    const T = game.titan;
    if (T) player.position.set(T.mesh.position.x + 1, player.position.y, T.mesh.position.z + 1);
  },
  debugShieldMax: () => { game.shield = C.MAX_SHIELD; game.invuln = 0; },
  titanHp: () => game.titan?.hp ?? null,
  lastShareText: () => lastResult,
};

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
applySkin(profile.skin);
switchWorld(biomeKey);
resetGame();
resetWorld();
resize();
applyQuality(preferredQuality());
showScreen('loading');

loadAll().then(() => {
  $('btnStart').disabled = false;
  toMenu();
});
