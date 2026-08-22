// Прогоняет полёт камеры по-настоящему: грузит модуль в странице, шлёт настоящие
// события клавиатуры и смотрит, куда уехала камера.
//
//   node tools/flycam-check.mjs
//   node tools/flycam-check.mjs --mod /tools/fixture-flycam.js
//
// Зачем в браузере, а не с заглушкой: полёт держится на window, document, pointer lock
// и настоящей матрице камеры. Заглушка тут проверяла бы заглушку. В странице модуль
// получает ту же three через importmap, что и приложение.
//
// Зачем вообще: у N19 проверкой был только "node --check", а модуль до поздней задачи
// никем не импортируется. Ровно так закрылась неработающей N09, и ровно так N17 уехала
// с рамкой из двух сторон. Третий раз ждать не будем.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NL = String.fromCharCode(10);
const CDP_PORT = 9371;
const PORT = 5173;
const READY_MS = 30000;

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
// Путь принимается и как tools/fixture-flycam.js, и как /tools/fixture-flycam.js:
// Git Bash превращает ведущий слэш в путь к своей установке, и первый же прогон
// инструмента об это споткнулся.
const rawMod = arg('mod', 'src/player/flycam.js').split('\\').join('/');
const LOCAL = (rawMod.match(/(?:tools|src)\/.*/) || [rawMod.replace(/^\//, '')])[0];
const MOD = '/' + LOCAL;

// Пороги. Замер на эталоне печатается в выводе; все пороги стоят с запасом к нему.
// Их дело — поймать грубое: клавишу, которая не работает, ускорение, которого нет,
// залипшую клавишу после потери фокуса. Тонкую настройку ощущения они не меряют.
const MIN_TRAVEL = 5;          // за 30 кадров по 1/60 с камера обязана заметно сдвинуться
const MAX_SIDE_DRIFT = 0.25;   // боковой снос при движении вперёд, доля от пути
const MIN_SHIFT_GAIN = 1.5;    // Shift обязан ускорять хотя бы в полтора раза
const MAX_CTRL_GAIN = 0.8;     // Ctrl обязан замедлять хотя бы на пятую часть
const MAX_FIRST_FRAME = 0.6;   // первый кадр разгона короче установившегося — это и есть плавность
const MAX_SETTLED = 0.02;      // остаточный ход после отпускания и после blur, доля от разгона
const MIN_SPEED_GAIN = 2.0;    // setSpeed(x4) обязан заметно удлинить путь

if (!fs.existsSync(LOCAL)) {
  console.error(LOCAL + ' не найден');
  process.exit(1);
}

// Правило 4 проекта: никакого Math.random в генерации. Полёт — не генерация, но
// случайность в нём так же ломает воспроизводимость демонстрации.
const source = fs.readFileSync(LOCAL, 'utf8');
const problems = [];
if (/Math\s*\.\s*random\s*\(/.test(source)) {
  problems.push(LOCAL + ': Math.random() — правило 4 проекта, случайность запрещена');
}

const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('ПРОВАЛ: chrome.exe не найден'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-flycam-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--window-size=800,600',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  'about:blank',
], { stdio: 'ignore' });

function bye(ok, lines = []) {
  try { chrome.kill(); } catch {}
  try { srv.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  if (ok) console.log('FLYCAM_OK');
  else {
    console.error('');
    for (const l of lines) console.error('  x ' + l);
    console.error('');
    console.error('FLYCAM_FAIL');
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
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    problems.push('исключение на странице: ' + (d.exception?.description || d.text));
  }
};

const targets = await send('Target.getTargets', {}, null);
const page = targets.targetInfos.find(t => t.type === 'page');
sessionId = (await send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, null)).sessionId;
await send('Runtime.enable');
await send('Page.enable');

// Страница нужна только как хозяин importmap: сам мир для полёта не требуется.
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' });
await sleep(2500);

// Весь замер — одним куском в странице: события клавиатуры настоящие, камера настоящая.
const PROBE = [
  '(async () => {',
  '  const THREE = await import("three");',
  '  const mod = await import(' + JSON.stringify(MOD) + ');',
  '  if (typeof mod.createFlyCam !== "function") return JSON.stringify({ ошибка: "нет экспорта createFlyCam" });',
  '  const DT = 1 / 60;',
  '  const key = (type, code) => document.body.dispatchEvent(',
  '    new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));',
  '  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);',
  '  const posOf = (c) => [c.position.x, c.position.y, c.position.z];',
  '  function fresh() {',
  '    const camera = new THREE.PerspectiveCamera(70, 1.5, 0.1, 5000);',
  '    camera.position.set(0, 0, 0);',
  '    const cam = mod.createFlyCam(camera, document.body);',
  '    return { camera, cam };',
  '  }',
  '  function run(codes, frames, prep) {',
  '    const { camera, cam } = fresh();',
  '    if (prep) prep(cam, camera);',
  '    for (const c of codes) key("keydown", c);',
  '    const marks = [posOf(camera)];',
  '    for (let i = 0; i < frames; i++) { cam.update(DT); marks.push(posOf(camera)); }',
  '    for (const c of codes) key("keyup", c);',
  '    const out = { marks, конец: posOf(camera), путь: dist(marks[0], posOf(camera)) };',
  '    cam.dispose();',
  '    return out;',
  '  }',
  '  const итог = {};',
  '  const вперёд = run(["KeyW"], 30);',
  '  итог.вперёд = вперёд.конец;',
  '  итог.путьВперёд = вперёд.путь;',
  '  итог.назад = run(["KeyS"], 30).конец;',
  '  итог.вправо = run(["KeyD"], 30).конец;',
  '  итог.влево = run(["KeyA"], 30).конец;',
  '  итог.вверх = run(["Space"], 30).конец;',
  '  итог.вниз = run(["KeyC"], 30).конец;',
  '  итог.путьShift = run(["KeyW", "ShiftLeft"], 30).путь;',
  '  итог.путьCtrl = run(["KeyW", "ControlLeft"], 30).путь;',
  '  // Плавность: первый кадр обязан быть короче установившегося.',
  '  const m = вперёд.marks;',
  '  итог.первыйКадр = dist(m[0], m[1]);',
  '  итог.установившийсяКадр = dist(m[m.length - 2], m[m.length - 1]);',
  '  // Отпускание: камера доезжает и встаёт.',
  '  {',
  '    const { camera, cam } = fresh();',
  '    key("keydown", "KeyW");',
  '    for (let i = 0; i < 30; i++) cam.update(DT);',
  '    const разгон = dist([0, 0, 0], posOf(camera));',
  '    key("keyup", "KeyW");',
  '    const a = posOf(camera);',
  '    for (let i = 0; i < 50; i++) cam.update(DT);',
  '    const b = posOf(camera);',
  '    for (let i = 0; i < 10; i++) cam.update(DT);',
  '    итог.выбегПослеОтпускания = dist(a, b);',
  '    итог.ходПослеОстановки = dist(b, posOf(camera));',
  '    итог.разгон = разгон;',
  '    cam.dispose();',
  '  }',
  '  // Потеря фокуса окна с зажатой клавишей: камера обязана встать, а не уехать.',
  '  {',
  '    const { camera, cam } = fresh();',
  '    key("keydown", "KeyW");',
  '    for (let i = 0; i < 30; i++) cam.update(DT);',
  '    window.dispatchEvent(new Event("blur"));',
  '    for (let i = 0; i < 60; i++) cam.update(DT);',
  '    const a = posOf(camera);',
  '    for (let i = 0; i < 30; i++) cam.update(DT);',
  '    итог.ходПослеПотериФокуса = dist(a, posOf(camera));',
  '    key("keyup", "KeyW");',
  '    cam.dispose();',
  '  }',
  '  // dispose: слушатели сняты, клавиши больше ничего не двигают.',
  '  {',
  '    const { camera, cam } = fresh();',
  '    cam.dispose();',
  '    const a = posOf(camera);',
  '    key("keydown", "KeyW");',
  '    for (let i = 0; i < 30; i++) cam.update(DT);',
  '    key("keyup", "KeyW");',
  '    итог.ходПослеDispose = dist(a, posOf(camera));',
  '  }',
  '  // setSpeed меняет скорость.',
  '  итог.путьБыстро = run(["KeyW"], 30, (cam) => cam.setSpeed(240)).путь;',
  '  // Мусорный dt не должен порождать NaN.',
  '  {',
  '    const { camera, cam } = fresh();',
  '    key("keydown", "KeyW");',
  '    for (const dt of [0, -1, NaN, undefined, 1e6]) { try { cam.update(dt); } catch (e) { итог.паденияНаDt = String(e && e.message); } }',
  '    cam.update(DT);',
  '    итог.координатыПослеМусора = posOf(camera);',
  '    key("keyup", "KeyW");',
  '    cam.dispose();',
  '  }',
  '  итог.естьМетоды = ["update", "setSpeed", "dispose"].every(k => typeof fresh().cam[k] === "function");',
  '  return JSON.stringify(итог);',
  '})()',
].join(NL);

const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true, awaitPromise: true });
if (r.exceptionDetails) {
  bye(false, ['модуль не работает в странице: ' +
    (r.exceptionDetails.exception?.description || r.exceptionDetails.text)].concat(problems));
}
let d;
try { d = JSON.parse(r.result.value); } catch (e) { bye(false, ['проба вернула не JSON'].concat(problems)); }
if (d.ошибка) bye(false, [d.ошибка].concat(problems));

const fin = (v) => Array.isArray(v) ? v.every(Number.isFinite) : Number.isFinite(v);
const p3 = (v) => Array.isArray(v) ? v.map(x => Number(x).toFixed(2)).join(', ') : String(v);

console.log('модуль: ' + MOD);
console.log('W за 30 кадров: ' + p3(d.вперёд) + ', путь ' + d.путьВперёд.toFixed(2) +
  ', нужно не меньше ' + MIN_TRAVEL);
console.log('S: ' + p3(d.назад) + ' | A: ' + p3(d.влево) + ' | D: ' + p3(d.вправо));
console.log('Space: ' + p3(d.вверх) + ' | C: ' + p3(d.вниз));
console.log('путь: обычный ' + d.путьВперёд.toFixed(2) + ', с Shift ' + d.путьShift.toFixed(2) +
  ' (нужно x' + MIN_SHIFT_GAIN + '), с Ctrl ' + d.путьCtrl.toFixed(2) + ' (нужно не больше x' + MAX_CTRL_GAIN + ')');
console.log('плавность: первый кадр ' + d.первыйКадр.toFixed(3) + ', установившийся ' +
  d.установившийсяКадр.toFixed(3) + ', отношение ' +
  (d.первыйКадр / (d.установившийсяКадр || 1)).toFixed(3) + ', нужно не больше ' + MAX_FIRST_FRAME);
console.log('после отпускания: выбег ' + d.выбегПослеОтпускания.toFixed(2) +
  ', остаточный ход ' + d.ходПослеОстановки.toFixed(4) +
  ' (доля от разгона ' + (d.ходПослеОстановки / (d.разгон || 1)).toFixed(4) + ')');
console.log('после потери фокуса: ход ' + d.ходПослеПотериФокуса.toFixed(4) +
  ' (доля от разгона ' + (d.ходПослеПотериФокуса / (d.разгон || 1)).toFixed(4) +
  '), нужно не больше ' + MAX_SETTLED);
console.log('после dispose: ход ' + d.ходПослеDispose.toFixed(4));
console.log('setSpeed(240): путь ' + d.путьБыстро.toFixed(2) + ' против ' + d.путьВперёд.toFixed(2));

if (!d.естьМетоды) problems.push('createFlyCam вернул не { update, setSpeed, dispose }');
if (!fin(d.вперёд) || !fin(d.координатыПослеМусора)) {
  problems.push('в координатах камеры не число: ' + p3(d.координатыПослеМусора));
}
if (d.паденияНаDt) problems.push('update() падает на мусорном dt: ' + d.паденияНаDt);

if (!(d.путьВперёд >= MIN_TRAVEL)) {
  problems.push('W не двигает камеру: путь ' + d.путьВперёд.toFixed(2) + ' при пороге ' + MIN_TRAVEL +
    '. События шлются на document.body всплывающими, слушать их можно на window, document или dom.');
}
// Камера смотрит в −Z: вперёд — это уменьшение z, назад — увеличение.
if (!(d.вперёд[2] < 0)) problems.push('W уводит не вперёд: z стал ' + d.вперёд[2].toFixed(2) + ', ожидалось меньше нуля');
if (!(d.назад[2] > 0)) problems.push('S уводит не назад: z стал ' + d.назад[2].toFixed(2));
if (!(d.вправо[0] > 0)) problems.push('D уводит не вправо: x стал ' + d.вправо[0].toFixed(2));
if (!(d.влево[0] < 0)) problems.push('A уводит не влево: x стал ' + d.влево[0].toFixed(2));
if (!(d.вверх[1] > 0)) problems.push('Space уводит не вверх: y стал ' + d.вверх[1].toFixed(2));
if (!(d.вниз[1] < 0)) problems.push('C уводит не вниз: y стал ' + d.вниз[1].toFixed(2));
const drift = Math.hypot(d.вперёд[0], d.вперёд[1]) / (d.путьВперёд || 1);
if (!(drift <= MAX_SIDE_DRIFT)) {
  problems.push('движение вперёд уводит вбок: снос ' + drift.toFixed(3) + ' от пути при пороге ' + MAX_SIDE_DRIFT);
}
if (!(d.путьShift / (d.путьВперёд || 1) >= MIN_SHIFT_GAIN)) {
  problems.push('Shift не ускоряет: путь ' + d.путьShift.toFixed(2) + ' против обычного ' +
    d.путьВперёд.toFixed(2) + ', нужно хотя бы в ' + MIN_SHIFT_GAIN + ' раза больше');
}
if (!(d.путьCtrl / (d.путьВперёд || 1) <= MAX_CTRL_GAIN)) {
  problems.push('Ctrl не замедляет: путь ' + d.путьCtrl.toFixed(2) + ' против обычного ' + d.путьВперёд.toFixed(2));
}
if (!(d.первыйКадр / (d.установившийсяКадр || 1) <= MAX_FIRST_FRAME)) {
  problems.push('разгон не плавный: первый кадр ' + d.первыйКадр.toFixed(3) + ' почти равен установившемуся ' +
    d.установившийсяКадр.toFixed(3) + '. Задача просит экспоненциальное сглаживание, а не мгновенную скорость.');
}
if (!(d.выбегПослеОтпускания > 0)) {
  problems.push('торможение не плавное: после отпускания камера встала мгновенно, выбега нет');
}
if (!(d.ходПослеОстановки / (d.разгон || 1) <= MAX_SETTLED)) {
  problems.push('камера не останавливается после отпускания: остаточный ход ' +
    d.ходПослеОстановки.toFixed(4) + ' при пороге ' + MAX_SETTLED + ' от разгона');
}
if (!(d.ходПослеПотериФокуса / (d.разгон || 1) <= MAX_SETTLED)) {
  problems.push('потеря фокуса окна уносит камеру: с зажатой W после window blur она прошла ещё ' +
    d.ходПослеПотериФокуса.toFixed(2) + '. Клавиша залипает нажатой — снимай нажатия по blur.');
}
if (!(d.ходПослеDispose <= 0.001)) {
  problems.push('dispose не снял слушатели: после него клавиша сдвинула камеру на ' + d.ходПослеDispose.toFixed(4));
}
if (!(d.путьБыстро / (d.путьВперёд || 1) >= MIN_SPEED_GAIN)) {
  problems.push('setSpeed не влияет на скорость: путь ' + d.путьБыстро.toFixed(2) +
    ' против обычного ' + d.путьВперёд.toFixed(2));
}

bye(problems.length === 0, problems);
