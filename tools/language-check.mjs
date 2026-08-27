// Проверяет язык мира: src/world/language.js.
//
//   node tools/language-check.mjs
//   node tools/language-check.mjs --mod tools/fixture-language.js
//   node tools/language-check.mjs --self
//
// Зачем. Человек 27.08.2026: «строится небольшой город согласно сиду, который имеет свою
// стилистику», «каждый из элементов стиля должен иметь свои вариации». Это два требования,
// которые ТЯНУТ В РАЗНЫЕ СТОРОНЫ, и проверять надо оба разом:
//
//   вариаций много  → форма перестаёт узнаваться, арка больше не арка;
//   вариаций мало   → мир однообразен, всё под копирку.
//
// Гейт мерит ровно это: у одной формы должно быть не меньше пяти РАЗЛИЧИМЫХ вариантов,
// и при этом каждый обязан лежать ближе к своей форме, чем к любой чужой.
//
// Второе, что здесь стережётся, — что язык вообще что-то ограничивает. Язык, берущий все
// восемь форм и все пять групп глифов, — это не язык, а его отсутствие: миры на нём
// получатся одинаковой кашей. Счёт полей в объекте такого не ловит.
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

const SEEDS = 400;
const MARK_KINDS = ["emblem", "string", "formula", "panel", "edge", "rosette", "lattice", "pattern", "marking"];
const GROUPS = ["greek", "math", "arrow", "shape", "digit"];

// Пороги. Каждый выставлен ЗАМЕРОМ на эталоне и с запасом: гейт-мигалка хуже, чем
// свободный гейт, потому что мигалке перестают верить.
const ALPHA_MAX = 3;        // групп глифов в языке
const FORMS_MIN = 3, FORMS_MAX = 4;
const TWIN = 0.55;          // ближе этого два языка — близнецы
const TWIN_SHARE = 0.01;    // доля пар-близнецов на 400 сидах
const SPREAD_MIN = 1.10;    // серединное расхождение языков
const FORM_SHARE_LO = 0.25, FORM_SHARE_HI = 0.65;  // как часто форма попадает в язык
// Сколько вариантов строим у одной формы и сколько обязаны оказаться различимыми.
// Первая редакция требовала «пять различимых из шести». Это требование к УДАЧЕ БРОСКА,
// а не к модулю: город вправе поставить два одинаковых окна подряд, и шесть случайных
// вариаций законно дают две одинаковые. Меряем богатство словаря — сколько разных
// вариаций форма способна дать вообще.
const VARIANTS = 40;
const VARIANTS_MIN = 12;
const VAR_MIN = 0.05;       // насколько два варианта обязаны разойтись
// Слова человека 27.08.2026: «даже если они имеют одну форму, то и размер может
// отличаться точно так же, как и форма». Значит мало, чтобы вариации были различимы
// вообще: разброс размеров у одной формы обязан быть виден глазом.
const SIZE_SPREAD = 1.8;    // во сколько раз крупнейшая вариация больше мельчайшей
const OWN_MARGIN = 1.0;     // вариант обязан быть ближе к своей форме, чем к чужой

// ── арифметика ────────────────────────────────────────────────────────────────

function mean(a) { let s = 0; for (const v of a) s += v; return a.length ? s / a.length : 0; }
function dist(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d += (a[i] - b[i]) * (a[i] - b[i]); return Math.sqrt(d); }

// Отпечаток ЯЗЫКА: пропорции, плотность, веса знаков, алфавит и набор форм.
function printLanguage(L, formKinds) {
  const v = [];
  const p = L.proportion || {};
  for (const k of ['aspect', 'thickness', 'curvature', 'taper', 'spacing']) v.push(Number(p[k]) || 0);
  v.push(Number(L.density) || 0);
  for (const k of MARK_KINDS) v.push((L.markWeights && Number(L.markWeights[k])) || 0);
  for (const g of GROUPS) v.push(L.alphabet && L.alphabet.includes(g) ? 1 : 0);
  for (const f of formKinds) v.push(L.forms && L.forms.includes(f) ? 1 : 0);
  return v;
}

