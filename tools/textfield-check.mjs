// Проверка поля надписей: гоняет buildFormulaPlane в настоящей странице и смотрит,
// сделана ли надпись из букв или это комок.
//
//   node tools/textfield-check.mjs
//   node tools/textfield-check.mjs --mod tools/fixture-textfield.js
//   node tools/textfield-check.mjs --mod tools/fixture-textfield.js --mutate blob
//
// Зачем: у N30 проверкой стояло
//   node -e "import('./src/world/textField.js').then(m=>console.log(m.FORMULAS.length))"
// то есть подсчёт элементов массива. Это ровно тот класс, которым в проекте уже
// закрывалась пустая работа: у N12 приёмкой было Object.keys(m).length === 3, и
// раскладка на 260 точек вместо 23500 прошла её молча. Двадцать четыре строки в
// массиве не говорят ничего о том, читается ли на кадре хоть одна буква.
//
// Гейт живёт в браузере, потому что буквы растеризует canvas: заглушкой это не
// подменить, а без растеризации любая проверка мерила бы не то.
//
// Ключевые замеры, которых нельзя обмануть, не сделав надпись по-настоящему:
//   * пробел в "A A" даёт пустую полосу посередине (эталон 0.000 против 0.204..0.792);
//   * "MMMM" несёт больше краски, чем "IIII" при той же ширине строки (1.58 против 1.0);
//   * в "M.M" точка стоит ниже буквы (0.46 против 0.005);
//   * сорок знаков ровно в сорок раз шире одного — иначе строка обрезается (1.03 против 0.37).
//
// Доля заполнения габарита в гейт НЕ вошла, хотя просилась: замер показал, что честная
// надпись плотнее подделки (0.553 против 0.487 и 0.439), то есть не разделяет их вовсе.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CDP_PORT = 9371;
const PORT = 5173;
const PROBE = 'tools/textfield-probe.html';

const argOf = (name) => {
  const i = process.argv.indexOf(name);
  if (i <= 0) return null;
  let v = process.argv[i + 1] || '';
  if (!v) return null;
  // Git Bash переписывает аргумент, начинающийся со слэша, в путь Windows:
  // "/tools/fixture-textfield.js" приезжает как "C:/Program Files/Git/tools/...".
  // Поэтому принимаем и с ведущим слэшем, и без него, и вырезаем приставку.
  v = v.split('\\').join('/');
  const m = v.match(/(?:^|\/)((?:tools|src)\/.+)$/);
  if (m) v = m[1];
  return v.startsWith('/') ? v : '/' + v;
};
const MOD = argOf('--mod') || '/src/world/textField.js';
const MUTATE = (argOf('--mutate') || '').replace(/^\//, '');

// ---- пороги -------------------------------------------------------------------
// Замеры на эталоне печатаются в выводе; пороги стоят с запасом от них.
const COUNT_TOL = 0.05;        // отклонение от заказанного числа точек
const FILL_MIN = 0.04;         // занято меньше — надписи нет вовсе
const GAP_MAX = 0.06;          // краска в полосе пробела: замер эталона 0.000,
                               // у залитого габарита 0.204..0.792
const SIDES_MIN = 0.15;        // краска слева и справа от пробела: замер эталона 0.35
// "MMMM" против "IIII": при моноширинном шрифте это одна и та же ширина строки, и
// разница в количестве краски может взяться только из пикселей самих букв.
// Замеры: эталон 1.58, заливка клеток 0.99, эллипс вместо текста 1.01. Порог посередине.
const INK_M_OVER_I = 1.25;
// Насколько ниже буквы стоит точка в "M.M", в долях высоты строки.
// Замеры: эталон 0.46, заливка клеток 0.005, эллипс -0.013. Запас трёхкратный.
const BASE_SHIFT_MIN = 0.15;
const ASPECT_RESP = [16, 80];  // 40 знаков против одного: во столько раз шире (эталон 41)
// Ширина обязана расти РОВНО пропорционально числу знаков: ширина сорока знаков,
// делённая на сорок, — это ширина одного. Иначе длинная строка молча обрезается.
// Берём сорок знаков: на двадцати обрезание растром давало 0.748 при пороге 0.80, то
// есть запас 7% — порог на грани шума. На сорока обрезание видно втрое лучше.
// Замеры: эталон 1.03, растр фиксированной ширины 0.37.
const PER_CHAR = [0.80, 1.35];
const EXTENT_RESP = [1.8, 2.2];// вдвое больше extent — вдвое больше надпись
const PLANAR_MAX = 0.02;       // разброс по z в долях ширины надписи
const DISTINCT_MIN = 0.30;     // доля различных положений точек
const MOOD_MIN = 3;            // сколько формул на каждое настроение
const FORMULAS_MIN = 24;

const fails = [];
const bad = (m) => fails.push(m);
const problems = [];

const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('ПРОВАЛ: chrome.exe не найден'); process.exit(1); }
if (!fs.existsSync(PROBE)) { console.error('ПРОВАЛ: нет ' + PROBE); process.exit(1); }
if (!fs.existsSync('.' + MOD)) { console.error('ПРОВАЛ: нет ' + MOD.slice(1)); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-textfield-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--window-size=800,600',
  'about:blank',
], { stdio: 'ignore' });

