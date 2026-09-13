// Automatisch erzeugt von build.mjs – nicht von Hand bearbeiten
const CACHE = 'kristalljaeger-2c4aa54024c3';
const FILES = [
  "./",
  "index.html",
  "style.css",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "assets/bgm-frost.mp3",
  "assets/bgm-volcano.mp3",
  "assets/bgm.mp3",
  "assets/end.mp3",
  "assets/record.mp3",
  "assets/sfx-boost.mp3",
  "assets/sfx-click.mp3",
  "assets/sfx-engine.mp3",
  "assets/sfx-eruption.mp3",
  "assets/sfx-hit.mp3",
  "assets/sfx-mission.mp3",
  "assets/sfx-pickup.mp3",
  "assets/sfx-powerup.mp3",
  "assets/sfx-smash.mp3",
  "assets/sfx-titan-hit.mp3",
  "assets/sfx-titan.mp3",
  "assets/sfx-unlock.mp3",
  "assets/start.mp3",
  "assets/storm.mp3",
  "assets/title.jpg",
  "assets/voice-achievement.mp3",
  "assets/voice-endless.mp3",
  "assets/voice-frost.mp3",
  "assets/voice-titan-down.mp3",
  "assets/voice-titan.mp3",
  "assets/voice-unlock.mp3",
  "assets/voice-volcano.mp3",
  "assets/warn10.mp3"
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kristalljaeger-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // App-Dateien: zuerst Cache, sonst Netz (und nachcachen)
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      }))
    );
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    // Schrift: Cache sofort nutzen, im Hintergrund aktualisieren
    event.respondWith(caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      const network = fetch(request).then((res) => {
        cache.put(request, res.clone());
        return res;
      }).catch(() => hit);
      return hit || network;
    }));
  }
});