// Отпечаток ОБЛАКА: восемь чисел, по которым форма либо узнаётся, либо нет.
function printCloud(v) {
  const n = v.count;
  const xs = [], ys = [], zs = [];
  const out = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    v.fill(i, out);
    if (!Number.isFinite(out[0]) || !Number.isFinite(out[1]) || !Number.isFinite(out[2])) return null;
    xs.push(out[0]); ys.push(out[1]); zs.push(out[2]);
  }
  const span = (a) => Math.max(...a) - Math.min(...a);
  const sx = Math.max(1e-6, span(xs)), sy = Math.max(1e-6, span(ys)), sz = Math.max(1e-6, span(zs));
  const big = Math.max(sx, sy, sz);
  const mx = mean(xs), my = mean(ys), mz = mean(zs);

  const rs = [];
  for (let i = 0; i < n; i++) rs.push(Math.hypot(xs[i] - mx, ys[i] - my, zs[i] - mz));
  const rmax = Math.max(...rs, 1e-6);
  let core = 0, shell = 0;
  for (const r of rs) { if (r < rmax * 0.3) core++; if (r > rmax * 0.75) shell++; }

  // Занятость габарита: сколько ячеек сетки заняты. Проволочный контур занимает мало,
  // набивка объёма — много.
  const cells = new Set();
  for (let i = 0; i < n; i++) {
    cells.add(Math.round(((xs[i] - mx) / big) * 9) + ':'
      + Math.round(((ys[i] - my) / big) * 9) + ':'
      + Math.round(((zs[i] - mz) / big) * 9));
  }

  // Профиль по высоте: где вещество — внизу, посередине или наверху. Этим шпиль
  // отличается от ветви, а тетраэдр от ромба.
  const lo = Math.min(...ys);   // нужен и профилю, и поэтажной пустоте ниже
  let lowRaw = 0, highRaw = 0;
  for (const y of ys) {
    const t = (y - lo) / sy;
    if (t < 1 / 3) lowRaw++;
    if (t > 2 / 3) highRaw++;
  }

  // Пустота по горизонтали: у арки и кольца середина — проём.
  const hs = [];
  for (let i = 0; i < n; i++) hs.push(Math.hypot(xs[i] - mx, zs[i] - mz));
  const hmax = Math.max(...hs, 1e-6);
  let hcore = 0, hwide = 0;
  for (const h of hs) { if (h < hmax * 0.3) hcore++; if (h < hmax * 0.55) hwide++; }
  // Лежит ли вещество ПО ОКРУЖНОСТИ. У кольца все точки на одном удалении от оси,
  // у решётки удаление гуляет от нуля до края. Без этого признака кольцо с тремя
  // вложенными ободами уезжало в решётку: оба плоские, обоих середина пуста примерно
  // одинаково. Самопроверка поймала это, как только у кольца появились вариации.
  const hm = mean(hs);
  let hacc = 0;
  for (const h of hs) hacc += (h - hm) * (h - hm);
  const hspread = hm > 1e-6 ? Math.min(1, Math.sqrt(hacc / n) / hm) : 1;

  // Пустота оси НА ТРЁХ ВЫСОТАХ, а не в среднем. Среднее смазывает главное различие:
  // у башни ось свободна на всех уровнях, у шпиля занята только вверху, у октаэдра
  // и вверху и внизу, у кроны наоборот — внизу ствол, вверху развал. Пока считалось
  // среднее, плита уезжала в ромб на десяти языках из четырнадцати.
  const BANDS = 6;
  const bandR = [], bandMax = new Array(BANDS).fill(1e-6), bandN = new Array(BANDS).fill(0);
  for (let i = 0; i < n; i++) {
    const b = Math.min(BANDS - 1, Math.floor(((ys[i] - lo) / sy) * BANDS));
    bandR.push(b);
    if (hs[i] > bandMax[b]) bandMax[b] = hs[i];
    bandN[b]++;
  }
  const bandCore = new Array(BANDS).fill(0);
  for (let i = 0; i < n; i++) if (hs[i] < bandMax[bandR[i]] * 0.35) bandCore[bandR[i]]++;
  // Постоянство радиуса В ПРОСТРАНСТВЕ. У кольца все точки на одном удалении от центра
  // при ЛЮБОМ наклоне, у решётки удаление гуляет от нуля до края. Горизонтальный признак
  // этого не даёт: наклонённое кольцо в проекции на пол растягивается и по нему читается
  // решёткой. Широкий прогон уводил кольцо в решётку на девяти языках из четырнадцати.
  const rm = mean(rs);
  let racc = 0;
  for (const r of rs) racc += (r - rm) * (r - rm);
  const rspread = rm > 1e-6 ? Math.min(1, Math.sqrt(racc / n) / rm) : 1;
  const share = (b) => (bandN[b] ? bandCore[b] / bandN[b] : 0);
  // У ПЛОСКОГО предмета профиля по высоте нет вовсе, и мерить его нельзя: размах по
  // высоте у него около нуля, деление на него даёт "всё вещество внизу" — бессмыслицу,
  // которая уводит плоское кольцо к чужим формам. Широкий прогон поймал: девять языков
  // из четырнадцати. Плоскому предмету ставим равномерный профиль.
  const flat = sy < big * 0.02;
  const low = flat ? 1 / 3 : lowRaw / n;
  const high = flat ? 1 / 3 : highRaw / n;
  const hollowLow = flat ? hcore / n : (share(0) + share(1)) / 2;
  const hollowMid = flat ? hcore / n : (share(2) + share(3)) / 2;
  const hollowTop = flat ? hcore / n : (share(4) + share(5)) / 2;

  // Отпечаток БЕЗРАЗМЕРНЫЙ: маленькая арка — всё ещё арка, и опознание формы не должно
  // зависеть от её размера. Габарит возвращается отдельно: он нужен другой проверке —
  // «вариации различимы», где разный размер как раз и есть вариация. Первый прогон
  // самопроверки поймал это на ветви: шесть вариаций отличались только размером, и
  // безразмерный отпечаток честно показал их одной и той же.
  return { f: [sy / big, sz / big, core / n, shell / n, cells.size / n, low, high,
               hcore / n, hwide / n, hspread, rspread, hollowLow, hollowMid, hollowTop],
           size: Math.log(Math.max(1e-6, big)) * 0.25 };
}