function bye(ok, lines = []) {
  try { chrome.kill(); } catch {}
  try { srv.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  if (ok) console.log('TEXTFIELD_OK');
  else {
    console.error('');
    for (const l of lines) console.error('  x ' + l);
    console.error('');
    console.error('TEXTFIELD_FAIL');
  }
  process.exit(ok ? 0 : 1);
}

let ws = null;
for (let i = 0; i < 40 && !ws; i++) {
  await sleep(250);
  try { ws = (await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/version')).json()).webSocketDebuggerUrl; } catch {}
}
if (!ws) bye(false, ['Chrome не отдал адрес отладчика']);

const sock = new WebSocket(ws);
let id = 0, sessionId = null;
const pending = new Map();
const send = (method, params = {}, sid = sessionId) => new Promise(res => {
  const n = ++id;
  pending.set(n, res);
  sock.send(JSON.stringify(sid ? { id: n, method, params, sessionId: sid } : { id: n, method, params }));
});
await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
sock.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || {}); pending.delete(m.id); return; }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' &&
      !/favicon/.test(m.params.entry.url || '')) {
    problems.push('ошибка страницы: ' + String(m.params.entry.text).slice(0, 200));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    problems.push('исключение: ' + String((d.exception && d.exception.description) || d.text).slice(0, 200));
  }
};

// Код 200 не значит, что проверен этот проект: на 5173 может висеть чужой сервер
// из прошлого прогона, и тогда гейт читал бы файлы совсем другого каталога.
async function assertOurServer(file) {
  const norm = t => t.split(String.fromCharCode(13)).join('');
  const want = norm(fs.readFileSync(file, 'utf8'));
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/' + file);
      if (norm(await r.text()) === want) return;
      bye(false, ['на порту ' + PORT + ' отвечает не этот проект: ' + file + ' не совпадает '
        + 'с файлом на диске. Сними процесс, который держит порт: netstat -ano | findstr :' + PORT]);
    } catch {}
    await sleep(250);
  }
  bye(false, ['сервер на порту ' + PORT + ' не ответил за 10 секунд']);
}

const targets = await send('Target.getTargets', {}, null);
const page = targets.targetInfos.find(t => t.type === 'page');
sessionId = (await send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, null)).sessionId;
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await assertOurServer(PROBE);
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PROBE });
await sleep(600);

async function evalJson(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    return { error: String((d.exception && d.exception.description) || d.text).slice(0, 400) };
  }
  const v = r.result && r.result.value;
  if (typeof v !== 'string') return { error: 'проба вернула не строку: ' + typeof v };
  try { return JSON.parse(v); } catch { return { error: 'не разобрать ответ пробы' }; }
}

