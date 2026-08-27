// Проверяет план города: src/world/city.js.
//
//   node tools/city-check.mjs
//   node tools/city-check.mjs --mod tools/fixture-city.js
//   node tools/city-check.mjs --self
//
// Слова человека 27.08.2026: «должен быть город, где различные постройки, лабиринты,
// предметы»; «каждый участок должен быть проходим и не иметь тупика»; «это кольца и
// сети, могут быть тупики, но не длинные, дойти до портала можно несколькими путями».
//
// Проверка вида «участков десять» ничего из этого не стережёт. Десять участков можно
// выстроить цепочкой — тогда это коридор с комнатами, а не город; можно налепить друг
// на друга — тогда это каша; можно связать проходами в полроста — тогда по городу не
// пройти. Здесь мерятся свойства ПЛАНА, и главное из них — что путей к выходу больше
// одного: именно оно отличает сеть от цепочки.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { selfTest, freshUrl } from './gate-selftest.mjs';

const arg = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i > -1 ? process.argv[i + 1] : d;
};
const quiet = process.argv.includes('--quiet');
const say = (m) => { if (!quiet) console.log(m); };

const AREAS_MIN = 8, AREAS_MAX = 12;
const PLAYER = 18;
const GATE_MIN = PLAYER * 3;     // ширина прохода
const OVERLAP_MAX = 0.05;        // какая доля объёма участка вправе пересечься с соседом
const ROUTES_MIN = 2;            // сколько РАЗНЫХ путей ведёт к порталу
const SEEDS = 200;
const SINGLE_MAX = 0.25;         // доля городов из одного вида участков

const STUB_LANGUAGE = {
  manner: 'stub', alphabet: ['greek'], glyphs: [0, 1, 2, 3],
  forms: ['slab', 'arch', 'dome'], density: 0.5,
  proportion: { aspect: 0.5, thickness: 0.5, curvature: 0.5, taper: 0.5, spacing: 0.5 },
  markWeights: {},
  variantOf(form) {
    return { form, count: 120, size: 1, aspect: 0.5, thickness: 0.5, curvature: 0.5, taper: 0.5,
      fill(i, out) { out[0] = (i % 7) * 6 - 18; out[1] = (i % 23) * 5; out[2] = (i % 5) * 6 - 12; return out; } };
  },
};

// Сколько объёма двух коробок пересекается.
function overlapShare(a, b) {
  let vol = 1, own = 1;
  for (let k = 0; k < 3; k++) {
    const alo = a.center[k] - a.size[k] / 2, ahi = a.center[k] + a.size[k] / 2;
    const blo = b.center[k] - b.size[k] / 2, bhi = b.center[k] + b.size[k] / 2;
    const o = Math.min(ahi, bhi) - Math.max(alo, blo);
    if (o <= 0) return 0;
    vol *= o;
    own *= a.size[k];
  }
  return own > 0 ? vol / own : 0;
}

// Два непересекающихся по рёбрам пути от входа к порталу. Считаем по потоку: если из
// графа можно вынуть два пути, не делящих ни одного ребра, значит к выходу ведёт больше
// одной дороги, и город — сеть, а не цепочка.
function edgeDisjointRoutes(nodes, edges, from, to, want) {
  const cap = new Map();
  const adj = new Map();
  const kk = (a, b) => a + '>' + b;
  for (const id of nodes) adj.set(id, []);
  for (const [a, b] of edges) {
    if (!adj.has(a) || !adj.has(b)) continue;
    if (!cap.has(kk(a, b))) { cap.set(kk(a, b), 0); adj.get(a).push(b); }
    if (!cap.has(kk(b, a))) { cap.set(kk(b, a), 0); adj.get(b).push(a); }
    cap.set(kk(a, b), cap.get(kk(a, b)) + 1);
    cap.set(kk(b, a), cap.get(kk(b, a)) + 1);
  }
  let flow = 0;
  for (let it = 0; it < want + 2; it++) {
    const prev = new Map([[from, null]]);
    const q = [from];
    let found = false;
    while (q.length && !found) {
      const u = q.shift();
      for (const v of adj.get(u) || []) {
        if (prev.has(v) || cap.get(kk(u, v)) <= 0) continue;
        prev.set(v, u);
        if (v === to) { found = true; break; }
        q.push(v);
      }
    }
    if (!found) break;
    let v = to;
    while (prev.get(v) !== null && prev.get(v) !== undefined) {
      const u = prev.get(v);
      cap.set(kk(u, v), cap.get(kk(u, v)) - 1);
      cap.set(kk(v, u), cap.get(kk(v, u)) + 1);
      v = u;
    }
    flow++;
    if (flow >= want) break;
  }
  return flow;
}