// ── проверка ──────────────────────────────────────────────────────────────────

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

  if (typeof mod.buildLanguage !== 'function') return ['нет buildLanguage(seedCode)'];
  if (!Array.isArray(mod.FORM_KINDS) || mod.FORM_KINDS.length < 6) return ['нет списка FORM_KINDS'];
  const FORMS = mod.FORM_KINDS;

  // 1. Устройство языка на одном сиде
  let L0;
  try { L0 = mod.buildLanguage('TEST-TEST-TEST'); }
  catch (e) { return ['buildLanguage упал: ' + e.message]; }
  if (!L0) return ['buildLanguage вернул пустое'];

  for (const f of ['alphabet', 'glyphs', 'forms', 'proportion', 'density', 'markWeights']) {
    if (L0[f] === undefined) bad('в языке нет поля ' + f);
  }
  if (typeof L0.variantOf !== 'function') bad('в языке нет variantOf(form, rng)');
  if (problems.length) return problems;

  // 2. Язык обязан ОГРАНИЧИВАТЬ — иначе это не язык
  const langs = [];
  const seeds = [];
  for (let i = 0; i < SEEDS; i++) seeds.push('S' + i + '-' + ((i * 2654435761) % 99991));
  for (const s of seeds) {
    let L;
    try { L = mod.buildLanguage(s); } catch (e) { bad('buildLanguage упал на сиде ' + s + ': ' + e.message); break; }
    langs.push(L);
  }
  if (problems.length) return problems;

  let alphaBad = 0, formsBad = 0, glyphBad = 0, weightBad = 0;
  for (const L of langs) {
    if (!Array.isArray(L.alphabet) || L.alphabet.length < 2 || L.alphabet.length > ALPHA_MAX) alphaBad++;
    if (!Array.isArray(L.forms) || L.forms.length < FORMS_MIN || L.forms.length > FORMS_MAX) formsBad++;
    // Глифы обязаны лежать внутри выбранных групп: алфавит должен быть настоящим
    // ограничением, а не подписью.
    if (Array.isArray(L.glyphs) && Array.isArray(L.alphabet)) {
      const allowed = new Set();
      for (const g of L.alphabet) {
        const r = (mod.GLYPH_GROUPS || {})[g];
        if (r) for (let i = 0; i < r[1]; i++) allowed.add(r[0] + i);
      }
      if (allowed.size && L.glyphs.some((g) => !allowed.has(g))) glyphBad++;
    }
    const ws = MARK_KINDS.map((k) => (L.markWeights && Number(L.markWeights[k])) || 0);
    if (Math.abs(ws.reduce((a, b) => a + b, 0) - 1) > 0.01) weightBad++;
  }
  say('алфавит: групп 2..' + ALPHA_MAX + ' — нарушений ' + alphaBad
    + '; формы ' + FORMS_MIN + '..' + FORMS_MAX + ' — нарушений ' + formsBad);
  if (alphaBad) {
    bad('на ' + alphaBad + ' сидах алфавит не 2..' + ALPHA_MAX + ' групп. Язык, берущий все '
      + 'группы, ничего не ограничивает — все миры будут написаны одним и тем же');
  }
  if (formsBad) {
    bad('на ' + formsBad + ' сидах форм не ' + FORMS_MIN + '..' + FORMS_MAX
      + '. Язык, берущий все восемь форм, — это не язык, а его отсутствие');
  }
  if (glyphBad) bad('на ' + glyphBad + ' сидах в языке есть глифы вне его же алфавита');
  if (weightBad) bad('на ' + weightBad + ' сидах веса знаков не дают в сумме единицу');

  // 3. Разные сиды — разные языки. Порог задан на ДОЛЮ пар-близнецов, а не на
  //    ближайшую пару: у четырёхсот языков ближайшая пара всегда близка, это
  //    свойство выборки, а не проекта. Требовать от неё порога — писать мигалку.
  const prints = langs.map((L) => printLanguage(L, FORMS));
  let twins = 0, pairs = 0;
  const sample = [];
  for (let i = 0; i < prints.length; i++) {
    for (let j = i + 1; j < prints.length; j++) {
      const d = dist(prints[i], prints[j]);
      pairs++;
      if (d < TWIN) twins++;
      if ((i * 31 + j) % 97 === 0) sample.push(d);
    }
  }
  sample.sort((a, b) => a - b);
  const median = sample.length ? sample[Math.floor(sample.length / 2)] : 0;
  const twinShare = pairs ? twins / pairs : 1;
  say('языки на ' + SEEDS + ' сидах: серединное расхождение ' + median.toFixed(3)
    + ' (нужно ' + SPREAD_MIN + '), близнецов ' + (twinShare * 100).toFixed(2)
    + '% (допуск ' + (TWIN_SHARE * 100) + '%)');
  if (twinShare > TWIN_SHARE) {
    bad('языков-близнецов ' + (twinShare * 100).toFixed(2) + '% при допуске '
      + (TWIN_SHARE * 100) + '%: сид почти не меняет стилистику');
  }
  if (median < SPREAD_MIN) {
    bad('серединное расхождение языков ' + median.toFixed(3) + ' при пороге ' + SPREAD_MIN
      + ': миры получатся однообразными');
  }

  // 4. Все формы в ходу и ни одна не съедает набор. Ожидание при 3-4 формах из
  //    восьми — около 44% миров на форму; порог поставлен вокруг него.
  const used = {};
  for (const f of FORMS) used[f] = 0;
  for (const L of langs) for (const f of (L.forms || [])) if (used[f] !== undefined) used[f]++;
  const shares = FORMS.map((f) => used[f] / langs.length);
  const loF = Math.min(...shares), hiF = Math.max(...shares);
  say('доля миров на форму: от ' + (loF * 100).toFixed(0) + '% до ' + (hiF * 100).toFixed(0)
    + '% (нужно ' + (FORM_SHARE_LO * 100) + '..' + (FORM_SHARE_HI * 100) + '%)');
  if (loF < FORM_SHARE_LO) {
    bad('форма ' + FORMS[shares.indexOf(loF)] + ' встречается всего в '
      + (loF * 100).toFixed(0) + '% миров — она есть в списке и почти не бывает в деле');
  }
  if (hiF > FORM_SHARE_HI) {
    bad('форма ' + FORMS[shares.indexOf(hiF)] + ' встречается в ' + (hiF * 100).toFixed(0)
      + '% миров и подминает набор');
  }

  // 5. Вариации: пять различимых, и каждая узнаётся своей формой.
  //    Это ядро задачи, и два требования тянут в разные стороны.
  // Банк образцов вместо ОДНОГО среднего на форму. Среднее годится, только пока форма
  // одногорбая: у кольца есть лежачие и наклонённые вариации, и ни одна не лежит рядом
  // со своим же средним — среднее оказывается между ними, в пустоте. Сравниваем с
  // БЛИЖАЙШИМ родственником: вариация обязана быть ближе к какому-то образцу своей
  // формы, чем к любому образцу чужой.
  const bank = {};
  {
    const acc = {};
    for (const f of FORMS) acc[f] = [];
    for (let li = 0; li < Math.min(40, langs.length); li++) {
      const L = langs[li];
      for (const f of FORMS) {
        const v = L.variantOf(f, seededRng(li * 7 + f.length));
        if (!v || !v.count || typeof v.fill !== 'function') continue;
        const p = printCloud(v);
        if (p) acc[f].push(p.f);
      }
    }
    for (const f of FORMS) {
      if (!acc[f].length) { bad('форма ' + f + ': не удалось построить ни одной вариации'); continue; }
      bank[f] = acc[f];
    }
  }
  if (problems.length) return problems;

  let worstVar = { form: '', n: 99 };
  let worstSize = { form: '', r: 999 };
  let strays = 0, strayWho = '';
  // Проверяем вариации у ВСЕХ восьми форм, а не только у трёх из одного языка. Иначе
  // модуль с богатыми вариациями трёх форм и штамповкой остальных пяти пройдёт молча.
  // Для каждой формы берём язык, который её содержит.
  const hostOf = {};
  for (const f of FORMS) {
    const L = langs.find((x) => (x.forms || []).includes(f));
    if (L) hostOf[f] = L; else bad('форма ' + f + ' не встретилась ни в одном из ' + SEEDS + ' языков');
  }
  for (const f of Object.keys(hostOf)) {
    const host = hostOf[f];
    const ps = [];
    const sizes = [];
    for (let k = 0; k < VARIANTS; k++) {
      const v = host.variantOf(f, seededRng(1000 + k * 13 + f.length * 977));
      const p = printCloud(v);
      if (!p) { bad('форма ' + f + ': среди координат вариации есть не-числа'); continue; }
      ps.push(p.f.concat([p.size]));
      sizes.push(Math.exp(p.size / 0.25));
      // Вариация обязана оставаться собой: ближе к своей форме, чем к любой чужой.
      const near = (g) => {
        let b = Infinity;
        for (const q of (bank[g] || [])) { const d = dist(p.f, q); if (d < b) b = d; }
        return b;
      };
      const own = near(f);
      let bestOther = Infinity, who = '';
      for (const g of FORMS) {
        if (g === f) continue;
        const d = near(g);
        if (d < bestOther) { bestOther = d; who = g; }
      }
      if (own > bestOther * OWN_MARGIN) { strays++; strayWho = f + ' уехала в ' + who; }
    }
    // Разброс размеров у одной формы: не только «различимы», но и «разного размера».
    if (sizes.length > 1) {
      const ratio = Math.max(...sizes) / Math.max(1e-6, Math.min(...sizes));
      if (ratio < worstSize.r) worstSize = { form: f, r: ratio };
    }

    // Сколько среди шести действительно различимых
    const keep = [];
    for (const p of ps) {
      if (keep.every((q) => dist(p, q) >= VAR_MIN)) keep.push(p);
    }
    if (keep.length < worstVar.n) worstVar = { form: f, n: keep.length };
  }
  say('разных вариаций у самой бедной формы (' + worstVar.form + '): ' + worstVar.n
    + ' из ' + VARIANTS + ' бросков (нужно ' + VARIANTS_MIN + ')');
  if (worstVar.n < VARIANTS_MIN) {
    bad('форма ' + worstVar.form + ' даёт всего ' + worstVar.n + ' разных вариаций на '
      + VARIANTS + ' бросков при пороге ' + VARIANTS_MIN
      + ': «каждый элемент стиля имеет свои вариации» не выполнено');
  }
  say('разброс размеров у самой ровной формы (' + worstSize.form + '): '
    + worstSize.r.toFixed(2) + 'x (нужно ' + SIZE_SPREAD + 'x)');
  if (worstSize.r < SIZE_SPREAD) {
    bad('у формы ' + worstSize.form + ' крупнейшая вариация больше мельчайшей всего в '
      + worstSize.r.toFixed(2) + ' раза при пороге ' + SIZE_SPREAD
      + '. Одинаковые по размеру элементы читаются штамповкой, а не городом');
  }
  say('вариаций, уехавших в чужую форму: ' + strays);
  if (strays) {
    bad('вариация уехала в чужую форму (' + strayWho + '), таких ' + strays
      + '. Вариация обязана оставаться собой: арка любых пропорций — всё ещё арка');
  }

  // 6. Детерминизм — проверяется всегда, а не только когда всё чисто
  try {
    const a = JSON.stringify(printLanguage(mod.buildLanguage('SEED-AAAA-1111'), FORMS));
    const b = JSON.stringify(printLanguage(mod.buildLanguage('SEED-AAAA-1111'), FORMS));
    const c = JSON.stringify(printLanguage(mod.buildLanguage('SEED-BBBB-2222'), FORMS));
    say('тот же сид даёт тот же язык: ' + (a === b));
    if (a !== b) bad('тот же сид даёт другой язык — нарушен инвариант 1');
    if (a === c) bad('другой сид даёт тот же язык — сид ни на что не влияет');
  } catch (e) {
    bad('проверка детерминизма упала: ' + e.message);
  }

  return problems;
}

