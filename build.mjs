// Baut index.html: src/game.js + three.js werden gebündelt und direkt eingebettet,
// damit das Spiel per Doppelklick (file://) und offline sofort startet.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

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
console.log(`index.html gebaut (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
