// Проверяет грамматику сборки: src/world/grammar.js.
//
//   node tools/grammar-check.mjs
//   node tools/grammar-check.mjs --mod tools/fixture-grammar.js
//   node tools/grammar-check.mjs --self
//
// Зачем. Арка — это элемент. Аркада — это арка, повторённая рядом с убыванием вглубь.
// В проекте есть формы и нет ничего, что складывало бы их в постройку: пятнадцать
// одиноких предметов не собираются в здание, сколько их ни ставь. Отсюда и замечание
// человека 27.08.2026: «оно друг на друга всё накладывается и получается куча мала».
//
// Главное, что здесь стережётся, — постройка ЧИТАЕТСЯ ОДНОЙ. Проверка «правило вернуло
// семь мест» этого не даёт: её проходит расстановка, разбросавшая копии по всему миру.
// Меряем зазоры между соседями и связность: если копию можно убрать, и никто не заметит,
// это не постройка.
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

const RULE_NAMES = ['row', 'axis', 'mirror', 'stack', 'grid', 'fan'];
const ELEMENT = { footprint: [40, 90, 30] };

// Пороги выставлены замером на эталоне и с запасом.
const GAP_MAX = 1.0;      // зазор между соседями — не больше их же радиуса
// Кусков в постройке не больше двух: две аркады зала стоят порознь по сторонам нефа,
// и это законно. Три и больше — уже не постройка, а расставленные предметы.
const GROUPS_MAX = 2;
const LINE_DEV = 0.06;    // отклонение от прямой, доля длины постройки
const MIRROR_DEV = 0.03;  // насколько левая половина вправе отличаться от правой
const STACK_GAP = 0.12;   // провал между ярусами, доля высоты яруса
const FAN_DEV = 0.06;     // разброс радиуса у веера
const PAIR_MIN = 0.30;    // насколько два правила обязаны расходиться отпечатком

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// Полуразмер копии ВДОЛЬ направления до соседа — опора коробки. Мерить зазор от
// max(габарит) неверно у вытянутого элемента: у шпиля 25x200x25 наибольший размер —
// высота, и по ней два шпиля, стоящие в метре друг от друга, считались бы слипшимися,
// а две плиты 120x40x120 — разнесёнными. Широкий прогон поймал это сразу.
function support(p, foot, dir) {
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  // Направление переводится в СОБСТВЕННЫЕ оси копии: копия может быть повёрнута, и
  // тогда её протяжённость вдоль хода совсем другая. У зала колонны развёрнуты на
  // прямой угол, и без поворота замер считал их разнесёнными там, где они впритык.
  const t = -(p.turn || 0);
  const c = Math.cos(t), s = Math.sin(t);
  const dx = (dir[0] / l) * c - (dir[2] / l) * s;
  const dz = (dir[0] / l) * s + (dir[2] / l) * c;
  return 0.5 * p.scale * (Math.abs(dx) * foot[0]
    + Math.abs(dir[1] / l) * foot[1] + Math.abs(dz) * foot[2]);
}

// ── связность постройки ───────────────────────────────────────────────────────
// Копии считаются соседями, если зазор между ними не больше радиуса большей из них.
// Постройка обязана быть связной: иначе это две постройки или россыпь.

function neighbours(places, foot) {
  const n = places.length;
  const adj = Array.from({ length: n }, () => []);
  let worstGap = 0;
  for (let i = 0; i < n; i++) {
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dir = [places[j].at[0] - places[i].at[0], places[j].at[1] - places[i].at[1],
                   places[j].at[2] - places[i].at[2]];
      const ri = support(places[i], foot, dir), rj = support(places[j], foot, dir);
      const gap = (dist3(places[i].at, places[j].at) - (ri + rj)) / Math.max(1e-6, Math.max(ri, rj));
      if (gap <= GAP_MAX) adj[i].push(j);
      if (gap < best) best = gap;
    }
    if (best > worstGap) worstGap = best;
  }
  // Считаем ГРУППЫ, а не требуем единой связности. У зала две аркады стоят порознь по
  // сторонам нефа — это и есть зал, а не россыпь: между ними проход, и так задумано.
  // Требовать от них касания значит запретить зал. Что действительно нельзя — это
  // одинокая копия и десяток разрозненных кусков.
  const seen = new Set();
  let groups = 0, lonely = 0;
  for (let start = 0; start < n; start++) {
    if (seen.has(start)) continue;
    groups++;
    const stack = [start];
    seen.add(start);
    let size = 0;
    while (stack.length) {
      const k = stack.pop();
      size++;
      for (const m of adj[k]) if (!seen.has(m)) { seen.add(m); stack.push(m); }
    }
    if (size === 1) lonely++;
  }
  return { groups, lonely, worstGap };
}

