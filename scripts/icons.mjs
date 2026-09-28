// Gera os icones do app a partir do baiacu de www/js/puffer.js:
//   node scripts/icons.mjs
// Rode de novo sempre que o desenho mudar. O sharp vem como dependencia do
// wrangler em worker/node_modules (npm --prefix worker install).

import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { icon } from '../www/js/puffer.js';

const sharp = createRequire(new URL('../worker/package.json', import.meta.url))('sharp');
const out = (name) => new URL(`../www/icons/${name}`, import.meta.url);

const svg = icon();
const maskable = icon({ maskable: true });

await writeFile(out('icon.svg'), svg);
for (const [name, source, size] of [
  ['icon-180.png', svg, 180],
  ['icon-192.png', svg, 192],
  ['icon-512.png', svg, 512],
  ['icon-512-maskable.png', maskable, 512],
]) {
  await sharp(Buffer.from(source), { density: 72 * size / 128 }).resize(size, size).png().toFile(out(name).pathname.replace(/^\/(\w:)/, '$1'));
  console.log(name);
}
