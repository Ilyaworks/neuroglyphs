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
// Мышь. Первая версия гейта её не проверяла, и N19 закрылась вообще без взгляда:
// модуль не трогал ни mousemove, ни pointer lock, аргумент dom лежал без дела.
const MIN_TURN_DEG = 20;       // рывок мыши на 400 пикселей обязан повернуть взгляд
const MIN_VIEW_ALIGN = 0.9;    // W обязан вести туда, куда смотрит камера
// Наклон: важно не «как близко к вертикали», а «не перевернулась ли камера». Первая
// версия порога мерила близость (0.999) и заваливала эталон, который честно упирается
// в 0.57° от вертикали. Мерим переворот: верх камеры обязан смотреть вверх, а взгляд
// при повторных рывках вверх не должен поехать обратно вниз.
const MIN_UP_Y = 0.001;        // верх камеры смотрит вверх — камера не перевёрнута
const PITCH_WRAP_TOL = 0.01;   // допуск на «взгляд поехал обратно» при рывках в ту же сторону
const MAX_LOCKLESS_TURN_DEG = 1; // без захвата курсора мышь не поворачивает ничего

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

// ---- мышь: захват курсора, поворот взгляда, движение по взгляду ----------------
const MOUSE_PROBE = [
  '(async () => {',
  '  const THREE = await import("three");',
  '  const mod = await import(' + JSON.stringify(MOD) + ');',
  '  const DT = 1 / 60;',
  '  const key = (type, code) => document.body.dispatchEvent(',
  '    new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));',
  '  const move = (dx, dy) => {',
  '    for (const type of ["mousemove", "pointermove"]) {',
  '      document.body.dispatchEvent(new MouseEvent(type, {',
  '        bubbles: true, cancelable: true, movementX: dx, movementY: dy,',
  '      }));',
  '    }',
  '  };',
  '  const press = () => {',
  '    for (const type of ["pointerdown", "mousedown", "click"]) {',
  '      document.body.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));',
  '    }',
  '  };',
  '  const fwd = (c) => { const v = new THREE.Vector3(); c.getWorldDirection(v); return [v.x, v.y, v.z]; };',
  '  const angle = (a, b) => {',
  '    const d = a[0]*b[0] + a[1]*b[1] + a[2]*b[2];',
  '    const la = Math.hypot(a[0],a[1],a[2]) || 1, lb = Math.hypot(b[0],b[1],b[2]) || 1;',
  '    return Math.acos(Math.max(-1, Math.min(1, d / (la * lb)))) * 180 / Math.PI;',
  '  };',
  '  function fresh() {',
  '    const camera = new THREE.PerspectiveCamera(70, 1.5, 0.1, 5000);',
  '    camera.position.set(0, 0, 0);',
  '    const cam = mod.createFlyCam(camera, document.body);',
  '    return { camera, cam };',
  '  }',
  '  const lock = (on) => {',
  '    if (on) Object.defineProperty(document, "pointerLockElement", { get: () => document.body, configurable: true });',
  '    else { try { delete document.pointerLockElement; } catch (e) {} }',
  '  };',
  '  const итог = {};',
  '  // 1. Захват курсора обязан запрашиваться нажатием.',
  '  {',
  '    const было = document.body.requestPointerLock;',
  '    let звали = 0;',
  '    document.body.requestPointerLock = function () { звали++; };',
  '    const { cam } = fresh();',
  '    press();',
  '    итог.захватЗапрошен = звали;',
  '    cam.dispose();',
  '    document.body.requestPointerLock = было;',
  '  }',
  '  // 2. Без захвата мышь не должна ничего вращать.',
  '  {',
  '    lock(false);',
  '    const { camera, cam } = fresh();',
  '    const до = fwd(camera);',
  '    move(400, 0);',
  '    cam.update(DT);',
  '    итог.поворотБезЗахвата = angle(до, fwd(camera));',
  '    cam.dispose();',
  '  }',
  '  // 3. С захватом: рывок вправо поворачивает взгляд вправо, и W ведёт по взгляду.',
  '  {',
  '    lock(true);',
  '    const { camera, cam } = fresh();',
  '    const до = fwd(camera);',
  '    move(400, 0);',
  '    cam.update(DT);',
  '    const после = fwd(camera);',
  '    итог.поворотМышью = angle(до, после);',
  '    итог.взглядПослеПоворота = после;',
  '    const старт = [camera.position.x, camera.position.y, camera.position.z];',
  '    key("keydown", "KeyW");',
  '    for (let i = 0; i < 30; i++) cam.update(DT);',
  '    key("keyup", "KeyW");',
  '    const шаг = [camera.position.x - старт[0], camera.position.y - старт[1], camera.position.z - старт[2]];',
  '    const взгляд = fwd(camera);',
  '    const l = Math.hypot(шаг[0], шаг[1], шаг[2]) || 1;',
  '    итог.путьПоВзгляду = (шаг[0]*взгляд[0] + шаг[1]*взгляд[1] + шаг[2]*взгляд[2]) / l;',
  '    итог.смещениеПослеПоворота = шаг;',
  '    cam.dispose();',
  '  }',
  '  // 4. Наклон: камера не переворачивается и взгляд не уезжает обратно.',
  '  {',
  '    lock(true);',
  '    const { camera, cam } = fresh();',
  '    const upOf = (c) => { const v = new THREE.Vector3(0, 1, 0).applyQuaternion(c.quaternion); return [v.x, v.y, v.z]; };',
  '    итог.рядВверх = [];',
  '    for (let i = 0; i < 5; i++) { move(0, -4000); cam.update(DT); итог.рядВверх.push(fwd(camera)[1]); }',
  '    итог.взглядВверх = fwd(camera);',
  '    итог.верхПриВзглядеВверх = upOf(camera);',
  '    итог.рядВниз = [];',
  '    for (let i = 0; i < 10; i++) { move(0, 4000); cam.update(DT); итог.рядВниз.push(fwd(camera)[1]); }',
  '    итог.взглядВниз = fwd(camera);',
  '    итог.верхПриВзглядеВниз = upOf(camera);',
  '    cam.dispose();',
  '  }',
  '  // 5. После dispose мышь тоже больше ничего не крутит.',
  '  {',
  '    lock(true);',
  '    const { camera, cam } = fresh();',
  '    cam.dispose();',
  '    const до = fwd(camera);',
  '    move(400, 0);',
  '    cam.update(DT);',
  '    итог.поворотПослеDispose = angle(до, fwd(camera));',
  '  }',
  '  lock(false);',
  '  return JSON.stringify(итог);',
  '})()',
].join(NL);

