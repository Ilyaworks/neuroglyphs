// Пересобирает seeds.html — по одной ссылке на каждую форму, которая попадает в мир.
// Форму выбирает первый бросок генератора: FIELD_SHAPE_KEYS[floor(rng() * length)],
// поэтому сид под каждую форму подбирается перебором коротких base36-слов.
// Запуск: node tools/gen-seeds-gallery.mjs
import fs from 'node:fs';
import { decodeSeed, validateSeed } from '../src/core/seed.js';
import { FIELD_SHAPE_KEYS } from '../src/world/fieldShapes.js';

const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789';
const found = new Map();
outer:
for (const a of alpha) for (const b of alpha) for (const c of alpha) {
  const w = a + b + c;
  if (!validateSeed(w)) continue;
  let d;
  try { d = decodeSeed(w); } catch { continue; }
  const key = FIELD_SHAPE_KEYS[Math.floor(d.rng() * FIELD_SHAPE_KEYS.length)];
  if (!found.has(key)) found.set(key, w);
  if (found.size === FIELD_SHAPE_KEYS.length) break outer;
}

const rows = FIELD_SHAPE_KEYS.map(k => [k, found.get(k)]).filter(([, s]) => s);
const items = rows.map(([k, s]) => `<li><a href="/?seed=${s}">${k} <code>${s}</code></a></li>`).join('');

fs.writeFileSync('seeds.html', `<!doctype html><meta charset="utf-8"><title>NEUROGLYPHS — формы по сидам</title>
<style>body{background:#07080d;color:#c9d1e0;font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px 32px}
h1{font-size:20px;font-weight:600;margin:0 0 4px}p.sub{color:#7c8699;margin:0 0 24px}
ul{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px}
a{color:#c9d1e0;text-decoration:none;display:block;padding:8px 11px;border:1px solid #1c2130;border-radius:6px;background:#0c0f18}
a:hover{border-color:#3d5fa8;background:#111726;color:#fff}code{color:#6f7b90;font-size:12px}</style>
<h1>NEUROGLYPHS — ${rows.length} форм мира</h1>
<p class="sub">Каждая ссылка открывает мир с сидом, который даёт именно эту форму. Имя формы также видно в HUD и в консоли браузера.</p>
<ul>${items}</ul>
`);
console.log(`форм в мире: ${FIELD_SHAPE_KEYS.length}, ссылок собрано: ${rows.length}`);
const missing = FIELD_SHAPE_KEYS.filter(k => !found.has(k));
if (missing.length) console.log('сид не найден для:', missing.join(' '));