// Отклонение центров от прямой, в долях длины постройки.
function lineDeviation(places) {
  const n = places.length;
  if (n < 3) return 0;
  const a = places[0].at, b = places[n - 1].at;
  const len = dist3(a, b);
  if (len < 1e-6) return 1;
  const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len];
  let worst = 0;
  for (const p of places) {
    const v = [p.at[0] - a[0], p.at[1] - a[1], p.at[2] - a[2]];
    const t = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
    const off = Math.hypot(v[0] - d[0] * t, v[1] - d[1] * t, v[2] - d[2] * t);
    if (off / len > worst) worst = off / len;
  }
  return worst;
}

// Отпечаток расстановки: по нему правила либо разные, либо одно и то же под разными
// именами. Тот же приём, которым ловили близнецов среди форм и знаков.
function printPlacement(r) {
  const ps = r.places;
  const n = ps.length;
  const xs = ps.map((p) => p.at[0]), ys = ps.map((p) => p.at[1]), zs = ps.map((p) => p.at[2]);
  const span = (a) => Math.max(...a) - Math.min(...a);
  const sx = span(xs), sy = span(ys), sz = span(zs);
  const big = Math.max(sx, sy, sz, 1e-6);
  const scales = ps.map((p) => p.scale);
  const turns = ps.map((p) => Math.abs(p.turn || 0));
  // Доля пар, стоящих зеркально по x
  let mirrored = 0;
  const cx = mean(xs);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (Math.abs((xs[i] - cx) + (xs[j] - cx)) < big * 0.02
        && Math.abs(zs[i] - zs[j]) < big * 0.02) { mirrored++; break; }
    }
  }
  return [
    sx / big, sy / big, sz / big,
    Math.max(...scales) - Math.min(...scales),
    lineDeviation(ps),
    mirrored / n,
    mean(turns) / Math.PI,
    new Set(zs.map((v) => Math.round((v / big) * 8))).size / n,
  ];
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
  if (typeof mod.assemble !== 'function') return ['нет assemble(rule, element, seed, opts)'];
  if (!Array.isArray(mod.RULES)) return ['нет списка RULES'];

  const missing = RULE_NAMES.filter((r) => !mod.RULES.includes(r));
  if (missing.length) bad('не хватает правил сборки: ' + missing.join(', '));
  if (problems.length) return problems;

  const built = {};
  for (const rule of RULE_NAMES) {
    let r;
    try { r = mod.assemble(rule, ELEMENT, 'TEST-TEST-TEST', {}); }
    catch (e) { bad('assemble("' + rule + '") упал: ' + e.message); continue; }
    if (!r || !Array.isArray(r.places) || r.places.length < 3) {
      bad(rule + ': мест меньше трёх — это не постройка');
      continue;
    }
    for (const p of r.places) {
      if (!Array.isArray(p.at) || p.at.length !== 3 || !p.at.every(Number.isFinite)) {
        bad(rule + ': среди координат есть не-числа'); break;
      }
      if (!(p.scale > 0)) { bad(rule + ': масштаб копии не положителен'); break; }
    }
    built[rule] = r;
  }
  if (problems.length) return problems;

  const foot = ELEMENT.footprint;

  // 1. Постройка читается ОДНОЙ. Главная проверка: без неё повтор превращается в россыпь.
  for (const rule of RULE_NAMES) {
    const r = built[rule];
    const { groups, lonely, worstGap } = neighbours(r.places, foot);
    say(rule + ': копий ' + r.places.length + ', кусков ' + groups
      + ', худший зазор до ближайшего соседа ' + worstGap.toFixed(2)
      + ' радиуса (допуск ' + GAP_MAX + ')');
    if (groups > GROUPS_MAX || lonely) {
      bad(rule + ': постройка не читается одной — распалась на ' + groups + ' кусков'
        + (lonely ? ', из них одиноких ' + lonely : '')
        + ' при допуске ' + GROUPS_MAX + '. До ближайшего соседа ' + worstGap.toFixed(2)
        + ' радиуса. Разнесённые копии это россыпь, а не постройка');
    }
  }

  // 2. Ряд убывает и идёт прямо: анфилада обязана уходить вглубь
  {
    const r = built.row;
    const s = r.places.map((p) => p.scale);
    let mono = true;
    for (let i = 1; i < s.length; i++) if (s[i] > s[i - 1] + 1e-9) mono = false;
    const shrink = s[0] / s[s.length - 1];
    const dev = lineDeviation(r.places);
    say('ряд: убывание ' + shrink.toFixed(2) + 'x, монотонно ' + mono
      + ', отклонение от прямой ' + dev.toFixed(3));
    if (!mono || shrink < 1.15) {
      bad('ряд не убывает (' + shrink.toFixed(2) + 'x, монотонно ' + mono
        + '): анфилада без убывания не уходит вглубь, а стоит стеной');
    }
    if (dev > LINE_DEV) bad('ряд не идёт прямо: отклонение ' + dev.toFixed(3) + ' при допуске ' + LINE_DEV);
  }

  // 3. Кольца соосны: туннель обязан быть прямым
  {
    const r = built.axis;
    const dev = lineDeviation(r.places);
    const s = r.places.map((p) => p.scale);
    const vary = Math.max(...s) / Math.min(...s);
    say('ось: отклонение центров от прямой ' + dev.toFixed(3) + ' (допуск ' + LINE_DEV + ')');
    if (dev > LINE_DEV) {
      bad('кольца не соосны: центры отходят от прямой на ' + dev.toFixed(3)
        + ' при допуске ' + LINE_DEV + '. Кривой туннель не читается туннелем');
    }
    if (vary > 1.15) bad('кольца разного размера (' + vary.toFixed(2) + 'x): это уже ряд, а не ось');
  }

  // 4. Зеркало точное
  {
    const r = built.mirror;
    // Симметрия мерится от ОБЪЯВЛЕННОЙ ОСИ постройки, а не от среднего копий. Среднее
    // едет вместе со сдвигом: если сдвинуть правую половину целиком, набор останется
    // симметричным относительно нового среднего, и перекос станет невидим. Самопроверка
    // поймала это сразу: порча «кривое зеркало» проходила гейт насквозь.
    const cx = r.axis && Array.isArray(r.axis.from) && Array.isArray(r.axis.to)
      ? (r.axis.from[0] + r.axis.to[0]) / 2
      : mean(r.places.map((p) => p.at[0]));
    if (!r.axis) bad('зеркало без объявленной оси: симметрию не от чего отмерять');
    const big = Math.max(1e-6, r.bounds ? (r.bounds.max[0] - r.bounds.min[0]) : 1);
    let unmatched = 0;
    for (const p of r.places) {
      const want = 2 * cx - p.at[0];
      const twin = r.places.find((q) => Math.abs(q.at[0] - want) < big * MIRROR_DEV
        && Math.abs(q.at[2] - p.at[2]) < big * MIRROR_DEV
        && Math.abs(q.scale - p.scale) < 0.05);
      if (!twin) unmatched++;
    }
    say('зеркало: без пары ' + unmatched + ' копий из ' + r.places.length);
    if (unmatched) {
      bad('зеркало кривое: ' + unmatched + ' копий из ' + r.places.length
        + ' не имеют отражения. Зал симметричен относительно своей оси, это его признак');
    }
  }

  // 5. Стопка стоит без провалов
  {
    const r = built.stack;
    const sorted = r.places.slice().sort((a, b) => a.at[1] - b.at[1]);
    let worst = 0;
    for (let i = 1; i < sorted.length; i++) {
      const topPrev = sorted[i - 1].at[1] + foot[1] * sorted[i - 1].scale * 0.5;
      const botCur = sorted[i].at[1] - foot[1] * sorted[i].scale * 0.5;
      const gap = (botCur - topPrev) / (foot[1] * sorted[i].scale);
      if (gap > worst) worst = gap;
    }
    say('стопка: худший провал между ярусами ' + worst.toFixed(3) + ' высоты (допуск ' + STACK_GAP + ')');
    if (worst > STACK_GAP) {
      bad('стопка висит: между ярусами провал в ' + worst.toFixed(2)
        + ' высоты яруса при допуске ' + STACK_GAP + '. Ярус стоит на ярусе, а не парит над ним');
    }
  }

  // 6. Решётка ровная
  {
    const r = built.grid;
    const uniq = (vals) => [...new Set(vals.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
    const gaps = (vals) => { const u = uniq(vals); const g = []; for (let i = 1; i < u.length; i++) g.push(u[i] - u[i - 1]); return g; };
    const gx = gaps(r.places.map((p) => p.at[0])), gz = gaps(r.places.map((p) => p.at[2]));
    const even = (g) => (g.length < 2 ? 1 : Math.min(...g) / Math.max(...g));
    say('решётка: ровность шага по x ' + even(gx).toFixed(2) + ', по z ' + even(gz).toFixed(2));
    if (even(gx) < 0.9 || even(gz) < 0.9) bad('решётка неровная: шаг гуляет, кварталы не встанут по улицам');
    if (uniq(r.places.map((p) => p.at[0])).length < 2 || uniq(r.places.map((p) => p.at[2])).length < 2) {
      bad('решётка вырождена в линию: нужны обе оси');
    }
  }

  // 7. Веер вокруг точки
  {
    const r = built.fan;
    const cx = mean(r.places.map((p) => p.at[0])), cz = mean(r.places.map((p) => p.at[2]));
    const rs = r.places.map((p) => Math.hypot(p.at[0] - cx, p.at[2] - cz));
    const dev = (Math.max(...rs) - Math.min(...rs)) / Math.max(1e-6, mean(rs));
    say('веер: разброс радиуса ' + dev.toFixed(3) + ' (допуск ' + FAN_DEV + ')');
    if (dev > FAN_DEV) bad('веер не вокруг точки: радиус гуляет на ' + dev.toFixed(2));
  }

  // 8. Правила различимы отпечатком, а не только именем
  {
    const prints = {};
    for (const rule of RULE_NAMES) prints[rule] = printPlacement(built[rule]);
    let worst = { a: '', b: '', d: 9 };
    for (let i = 0; i < RULE_NAMES.length; i++) {
      for (let j = i + 1; j < RULE_NAMES.length; j++) {
        const A = prints[RULE_NAMES[i]], B = prints[RULE_NAMES[j]];
        let d = 0;
        for (let k = 0; k < A.length; k++) d += (A[k] - B[k]) * (A[k] - B[k]);
        d = Math.sqrt(d);
        if (d < worst.d) worst = { a: RULE_NAMES[i], b: RULE_NAMES[j], d };
      }
    }
    say('ближайшая пара правил: ' + worst.a + ' и ' + worst.b + ', расхождение '
      + worst.d.toFixed(3) + ' (нужно ' + PAIR_MIN + ')');
    if (worst.d < PAIR_MIN) {
      bad('правила ' + worst.a + ' и ' + worst.b + ' неразличимы замером: расхождение '
        + worst.d.toFixed(3) + ' при пороге ' + PAIR_MIN + '. Разные имена, одна расстановка');
    }
  }

  // 9. Детерминизм — проверяется всегда
  try {
    const dump = (seed) => JSON.stringify(mod.assemble('row', ELEMENT, seed, {}).places
      .map((p) => [p.at.map((v) => Math.round(v * 1000)), Math.round(p.scale * 1000)]));
    const a = dump('SEED-AAAA-1111'), b = dump('SEED-AAAA-1111'), c = dump('SEED-BBBB-2222');
    say('тот же сид даёт ту же расстановку: ' + (a === b));
    if (a !== b) bad('тот же сид даёт другую расстановку — нарушен инвариант 1');
    if (a === c) bad('другой сид даёт ту же расстановку — сид ни на что не влияет');
  } catch (e) {
    bad('проверка детерминизма упала: ' + e.message);
  }

  return problems;
}

const MUTATIONS = [
  ['scatter', 'копии разбросаны', 'не читается одной'],
  ['flat', 'ряд не убывает', 'ряд не убывает'],
  ['bent', 'кольца не соосны', 'не соосны'],
  ['lopsided', 'зеркало кривое', 'зеркало кривое'],
  ['float', 'стопка висит', 'стопка висит'],
  ['twins', 'все правила дают одну расстановку', 'неразличимы замером'],
  ['random', 'Math.random вместо сеяного PRNG', 'тот же сид'],
];

if (process.argv.includes('--self')) {
  process.exit(await selfTest({
    title: 'grammar-check — грамматика сборки',
    fixture: 'tools/fixture-grammar.js',
    mutations: MUTATIONS,
    runOnce,
  }));
} else {
  const problems = await runOnce(arg('mod', 'src/world/grammar.js'));
  if (problems.length) {
    console.log('');
    for (const p of problems) console.log('  x ' + p);
    console.log('');
    console.log('GRAMMAR_FAIL');
    process.exit(1);
  }
  console.log('GRAMMAR_OK');
}
