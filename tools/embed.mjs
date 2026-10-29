// Calcule l'empreinte visuelle (DINOv2-small) de chaque photo du catalogue
import fs from 'fs';
import path from 'path';
import { pipeline, env, RawImage } from '@huggingface/transformers';
env.cacheDir = './.hfcache';
const MODEL = 'Xenova/dinov2-small';
const html = fs.readFileSync('marque/index.html', 'utf8');
const m = html.match(/<script id="catalog-data" type="application\/json">([\s\S]*?)<\/script>/);
const cat = JSON.parse(m[1].replace(/<\\\//g, '</'));
const ext = await pipeline('image-feature-extraction', MODEL, { dtype: 'q8' });
const ids = [], vecs = [];
let i = 0;
for (const im of cat.images) {
  const rel = decodeURIComponent(im.url.split('/catalogue-vetements/')[1] || '');
  const thumb = 'thumbs/' + path.basename(rel).replace(/\.[^.]+$/, '') + '.jpg';
  const file = fs.existsSync(rel) ? rel : thumb;
  if (!fs.existsSync(file)) { console.log('manquant', im.id); continue; }
  const img = await RawImage.read(file);
  const out = await ext(img);
  const d = out.dims[2];
  const v = Array.from(out.data.slice(0, d)); // token CLS
  const n = Math.hypot(...v);
  ids.push(im.id); vecs.push(v.map(x => x / n));
  if (++i % 100 === 0) console.log(i);
}
const D = vecs[0].length;
const buf = Buffer.alloc(ids.length * D);
vecs.forEach((v, r) => v.forEach((x, c) => buf.writeInt8(Math.max(-127, Math.min(127, Math.round(x * 127))), r * D + c)));
fs.mkdirSync('imgsearch', { recursive: true });
fs.writeFileSync('imgsearch/emb.bin', buf);
fs.writeFileSync('imgsearch/ids.json', JSON.stringify({ model: MODEL, dim: D, ids }));
// copie du modèle pour le servir depuis le site
const src = path.join('.hfcache', MODEL);
const dst = path.join('models', MODEL);
fs.mkdirSync(dst, { recursive: true });
fs.cpSync(src, dst, { recursive: true });
console.log('ok', ids.length, D);
// petit test : chaque image recadrée doit se retrouver elle-même
let hit = 0; const N = Math.min(40, ids.length);
for (let k = 0; k < N; k++) {
  const r = Math.floor(k * ids.length / N);
  const im = cat.images.find(x => x.id === ids[r]);
  const rel = decodeURIComponent(im.url.split('/catalogue-vetements/')[1]);
  let img = await RawImage.read(fs.existsSync(rel) ? rel : 'thumbs/' + path.basename(rel).replace(/\.[^.]+$/, '') + '.jpg');
  img = await img.crop([Math.floor(img.width*0.1), Math.floor(img.height*0.1), Math.floor(img.width*0.85), Math.floor(img.height*0.9)]);
  const o = await ext(img); const q = Array.from(o.data.slice(0, D)); const qn = Math.hypot(...q);
  let best = -1, bi = -1;
  vecs.forEach((v, j) => { let s = 0; for (let c = 0; c < D; c++) s += v[c] * q[c] / qn; if (s > best) { best = s; bi = j; } });
  if (bi === r) hit++;
}
console.log('auto-test recadrage', hit + '/' + N);