// splitmix32: перемешивание на КАЖДОМ шаге, а не только на затравке. У xorshift с
// близкими затравками отдельные позиции потока остаются связанными — шестое число у
// шести соседних затравок ложилось в узкую полосу, и все шесть вариаций получали одно
// строение. Гейт винил модуль в том, что натворил его собственный генератор; в этой
// сессии такое случилось дважды, поэтому здесь стоит генератор без этой слабости.
function seededRng(salt) {
  let s = Math.imul(salt ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
  };
}

const MUTATIONS = [
  ['twins', 'все сиды дают один язык', 'близнец'],
  ['allforms', 'язык берёт все восемь форм', 'не язык'],
  ['bigalphabet', 'язык берёт все пять групп глифов', 'алфавит не'],
  ['onevariant', 'variantOf не смотрит на сид', 'разных вариаций'],
  ['wildvariant', 'вариация уезжает в чужую форму', 'уехала в чужую форму'],
  ['random', 'Math.random вместо сеяного PRNG', 'тот же сид'],
];

if (process.argv.includes('--self')) {
  process.exit(await selfTest({
    title: 'language-check — язык мира',
    fixture: 'tools/fixture-language.js',
    mutations: MUTATIONS,
    runOnce,
  }));
} else {
  const problems = await runOnce(arg('mod', 'src/world/language.js'));
  if (problems.length) {
    console.log('');
    for (const p of problems) console.log('  x ' + p);
    console.log('');
    console.log('LANGUAGE_FAIL');
    process.exit(1);
  }
  console.log('LANGUAGE_OK');
}
