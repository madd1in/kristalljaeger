// Baut index.html: src/game.js + three.js werden gebündelt und direkt eingebettet,
// damit das Spiel per Doppelklick (file://) und offline sofort startet.
// Erzeugt außerdem sw.js (Offline-Cache) mit einer Version aus dem Inhalts-Hash.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';

const result = await build({
  entryPoints: ['src/game.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
});

const js = result.outputFiles[0].text;
if (js.includes('</script')) throw new Error('Bundle enthält </script> – kann nicht eingebettet werden');

const template = await readFile('src/index.html', 'utf8');
if (!template.includes('<!--GAME_SCRIPT-->')) throw new Error('Platzhalter <!--GAME_SCRIPT--> fehlt in src/index.html');

const html = template.replace('<!--GAME_SCRIPT-->', () => `<script>\n${js}</script>`);
await writeFile('index.html', html, 'utf8');

// --- Service Worker -----------------------------------------------------------
const assets = (await readdir('assets')).sort().map((f) => `assets/${f}`);
const icons = (await readdir('icons')).sort().map((f) => `icons/${f}`);
const files = ['./', 'index.html', 'style.css', 'manifest.webmanifest', ...icons, ...assets];

const hash = createHash('sha256');
for (const file of files.slice(1)) hash.update(await readFile(file));
const version = hash.digest('hex').slice(0, 12);

const sw = `// Automatisch erzeugt von build.mjs – nicht von Hand bearbeiten
const CACHE = 'kristalljaeger-${version}';
const FILES = ${JSON.stringify(files, null, 2)};

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
`;
await writeFile('sw.js', sw, 'utf8');

console.log(`index.html gebaut (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB), sw.js Version ${version} (${files.length} Dateien)`);
