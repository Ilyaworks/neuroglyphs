// Проверяет палитры настроений: зовёт resolvePalette на всех сочетаниях полей сида
// и смотрит на числа, которые попадут в сцену.
//
//   node tools/palette-check.mjs
//   node tools/palette-check.mjs --mod tools/fixture-palettes.js
//
// Зачем: проверкой N25 был счёт ключей MOODS. Его проходит модуль, у которого
// единственная функция падает на первом же вызове — именно так и приехала первая
// версия: `seed.mood % MOODS.length`, а у объекта нет length, значит NaN и обращение
// к undefined. Браузер тут не нужен: всё, что нужно проверить, — числа и строки.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const rawMod = arg('mod', 'src/art/palettes.js').split('\\').join('/');
const LOCAL = (rawMod.match(/(?:tools|src)\/.*/) || [rawMod.replace(/^\//, '')])[0];

// Пороги.
// Плотность тумана обязана быть в единицах сцены. Сейчас в сцене 0.0011, у портала
// 0.0004. Полоса 0.0003..0.0030 — это от «тумана почти нет» (1% закрытия на 400
// единицах) до «дальний план тонет» (76%). Первая версия палитр давала 0.03..0.14,
// то есть в 27–127 раз больше: на такой плотности мир целиком закрыт уже на 100
// единицах, и проверить это глазами было бы нечем — экран просто пустой.
const FOG_MIN = 0.0003;
const FOG_MAX = 0.0030;
// Контраст глифа к фону по яркости. На эталоне худшая пара — claustrophobic #27272a
// на #030303, разница 36.3. Порог 20 оставляет запас и всё ещё ловит «глифы цвета
// фона», то есть невидимый мир.
const MIN_CONTRAST = 20;
const GLYPH_COLORS = 4;   // столько слотов у uSpectrum в шейдере поля
const MOOD_COUNT = 6;

if (!fs.existsSync(LOCAL)) { console.error(LOCAL + ' не найден'); process.exit(1); }

const problems = [];
const bad = (m) => problems.push(m);

let mod;
try {
  mod = await import(pathToFileURL(path.resolve(LOCAL)).href);
} catch (e) {
  console.error('модуль не импортируется: ' + (e && e.message));
  console.error('PALETTE_FAIL');
  process.exit(1);
}

const hex = /^#[0-9a-fA-F]{6}$/;
const lum = (h) => {
  const n = parseInt(h.slice(1), 16);
  return ((n >> 16 & 255) * 299 + (n >> 8 & 255) * 587 + (n & 255) * 114) / 1000;
};

if (!mod.MOODS || typeof mod.MOODS !== 'object') bad('нет экспорта MOODS');
if (!Array.isArray(mod.PALETTES)) bad('PALETTES — не массив имён настроений');
if (typeof mod.resolvePalette !== 'function') bad('нет экспорта resolvePalette');
if (problems.length) { for (const p of problems) console.error('  x ' + p); console.error('PALETTE_FAIL'); process.exit(1); }

const имена = Object.keys(mod.MOODS);
console.log('настроений: ' + имена.length + ' — ' + имена.join(', '));
if (имена.length !== MOOD_COUNT) bad('настроений ' + имена.length + ', а задача просит ' + MOOD_COUNT);

// Поля сида: mood 3 бита, palette 3 бита. Гоняем все 64 сочетания — на каждом
// resolvePalette обязан вернуть годную палитру, а не упасть.
const собранные = [];
let паденийНет = true;
for (let mood = 0; mood < 8; mood++) {
  for (let palette = 0; palette < 8; palette++) {
    let p = null;
    try {
      p = mod.resolvePalette({ mood, palette, structure: 0, density: 8 });
    } catch (e) {
      if (паденийНет) {
        bad('resolvePalette падает при mood=' + mood + ', palette=' + palette + ': ' + e.message +
          '. Поля сида — целые числа из decodeSeed, других вызовов не будет.');
        паденийНет = false;
      }
      continue;
    }
    if (!p || typeof p !== 'object') { bad('resolvePalette вернул не объект при mood=' + mood); continue; }
    собранные.push({ mood, palette, p });
  }
}
if (!собранные.length) { for (const m of problems) console.error('  x ' + m); console.error('PALETTE_FAIL'); process.exit(1); }
console.log('сочетаний mood×palette пройдено: ' + собранные.length + ' из 64');

const достигнутые = new Set();
let худшийКонтраст = Infinity, гдеХудший = '';
let минТуман = Infinity, максТуман = -Infinity;
for (const { mood, palette, p } of собранные) {
  for (const ключ of ['bg', 'fog', 'rim', 'accent']) {
    if (!hex.test(String(p[ключ]))) bad('поле ' + ключ + ' — не цвет вида #rrggbb: ' + p[ключ] +
      ' (mood=' + mood + ', palette=' + palette + ')');
  }
  if (!Array.isArray(p.glyph) || p.glyph.length !== GLYPH_COLORS) {
    bad('glyph — не ' + GLYPH_COLORS + ' цвета, а ' + (Array.isArray(p.glyph) ? p.glyph.length : typeof p.glyph) +
      '. Столько слотов у uSpectrum в шейдере поля, лишние цвета в кадр не попадут.');
  } else {
    for (const g of p.glyph) {
      if (!hex.test(String(g))) { bad('цвет глифа — не #rrggbb: ' + g); continue; }
      const d = lum(g) - lum(p.bg);
      if (d < худшийКонтраст) { худшийКонтраст = d; гдеХудший = g + ' на ' + p.bg; }
    }
    if (new Set(p.glyph).size !== p.glyph.length) {
      bad('в наборе глифов есть повторы: ' + p.glyph.join(', ') + ' — в кадре будет меньше оттенков, чем заявлено');
    }
  }
  if (!Number.isFinite(p.fogDensity)) bad('fogDensity — не число: ' + p.fogDensity);
  else { минТуман = Math.min(минТуман, p.fogDensity); максТуман = Math.max(максТуман, p.fogDensity); }
  достигнутые.add(JSON.stringify([p.bg, p.rim, p.accent]));
}

console.log('плотность тумана: ' + минТуман + ' … ' + максТуман + ' (полоса сцены ' + FOG_MIN + ' … ' + FOG_MAX + ')');
console.log('худший контраст глифа к фону: ' + (Number.isFinite(худшийКонтраст) ? худшийКонтраст.toFixed(1) : '—') +
  ' (' + гдеХудший + '), нужно не меньше ' + MIN_CONTRAST);
console.log('различимых настроений по фону и обводке: ' + достигнутые.size + ', нужно ' + MOOD_COUNT);

if (Number.isFinite(минТуман) && (минТуман < FOG_MIN || максТуман > FOG_MAX)) {
  bad('плотность тумана вне единиц сцены: ' + минТуман + ' … ' + максТуман + ' при полосе ' +
    FOG_MIN + ' … ' + FOG_MAX + '. В сцене стоит 0.0011 по FogExp2, и уже на 0.03 мир ' +
    'целиком закрыт туманом на сотне единиц — экран пустой.');
}
if (Number.isFinite(худшийКонтраст) && худшийКонтраст < MIN_CONTRAST) {
  bad('глифы сливаются с фоном: разница яркости ' + худшийКонтраст.toFixed(1) + ' (' + гдеХудший +
    ') при пороге ' + MIN_CONTRAST);
}
if (достигнутые.size < MOOD_COUNT) {
  bad('до сцены доходит только ' + достигнутые.size + ' настроений из ' + MOOD_COUNT +
    ': остальные недостижимы ни при каком сиде. Обычно это остаток от деления на неверную длину.');
}

// Детерминизм: тот же сид — та же палитра.
const a = JSON.stringify(mod.resolvePalette({ mood: 3, palette: 2 }));
const b = JSON.stringify(mod.resolvePalette({ mood: 3, palette: 2 }));
if (a !== b) bad('одни и те же поля сида дали разные палитры — нарушено правило 7');
// Разные поля — разные палитры: иначе поле palette ни на что не влияет.
const наборы = new Set(собранные.map(({ p }) => p.glyph.join(',')));
console.log('различимых наборов цветов глифа: ' + наборы.size);
if (наборы.size < MOOD_COUNT) {
  bad('наборов цветов глифа всего ' + наборы.size + ': поле palette сида почти ни на что не влияет');
}

if (problems.length) {
  console.error('');
  for (const p of problems) console.error('  x ' + p);
  console.error('');
  console.error('PALETTE_FAIL');
  process.exit(1);
}
console.log('PALETTE_OK');