// ---- проба ---------------------------------------------------------------------
// Всё считается в странице и возвращается числами: сетка занятости, габарит,
// занятость по столбцам. Строки-испытания подобраны так, чтобы соврать было нечем.
const PROBE_JS = `(async () => {
  const out = { cases: {} };
  try {
    window.__TEXT_MUTATE = ${JSON.stringify(MUTATE)};
    const m = await import(${JSON.stringify(MOD)} + "?t=" + Math.random());
    out.hasBuild = typeof m.buildFormulaPlane === "function";
    out.formulas = m.FORMULAS;
    if (!out.hasBuild) return JSON.stringify(out);

    const GRID = 48;
    const measure = (text, opts) => {
      const p = m.buildFormulaPlane(text, opts);
      const n = p.count;
      const xs = new Float64Array(n), ys = new Float64Array(n), zs = new Float64Array(n);
      const o = [0, 0, 0];
      let nonFinite = 0;
      for (let i = 0; i < n; i++) {
        o[0] = o[1] = o[2] = NaN;
        p.fill(i, o);
        if (!Number.isFinite(o[0]) || !Number.isFinite(o[1]) || !Number.isFinite(o[2])) nonFinite++;
        xs[i] = o[0]; ys[i] = o[1]; zs[i] = o[2];
      }
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < n; i++) {
        if (xs[i] < minX) minX = xs[i]; if (xs[i] > maxX) maxX = xs[i];
        if (ys[i] < minY) minY = ys[i]; if (ys[i] > maxY) maxY = ys[i];
        if (zs[i] < minZ) minZ = zs[i]; if (zs[i] > maxZ) maxZ = zs[i];
      }
      const w = maxX - minX, h = maxY - minY;
      // Клетка АБСОЛЮТНАЯ — доля от заказанного extent, а не от габарита краски.
      // Если делить габаритом самой надписи, площади краски у разных строк
      // становятся несравнимы: у "IIII" габарит уже, чем у "MMMM", и "краски
      // столько же" получается у любой пары. Так первая версия этого гейта и
      // объявила ложный провал на исправном эталоне.
      const cell = (opts.extent || 100) / GRID;
      const gw = Math.max(1, Math.min(4096, Math.round(w / cell) || 1));
      const gh = Math.max(1, Math.min(4096, Math.round(h / cell) || 1));
      const grid = new Uint8Array(gw * gh);
      const seen = new Set();
      for (let i = 0; i < n; i++) {
        const gx = Math.min(gw - 1, Math.max(0, Math.floor((xs[i] - minX) / cell)));
        const gy = Math.min(gh - 1, Math.max(0, Math.floor((ys[i] - minY) / cell)));
        grid[gy * gw + gx] = 1;
        if (seen.size < 200000) seen.add(Math.round(xs[i] * 100) + "," + Math.round(ys[i] * 100));
      }
      let filled = 0;
      for (let i = 0; i < grid.length; i++) filled += grid[i];
      // Занятость по столбцам — ею ловится пробел.
      const cols = new Array(gw).fill(0);
      for (let gy = 0; gy < gh; gy++) {
        for (let gx = 0; gx < gw; gx++) if (grid[gy * gw + gx]) cols[gx]++;
      }
      return {
        count: n, nonFinite, width: w, height: h, zSpan: maxZ - minZ,
        declaredWidth: p.width, declaredHeight: p.height,
        gw, gh, cell, filled, fillShare: filled / (gw * gh),
        cols, distinct: seen.size,
        grid: Array.from(grid).join(""),
      };
    };

    const C = { count: 3000, extent: 100 };
    out.cases.spaced = measure("A A", C);
    out.cases.mmmm = measure("MMMM", C);
    out.cases.iiii = measure("IIII", C);
    out.cases.mixed = measure("M.M", C);
    out.cases.one = measure("X", C);
    out.cases.many = measure("X".repeat(40), C);
    out.cases.big = measure("MMMM", { count: 3000, extent: 200 });
    out.cases.again = measure("MMMM", C);
    out.cases.other = measure("E = m c^2", C);
  } catch (e) {
    out.error = String((e && e.stack) || e).slice(0, 400);
  }
  return JSON.stringify(out);
})()`;

const res = await evalJson(PROBE_JS);
if (res.error) bye(false, ['проба не выполнилась: ' + res.error]);
if (res.hasBuild === false) bye(false, ['нет экспорта buildFormulaPlane']);
const c = res.cases || {};
if (!c.mmmm) bye(false, ['проба не собрала замеры: ' + (res.error || 'причина неизвестна')]);

