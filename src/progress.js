// Spielerfortschritt (lokal gespeichert), Freischaltungen, Aufträge und Tages-Challenge
import { BIOMES, BIOME_ORDER, MISSIONS, SKINS, STORAGE_KEYS } from './config.js';

export function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Speicher nicht verfügbar */ }
}

export function loadProfile() {
  const profile = {
    bestByBiome: {}, totalCrystals: 0, daily: { date: '', best: 0 },
    skin: 'standard', biome: 'meadow', seenTutorial: false, games: 0,
    achievements: {}, totalGold: 0, endlessBest: { score: 0, time: 0 },
    ...readStorage(STORAGE_KEYS.profile, {}),
  };
  // Bestwert aus v2 übernehmen
  const legacyBest = Number(readStorage(STORAGE_KEYS.best, 0)) || 0;
  if (legacyBest > (profile.bestByBiome.meadow || 0)) profile.bestByBiome.meadow = legacyBest;
  if (!BIOMES[profile.biome] || !isBiomeUnlocked(profile, profile.biome)) profile.biome = 'meadow';
  if (!SKINS.some((s) => s.id === profile.skin)) profile.skin = 'standard';
  return profile;
}

export const saveProfile = (profile) => writeStorage(STORAGE_KEYS.profile, profile);

export function isBiomeUnlocked(profile, key) {
  const rule = BIOMES[key].unlock;
  return !rule || (profile.bestByBiome[rule.biome] || 0) >= rule.score;
}

export const unlockedBiomes = (profile) => BIOME_ORDER.filter((key) => isBiomeUnlocked(profile, key));
export const isSkinUnlocked = (profile, skin) => profile.totalCrystals >= skin.unlock;

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Kleiner, schneller Seed-Zufallsgenerator – gleiche Tages-Challenge für alle
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const dailyBiome = (date) => BIOME_ORDER[hashString(date) % BIOME_ORDER.length];

export function pickMissions(rng, count = 3) {
  const pool = [...MISSIONS];
  const picked = [];
  while (picked.length < count && pool.length) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return picked.map((def) => ({ def, done: false, value: 0 }));
}