function neighboursOf(city) {
  const adj = new Map();
  for (const a of city.areas) adj.set(a.id, new Set());
  for (const l of city.links) {
    if (adj.has(l.a) && adj.has(l.b)) { adj.get(l.a).add(l.b); adj.get(l.b).add(l.a); }
  }
  return adj;
}

async function runOnce(modPath) {
  const problems = [];
  const bad = (m) => problems.push(m);

  const abs = path.resolve(modPath);
  if (!fs.existsSync(abs)) {
    return ['модуль не загрузился: нет файла ' + modPath + ' — именно это `node --check` и не видит'];
  }
  let mod;
  try { mod = await import(freshUrl(pathToFileURL(abs).href)); }
  catch (e) { return ['модуль не загрузился: ' + e.message + ' — именно это `node --check` и не видит']; }
  if (typeof mod.buildCity !== 'function') return ['нет buildCity(seed, language, opts)'];
  if (!Array.isArray(mod.AREA_KINDS)) return ['нет списка AREA_KINDS'];

  let city;
  try { city = mod.buildCity('TEST-TEST-TEST', STUB_LANGUAGE, {}); }
  catch (e) { return ['buildCity упал: ' + e.message]; }
  if (!city || !Array.isArray(city.areas)) return ['buildCity вернул пустое'];

  // 1. Размер города
  say('участков: ' + city.areas.length + ' (нужно ' + AREAS_MIN + '..' + AREAS_MAX + ')');
  if (city.areas.length < AREAS_MIN || city.areas.length > AREAS_MAX) {
    bad('участков ' + city.areas.length + ', нужно ' + AREAS_MIN + '..' + AREAS_MAX
      + '. Меньше — это не город, больше — по нему не пройти за раз');
  }

  const adj = neighboursOf(city);

  // 2. Связность: из любого участка достижим любой
  {
    const seen = new Set([city.areas[0].id]);
    const st = [city.areas[0].id];
    while (st.length) {
      const u = st.pop();
      for (const v of adj.get(u) || []) if (!seen.has(v)) { seen.add(v); st.push(v); }
    }
    say('связность: достижимо ' + seen.size + ' из ' + city.areas.length);
    if (seen.size !== city.areas.length) {
      bad('город распался: достижимо ' + seen.size + ' участков из ' + city.areas.length
        + '. До остальных не дойти ни одним путём');
    }
  }

  // 3. К порталу ведёт больше одной дороги. ГЛАВНАЯ проверка: она и отличает сеть
  //    от цепочки, а человек просил именно кольца и сети.
  {
    const routes = edgeDisjointRoutes(
      city.areas.map((a) => a.id),
      city.links.map((l) => [l.a, l.b]),
      city.spawn, city.portal, ROUTES_MIN,
    );
    say('разных дорог к порталу: ' + routes + ' (нужно ' + ROUTES_MIN + ')');
    if (routes < ROUTES_MIN) {
      bad('к порталу ведёт всего ' + routes + ' дорога при пороге ' + ROUTES_MIN
        + '. Один путь превращает город в коридор с комнатами, а нужны кольца и сети');
    }
  }

  // 4. Тупики короткие: тупиковый участок не ведёт в другой тупиковый
  {
    // Тупиковый хвост — это ЛИСТ, чей единственный сосед сам не развилка. Первая
    // редакция требовала, чтобы тупиковыми были оба участка сразу, а так бывает только
    // у отдельно висящей пары: настоящий хвост из двух комнат проходил насквозь.
    const dead = city.areas.filter((a) => (adj.get(a.id) || new Set()).size <= 1);
    let long = 0;
    for (const d of dead) {
      for (const n of adj.get(d.id) || []) {
        if ((adj.get(n) || new Set()).size <= 2) long++;
      }
    }
    say('тупиков: ' + dead.length + ', из них длинных ' + long);
    if (long) {
      bad('в городе длинный тупик: ' + long + ' раз тупиковый участок ведёт в другой '
        + 'тупиковый. Человек допустил тупики, но короткие — в один участок');
    }
  }

  // 5. Участки не налезают
  {
    let worst = 0, who = '';
    for (let i = 0; i < city.areas.length; i++) {
      for (let j = i + 1; j < city.areas.length; j++) {
        const o = overlapShare(city.areas[i], city.areas[j]);
        if (o > worst) { worst = o; who = city.areas[i].id + ' и ' + city.areas[j].id; }
      }
    }
    say('худшее пересечение участков: ' + (worst * 100).toFixed(1) + '% (допуск '
      + (OVERLAP_MAX * 100) + '%)');
    if (worst > OVERLAP_MAX) {
      bad('участки ' + who + ' налезают друг на друга на ' + (worst * 100).toFixed(0)
        + '% объёма при допуске ' + (OVERLAP_MAX * 100) + '%. Две постройки в одном месте '
        + 'это каша, а не город');
    }
  }

  // 6. Проходы настоящие и стоят на общей границе
  {
    let narrow = 0, floating = 0;
    const byId = new Map(city.areas.map((a) => [a.id, a]));
    for (const l of city.links) {
      if (!l.gate || !(l.gate.width >= GATE_MIN)) narrow++;
      const a = byId.get(l.a), b = byId.get(l.b);
      if (!a || !b || !l.gate) continue;
      // Проход обязан лежать между центрами соседей, а не внутри одного из них.
      const t = [0, 1, 2].map((k) => {
        const span = b.center[k] - a.center[k];
        return Math.abs(span) < 1e-6 ? 0.5 : (l.gate.center[k] - a.center[k]) / span;
      });
      const along = Math.max(Math.abs(t[0] - 0.5), Math.abs(t[2] - 0.5));
      if (along > 0.35) floating++;
    }
    say('проходы: узких ' + narrow + ', не на границе ' + floating + ' из ' + city.links.length);
    if (narrow) {
      bad('узких проходов ' + narrow + ': ширина меньше ' + GATE_MIN
        + ' единиц, а это три роста игрока. В такую щель не пройти');
    }
    if (floating) {
      bad('проходов не на общей границе ' + floating + ': проём висит посреди участка, '
        + 'а не в стене между соседями');
    }
  }

  // 7. Распределение по сидам: виды участков в ходу, города не из одного вида
  {
    const used = new Map();
    let single = 0, sized = 0, ok = 0;
    for (let i = 0; i < SEEDS; i++) {
      let c;
      try { c = mod.buildCity('C' + i + '-' + ((i * 40503) % 65521), STUB_LANGUAGE, {}); }
      catch (e) { bad('buildCity упал на сиде C' + i + ': ' + e.message); break; }
      if (!c || !c.areas) continue;
      ok++;
      if (c.areas.length >= AREAS_MIN && c.areas.length <= AREAS_MAX) sized++;
      const kinds = new Set(c.areas.map((a) => a.kind));
      if (kinds.size === 1) single++;
      for (const k of kinds) used.set(k, (used.get(k) || 0) + 1);
    }
    if (ok) {
      const missing = mod.AREA_KINDS.filter((k) => !used.has(k));
      say('на ' + ok + ' сидах: размер в норме у ' + sized + ', из одного вида ' + single
        + ', не встретилось видов ' + missing.length);
      if (sized < ok) bad('на ' + (ok - sized) + ' сидах из ' + ok + ' размер города вне ' + AREAS_MIN + '..' + AREAS_MAX);
      if (missing.length) bad('виды участков не встречаются ни разу: ' + missing.join(', '));
      if (single / ok > SINGLE_MAX) {
        bad('городов из одного вида участков ' + ((single / ok) * 100).toFixed(0)
          + '% при допуске ' + (SINGLE_MAX * 100) + '%');
      }
    }
  }

  // 8. Детерминизм — проверяется всегда
  try {
    const dump = (seed) => {
      const c = mod.buildCity(seed, STUB_LANGUAGE, {});
      return JSON.stringify([c.areas.map((a) => [a.kind, a.center.map((v) => Math.round(v))]),
        c.links.map((l) => [l.a, l.b])]);
    };
    const a = dump('SEED-AAAA-1111'), b = dump('SEED-AAAA-1111'), c = dump('SEED-BBBB-2222');
    say('тот же сид даёт тот же город: ' + (a === b));
    if (a !== b) bad('тот же сид даёт другой город — нарушен инвариант 1');
    if (a === c) bad('другой сид даёт тот же город — сид ни на что не влияет');
  } catch (e) {
    bad('проверка детерминизма упала: ' + e.message);
  }

  return problems;
}

const MUTATIONS = [
  ['few', 'участков меньше восьми', 'участков'],
  ['chain', 'цепочка вместо сети', 'ведёт всего'],
  ['deadend', 'длинный тупик', 'длинный тупик'],
  ['overlap', 'участки налезают', 'налезают'],
  ['narrow', 'проходы в полроста', 'узких проходов'],
  ['floating', 'проход посреди участка', 'не на общей границе'],
  ['random', 'Math.random вместо сеяного PRNG', 'тот же сид'],
];

if (process.argv.includes('--self')) {
  process.exit(await selfTest({
    title: 'city-check — план города',
    fixture: 'tools/fixture-city.js',
    mutations: MUTATIONS,
    runOnce,
  }));
} else {
  const problems = await runOnce(arg('mod', 'src/world/city.js'));
  if (problems.length) {
    console.log('');
    for (const p of problems) console.log('  x ' + p);
    console.log('');
    console.log('CITY_FAIL');
    process.exit(1);
  }
  console.log('CITY_OK');
}