// ---- 1. набор формул ----------------------------------------------------------
const F = res.formulas;
if (!Array.isArray(F)) {
  bad('FORMULAS — не массив');
} else {
  const texts = F.map(f => (f && typeof f === 'object' ? f.text : f));
  const moods = F.map(f => (f && typeof f === 'object' ? f.mood : undefined));
  const withMood = moods.filter(Boolean).length;
  const byMood = {};
  for (const m of moods) if (m) byMood[m] = (byMood[m] || 0) + 1;
  const uniq = new Set(texts.filter(t => typeof t === 'string' && t.trim())).size;
  console.log('FORMULAS: записей ' + F.length + ', различных строк ' + uniq
    + ', с настроением ' + withMood + ' — ' + JSON.stringify(byMood));
  if (F.length < FORMULAS_MIN) bad('FORMULAS: записей ' + F.length + ', просили ' + FORMULAS_MIN);
  if (uniq < FORMULAS_MIN) {
    bad('FORMULAS: различных строк ' + uniq + ' из ' + F.length
      + ' — повторы не дают двадцати четырёх разных надписей');
  }
  if (withMood < F.length) {
    bad('FORMULAS: у ' + (F.length - withMood) + ' записей нет поля mood. Просили строки, '
      + '«привязанные к настроениям», а привязка, которой нет в данных, не проверяется '
      + 'ничем и до мира не доедет: нужен вид { text, mood }');
  } else {
    const MOODS = ['serene', 'eerie', 'void', 'joyful', 'uncanny', 'claustrophobic'];
    const alien = Object.keys(byMood).filter(m => !MOODS.includes(m));
    if (alien.length) bad('FORMULAS: настроения, которых нет в palettes.js: ' + alien.join(', '));
    const thin = MOODS.filter(m => (byMood[m] || 0) < MOOD_MIN);
    if (thin.length) {
      bad('FORMULAS: на настроения ' + thin.join(', ') + ' приходится меньше ' + MOOD_MIN
        + ' формул — эти миры останутся без надписей');
    }
  }
}

// ---- 2. модуль отвечает на аргументы -----------------------------------------
const t = (name) => c[name];
for (const [name, cs] of Object.entries(c)) {
  if (cs.nonFinite) bad(name + ': fill вернул ' + cs.nonFinite + ' нечисловых координат');
}
const wantCount = 3000;
const dev = Math.abs(t('mmmm').count - wantCount) / wantCount;
console.log('число точек: заказано ' + wantCount + ', отдано ' + t('mmmm').count
  + ', отклонение ' + (dev * 100).toFixed(1) + '%');
if (dev > COUNT_TOL) {
  bad('заказали ' + wantCount + ' точек, получили ' + t('mmmm').count + ' (отклонение '
    + (dev * 100).toFixed(1) + '%, допуск ' + COUNT_TOL * 100 + '%): бюджет точек делят '
    + 'все поля мира, и надпись обязана укладываться в свою долю');
}

const extResp = t('big').height / (t('mmmm').height || 1);
console.log('extent: удвоили — надпись выше в ' + extResp.toFixed(3) + ' раза (допуск '
  + EXTENT_RESP.join('..') + ')');
if (extResp < EXTENT_RESP[0] || extResp > EXTENT_RESP[1]) {
  bad('opts.extent удвоился, а надпись изменилась в ' + extResp.toFixed(3) + ' раза (допуск '
    + EXTENT_RESP.join('..') + '): попадание в допуск на одном размере не значит, что '
    + 'параметр слушают');
}

const aspect = t('many').width / (t('one').width || 1);
console.log('длина строки: 40 знаков против одного — шире в ' + aspect.toFixed(2)
  + ' раза (допуск ' + ASPECT_RESP.join('..') + ')');
if (aspect < ASPECT_RESP[0] || aspect > ASPECT_RESP[1]) {
  bad('строка из сорока знаков шире строки из одного всего в ' + aspect.toFixed(2)
    + ' раза (допуск ' + ASPECT_RESP.join('..') + '): габарит надписи не следует за текстом');
}
const perChar = aspect / 40;
console.log('ширина на знак: ' + perChar.toFixed(3) + ' от ширины одного знака (допуск '
  + PER_CHAR.join('..') + ')');