const rm = await send('Runtime.evaluate', { expression: MOUSE_PROBE, returnByValue: true, awaitPromise: true });
if (rm.exceptionDetails) {
  problems.push('проба мыши упала: ' +
    (rm.exceptionDetails.exception?.description || rm.exceptionDetails.text));
} else {
  let dm;
  try { dm = JSON.parse(rm.result.value); } catch (e) { dm = null; }
  if (!dm) problems.push('проба мыши вернула не JSON');
  else {
    console.log('захват курсора запрошен нажатием: ' + dm.захватЗапрошен + ' раз');
    console.log('поворот мышью без захвата: ' + dm.поворотБезЗахвата.toFixed(2) +
      '°, нужно не больше ' + MAX_LOCKLESS_TURN_DEG);
    console.log('поворот мышью с захватом на 400 пикселей: ' + dm.поворотМышью.toFixed(2) +
      '°, нужно не меньше ' + MIN_TURN_DEG + ' | взгляд ' + p3(dm.взглядПослеПоворота));
    console.log('W после поворота идёт по взгляду: ' + dm.путьПоВзгляду.toFixed(3) +
      ', нужно не меньше ' + MIN_VIEW_ALIGN + ' | смещение ' + p3(dm.смещениеПослеПоворота));
    console.log('наклон вверх: y взгляда по рывкам ' + dm.рядВверх.map(v => v.toFixed(3)).join(' → ') +
      ', верх камеры ' + p3(dm.верхПриВзглядеВверх));
    console.log('наклон вниз: y взгляда по рывкам ' + dm.рядВниз.map(v => v.toFixed(3)).join(' → ') +
      ', верх камеры ' + p3(dm.верхПриВзглядеВниз));
    console.log('поворот мышью после dispose: ' + dm.поворотПослеDispose.toFixed(2) + '°');

    if (!(dm.захватЗапрошен > 0)) {
      problems.push('нажатие мышью не запрашивает захват курсора: dom.requestPointerLock не позван ' +
        'ни на pointerdown, ни на mousedown, ни на click. Задача просит мышь через pointer lock.');
    }
    if (!(dm.поворотМышью >= MIN_TURN_DEG)) {
      problems.push('мышь не поворачивает взгляд: рывок на 400 пикселей при захваченном курсоре ' +
        'дал ' + dm.поворотМышью.toFixed(2) + '° при пороге ' + MIN_TURN_DEG +
        '°. Без взгляда полёт — это движение по рельсам.');
    } else if (!(dm.взглядПослеПоворота[0] > 0)) {
      problems.push('рывок мыши вправо повернул взгляд не вправо: камера смотрела в −Z, ' +
        'после поворота x взгляда равен ' + dm.взглядПослеПоворота[0].toFixed(3) + ', ожидалось больше нуля');
    }
    if (!(dm.поворотБезЗахвата <= MAX_LOCKLESS_TURN_DEG)) {
      problems.push('мышь крутит камеру без захвата курсора: поворот ' +
        dm.поворотБезЗахвата.toFixed(2) + '° при пороге ' + MAX_LOCKLESS_TURN_DEG +
        '°. Пока курсор не захвачен, движения мыши — это работа с окном, а не с камерой.');
    }
    if (!(dm.путьПоВзгляду >= MIN_VIEW_ALIGN)) {
      problems.push('движение идёт не туда, куда смотрит камера: совпадение ' +
        dm.путьПоВзгляду.toFixed(3) + ' при пороге ' + MIN_VIEW_ALIGN +
        '. Обычно это неверный базис из кватерниона: множители 2 в столбцах матрицы поворота.');
    }
    for (const [имя, взгляд, верх, ряд, знак] of [
      ['вверх', dm.взглядВверх, dm.верхПриВзглядеВверх, dm.рядВверх, 1],
      ['вниз', dm.взглядВниз, dm.верхПриВзглядеВниз, dm.рядВниз, -1],
    ]) {
      if (!взгляд.every(Number.isFinite) || !верх.every(Number.isFinite)) {
        problems.push('при наклоне ' + имя + ' в векторах камеры не числа: взгляд ' + p3(взгляд));
        continue;
      }
      if (!(верх[1] >= MIN_UP_Y)) {
        problems.push('камера перевернулась при наклоне ' + имя + ': верх камеры смотрит в ' +
          p3(верх) + '. Наклон нужно ограничивать, не давая взгляду перевалить через вертикаль.');
      }
      // Рывки в одну сторону не могут разворачивать взгляд обратно: так проявляется
      // перевал через вертикаль у неограниченного наклона.
      for (let i = 1; i < ряд.length; i++) {
        if ((ряд[i] - ряд[i - 1]) * знак < -PITCH_WRAP_TOL) {
          problems.push('наклон ' + имя + ' перевалил через вертикаль: y взгляда пошёл обратно (' +
            ряд[i - 1].toFixed(3) + ' → ' + ряд[i].toFixed(3) + ') при рывках в одну сторону');
          break;
        }
      }
    }
    if (!(dm.поворотПослеDispose <= MAX_LOCKLESS_TURN_DEG)) {
      problems.push('dispose не снял слушатель мыши: после него взгляд повернулся на ' +
        dm.поворотПослеDispose.toFixed(2) + '°');
    }
  }
}

bye(problems.length === 0, problems);