if (perChar < PER_CHAR[0] || perChar > PER_CHAR[1]) {
  bad('ширина на один знак ' + perChar.toFixed(3) + ' (допуск ' + PER_CHAR.join('..')
    + '): у моноширинного шрифта сорок знаков обязаны быть ровно в сорок раз шире '
    + 'одного. ' + (perChar < PER_CHAR[0] ? 'Меньше — значит длинная строка обрезается '
      + 'растром фиксированного размера, и у длинных формул пропадёт хвост'
      : 'Больше — значит между знаками растёт пустота'));
}

// ---- 3. это буквы, а не комок ------------------------------------------------
// Сверху доля заполнения габарита НЕ проверяется, хотя просилась сама: замеры
// показали, что она не разделяет честную надпись от подделки — "MMMM" даёт 0.553,
// а заливка клеток знаков 0.487 и эллипс вместо текста 0.439, то есть честный текст
// плотнее подделки. Порог тут ловил бы шум, а не дефект; разделяют другие замеры
// ниже — пробел, краска M против I и высота точки в "M.M".
console.log('заполнение габарита: "MMMM" ' + t('mmmm').fillShare.toFixed(3)
  + ', "IIII" ' + t('iiii').fillShare.toFixed(3) + ' (снизу ' + FILL_MIN + ')');
for (const name of ['mmmm', 'iiii', 'other']) {
  const f = t(name).fillShare;
  if (f < FILL_MIN) bad(name + ': занято всего ' + f.toFixed(3) + ' габарита — надписи нет');
}

// пробел: полоса посередине "A A" обязана быть пустой
{
  const g = t('spaced');
  const cols = g.cols;
  const n = cols.length;
  const band = (a, b) => {
    const s = cols.slice(Math.floor(n * a), Math.max(Math.floor(n * a) + 1, Math.floor(n * b)));
    return s.reduce((x, v) => x + v, 0) / (s.length * g.gh);
  };
  const left = band(0, 0.3), mid = band(0.4, 0.6), right = band(0.7, 1);
  console.log('пробел в "A A": краска слева ' + left.toFixed(3) + ', посередине '
    + mid.toFixed(3) + ', справа ' + right.toFixed(3));
  if (mid > GAP_MAX) {
    bad('в "A A" полоса пробела занята на ' + mid.toFixed(3) + ' (порог ' + GAP_MAX
      + ') — пробел закрашен, значит точки раскладываются не по непрозрачным пикселям '
      + 'надписи, а по её габариту');
  }
  if (left < SIDES_MIN || right < SIDES_MIN) {
    bad('в "A A" по краям краски мало (' + left.toFixed(3) + ' и ' + right.toFixed(3)
      + ', нужно ' + SIDES_MIN + ') — букв нет там, где они должны быть');
  }
}

// "M" против "I": та же ширина строки, разное количество краски
{
  const ratio = t('mmmm').filled / (t('iiii').filled || 1);
  console.log('краски в "MMMM" против "IIII": ' + ratio.toFixed(2) + ' раза (нужно '
    + INK_M_OVER_I + ')');
  if (ratio < INK_M_OVER_I) {
    bad('"MMMM" несёт лишь в ' + ratio.toFixed(2) + ' раза больше краски, чем "IIII" (нужно '
      + INK_M_OVER_I + '): при моноширинном шрифте это одна и та же ширина строки, и '
      + 'различие может дать только отбор по пикселям самих букв. Значит буквы не '
      + 'растеризуются — рисуется что-то одинаковое на любой текст');
  }
}

// "M.M": точка обязана лежать внизу строки, а буквы — во всю высоту.
// Мерить это можно только ВНУТРИ одной строки: облако центруется по своему габариту,
// поэтому у отдельной строки "...." её собственный центр краски всегда посередине —
// сравнение двух строк тут мерило бы не то.
{
  const g = t('mixed');
  const rows = (from, to) => {
    let sum = 0, cnt = 0;
    for (let gy = 0; gy < g.gh; gy++) {
      for (let gx = Math.floor(g.gw * from); gx < Math.floor(g.gw * to); gx++) {
        if (g.grid[gy * g.gw + gx] === '1') { sum += gy; cnt++; }
      }
    }
    return { center: cnt ? sum / cnt / (g.gh - 1 || 1) : -1, cells: cnt };
  };
  const letter = rows(0, 0.28);
  const dot = rows(0.4, 0.6);
  console.log('в "M.M": центр краски у буквы ' + letter.center.toFixed(3) + ' (клеток '
    + letter.cells + '), у точки ' + dot.center.toFixed(3) + ' (клеток ' + dot.cells
    + '), 0 — низ строки');
  if (dot.cells < 1 || letter.cells < 1) {
    bad('в "M.M" не нашлось краски под буквой или под точкой — знаки не растеризуются '
      + 'по отдельности');
  } else if (!(letter.center - dot.center > BASE_SHIFT_MIN)) {
    bad('в "M.M" точка стоит не ниже буквы (центр краски ' + dot.center.toFixed(3)
      + ' против ' + letter.center.toFixed(3) + ', нужна разница ' + BASE_SHIFT_MIN
      + '): точки поля не встают туда, где в знаке краска, — значит раскладка идёт '
      + 'по клетке знака, а не по его пикселям');
  }
}

// Разные строки — разные облака. Порога здесь нет намеренно: доля несовпавших клеток
// у двух строк разной длины велика при любой реализации (сетки разного размера),
// поэтому она ничего не разделяет. Проверяется только вырождение — побайтовое
// совпадение, то есть аргумент text, выброшенный совсем.
{
  const same = t('mmmm').grid === t('other').grid;
  console.log('разные строки дают разные облака — ' + !same);
  if (same) {
    bad('"MMMM" и "E = m c^2" дали побайтово одно облако: аргумент text в раскладке '
      + 'не участвует вовсе');
  }
}

// ---- 4. это плоскость, и точки не свалены в кучу -----------------------------
{
  const planar = t('mmmm').zSpan / (t('mmmm').width || 1);
  console.log('плоскость: разброс по z ' + planar.toFixed(4) + ' от ширины (порог '
    + PLANAR_MAX + ')');
  if (planar > PLANAR_MAX) {
    bad('надпись не плоская: разброс по z ' + planar.toFixed(4) + ' от ширины (порог '
      + PLANAR_MAX + ') — с расстояния плоская надпись читается, облако не читается');
  }
  const ds = t('mmmm').distinct / t('mmmm').count;
  console.log('различных положений точек ' + (ds * 100).toFixed(1) + '% от их числа (нужно '
    + DISTINCT_MIN * 100 + '%)');
  if (ds < DISTINCT_MIN) {
    bad('различных положений всего ' + (ds * 100).toFixed(1) + '% — точки сидят друг на '
      + 'друге, и заказанный бюджет тратится впустую');
  }
}

// ---- 5. заявленный габарит совпадает с настоящим ------------------------------
{
  const m = t('mmmm');
  const dw = Math.abs(m.declaredWidth - m.width) / (m.width || 1);
  const dh = Math.abs(m.declaredHeight - m.height) / (m.height || 1);
  console.log('заявленный габарит: ширина ' + Number(m.declaredWidth).toFixed(1) + ' против '
    + m.width.toFixed(1) + ', высота ' + Number(m.declaredHeight).toFixed(1) + ' против '
    + m.height.toFixed(1));
  if (!(dw < 0.1) || !(dh < 0.1)) {
    bad('поля width/height не совпадают с настоящим габаритом точек (расхождение '
      + (dw * 100).toFixed(0) + '% и ' + (dh * 100).toFixed(0) + '%): по ним мир ставит '
      + 'надпись в пространстве, и врать они не должны');
  }
}

// ---- 6. детерминизм -----------------------------------------------------------
{
  const same = t('mmmm').grid === t('again').grid && t('mmmm').count === t('again').count;
  console.log('детерминизм: два вызова с теми же аргументами совпали — ' + same);
  if (!same) {
    bad('два вызова с одинаковыми аргументами дали разные надписи: в раскладке есть '
      + 'Math.random или Date.now, и один сид перестанет давать один мир');
  }
}

if (problems.length) for (const p of problems) bad(p);
bye(fails.length === 0, fails);
