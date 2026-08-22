// Прогоняет осмотр со стороны по-настоящему: грузит модуль в странице, жмёт Tab,
// крутит колесо и смотрит, куда встала камера и вернулась ли она обратно.
//
//   node tools/freeze-check.mjs
//   node tools/freeze-check.mjs --mod tools/fixture-freeze.js
//
// Зачем: у N20 проверкой был только "node --check", а модуль до N21 никем не
// импортируется — четвёртый раз то же сочетание, которым закрылась неработающей N09.
// Главное заявление задачи — «повторный Tab возвращает в то же положение и тот же угол
// взгляда» — глазами не проверяется вообще: разница в пол-градуса не видна, а демо
// от неё разъезжается.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NL = String.fromCharCode(10);
const CDP_PORT = 9373;
const PORT = 5173;

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const rawMod = arg('mod', 'src/player/freeze.js').split('\\').join('/');
const LOCAL = (rawMod.match(/(?:tools|src)\/.*/) || [rawMod.replace(/^\//, '')])[0];
const MOD = '/' + LOCAL;

// Пороги. Замер на эталоне печатается в выводе, все пороги стоят с запасом.
const MIN_THIRD_PERSON = 5;    // камера обязана отъехать от точки игрока
const MIN_LOOK_AT = 0.95;      // и смотреть на неё: совпадение взгляда с направлением на точку
const MAX_RADIUS_SPREAD = 0.05; // вращение вокруг точки, а не спираль: разброс радиуса
const MIN_ORBIT_DEG = 5;       // за 60 кадров камера обязана заметно объехать точку
const MIN_WHEEL_CHANGE = 0.05;  // колесо меняет радиус хотя бы на двадцатую часть
const MAX_RETURN_DIFF = 1e-3;  // возврат по Tab: расхождение места и угла взгляда
const MAX_AFTER_DISPOSE = 1e-6; // после dispose Tab больше ничего не делает

if (!fs.existsSync(LOCAL)) {
  console.error(LOCAL + ' не найден');
  process.exit(1);
}

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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-freeze-'));
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
  if (ok) console.log('FREEZE_OK');
  else {
    console.error('');
    for (const l of lines) console.error('  x ' + l);
    console.error('');
    console.error('FREEZE_FAIL');
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
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' });
await sleep(2500);

const PROBE = [
  '(async () => {',
  '  const THREE = await import("three");',
  '  const mod = await import(' + JSON.stringify(MOD) + ');',
  '  const factory = mod.createFreeze;',
  '  if (typeof factory !== "function") {',
  '    return JSON.stringify({ ошибка: "нет экспорта createFreeze, есть: " + Object.keys(mod).join(", ") });',
  '  }',
  '  const DT = 1 / 60;',
  '  const key = (code) => document.body.dispatchEvent(',
  '    new KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true }));',
  '  const wheel = (dy) => {',
  '    document.body.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, bubbles: true, cancelable: true }));',
  '  };',
  '  const pos = (c) => [c.position.x, c.position.y, c.position.z];',
  '  const quat = (c) => [c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w];',
  '  const fwd = (c) => { const v = new THREE.Vector3(); c.getWorldDirection(v); return [v.x, v.y, v.z]; };',
  '  const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];',
  '  const len = (a) => Math.hypot(a[0], a[1], a[2]);',
  '  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];',
  '  const maxAbs = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);',
  '  // Камера ставится не в начало координат и с поворотом: возврат «в то же место»',
  '  // на нулях сошёлся бы сам собой и ничего бы не проверял.',
  '  function fresh() {',
  '    const camera = new THREE.PerspectiveCamera(70, 1.5, 0.1, 5000);',
  '    camera.position.set(37, -12, 214);',
  '    camera.quaternion.setFromEuler(new THREE.Euler(0.21, 0.83, 0, "YXZ"));',
  '    camera.updateMatrixWorld(true);',
  '    const flycam = { update() {}, setSpeed() {}, dispose() {} };',
  '    const fr = factory(camera, document.body, flycam);',
  '    return { camera, fr };',
  '  }',
  '  const итог = {};',
  '  {',
  '    const { camera, fr } = fresh();',
  '    итог.естьМетоды = ["update", "isFrozen", "dispose"].every(k => typeof fr[k] === "function");',
  '    итог.доВключения = typeof fr.isFrozen === "function" ? fr.isFrozen() : null;',
  '    const место = pos(camera), угол = quat(camera);',
  '    key("Tab");',
  '    итог.послеTab = typeof fr.isFrozen === "function" ? fr.isFrozen() : null;',
  '    fr.update(DT);',
  '    итог.отъезд = len(sub(pos(camera), место));',
  '    const наТочку = sub(место, pos(camera));',
  '    const l = len(наТочку) || 1;',
  '    итог.смотритНаИгрока = dot(fwd(camera), [наТочку[0]/l, наТочку[1]/l, наТочку[2]/l]);',
  '    // Вращение вокруг точки: радиус держится, угол набегает.',
  '    const радиусы = [], точки = [];',
  '    for (let i = 0; i < 60; i++) { fr.update(DT); радиусы.push(len(sub(pos(camera), место))); точки.push(pos(camera)); }',
  '    const rmin = Math.min(...радиусы), rmax = Math.max(...радиусы);',
  '    const rmean = радиусы.reduce((a, b) => a + b, 0) / радиусы.length;',
  '    итог.разбросРадиуса = rmean > 0 ? (rmax - rmin) / rmean : 1;',
  '    итог.радиус = rmean;',
  '    const v0 = sub(точки[0], место), v1 = sub(точки[точки.length - 1], место);',
  '    итог.объехалГрадусов = Math.acos(Math.max(-1, Math.min(1, dot(v0, v1) / ((len(v0)*len(v1)) || 1)))) * 180 / Math.PI;',
  '    // Колесо мыши меняет радиус в обе стороны.',
  '    const rДо = len(sub(pos(camera), место));',
  '    for (let i = 0; i < 5; i++) wheel(120);',
  '    fr.update(DT);',
  '    const rПлюс = len(sub(pos(camera), место));',
  '    for (let i = 0; i < 10; i++) wheel(-120);',
  '    fr.update(DT);',
  '    const rМинус = len(sub(pos(camera), место));',
  '    итог.радиусДо = rДо; итог.радиусПлюс = rПлюс; итог.радиусМинус = rМинус;',
  '    // Возврат по повторному Tab — после вращения и после зума.',
  '    key("Tab");',
  '    итог.послеВторогоTab = typeof fr.isFrozen === "function" ? fr.isFrozen() : null;',
  '    итог.расхождениеМеста = maxAbs(sub(pos(camera), место));',
  '    итог.расхождениеУгла = maxAbs(quat(camera).map((v, i) => v - угол[i]));',
  '    // Третий Tab: включение обязано работать повторно.',
  '    key("Tab");',
  '    fr.update(DT);',
  '    итог.отъездВторойРаз = len(sub(pos(camera), место));',
  '    key("Tab");',
  '    итог.расхождениеМестаВторойРаз = maxAbs(sub(pos(camera), место));',
  '    итог.координатыКонечные = pos(camera).every(Number.isFinite) && quat(camera).every(Number.isFinite);',
  '    fr.dispose();',
  '  }',
  '  // Мусорный dt не рождает NaN.',
  '  {',
  '    const { camera, fr } = fresh();',
  '    key("Tab");',
  '    for (const dt of [0, -1, NaN, undefined, 1e6]) { try { fr.update(dt); } catch (e) { итог.паденияНаDt = String(e && e.message); } }',
  '    fr.update(DT);',
  '    итог.координатыПослеМусора = pos(camera).every(Number.isFinite);',
  '    fr.dispose();',
  '  }',
  '  // После dispose Tab ничего не делает.',
  '  {',
  '    const { camera, fr } = fresh();',
  '    fr.dispose();',
  '    const место = pos(camera);',
  '    key("Tab");',
  '    fr.update(DT);',
  '    итог.ходПослеDispose = len(sub(pos(camera), место));',
  '  }',
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

console.log('модуль: ' + MOD);
console.log('isFrozen: до Tab ' + d.доВключения + ', после ' + d.послеTab + ', после второго ' + d.послеВторогоTab);
console.log('отъезд от точки игрока: ' + d.отъезд.toFixed(2) + ', нужно не меньше ' + MIN_THIRD_PERSON);
console.log('смотрит на точку игрока: ' + d.смотритНаИгрока.toFixed(3) + ', нужно не меньше ' + MIN_LOOK_AT);
console.log('вращение: радиус ' + d.радиус.toFixed(2) + ', разброс ' + d.разбросРадиуса.toFixed(4) +
  ' (порог ' + MAX_RADIUS_SPREAD + '), объехал ' + d.объехалГрадусов.toFixed(1) +
  '° (нужно ' + MIN_ORBIT_DEG + '°)');
console.log('колесо: радиус ' + d.радиусДо.toFixed(2) + ' → ' + d.радиусПлюс.toFixed(2) +
  ' → ' + d.радиусМинус.toFixed(2));
console.log('возврат по Tab: расхождение места ' + d.расхождениеМеста.toExponential(2) +
  ', угла ' + d.расхождениеУгла.toExponential(2) + ', порог ' + MAX_RETURN_DIFF);
console.log('второй заход: отъезд ' + d.отъездВторойРаз.toFixed(2) +
  ', возврат ' + d.расхождениеМестаВторойРаз.toExponential(2));
console.log('после dispose: ход ' + d.ходПослеDispose.toFixed(6));

if (!d.естьМетоды) problems.push('createFreeze вернул не { update, isFrozen, dispose }');
if (!d.координатыКонечные || !d.координатыПослеМусора) problems.push('в координатах или кватернионе камеры не число');
if (d.паденияНаDt) problems.push('update() падает на мусорном dt: ' + d.паденияНаDt);
if (d.доВключения !== false || d.послеTab !== true || d.послеВторогоTab !== false) {
  problems.push('isFrozen не отражает состояние: до Tab ' + d.доВключения + ', после ' +
    d.послеTab + ', после второго ' + d.послеВторогоTab + ' — ожидалось false, true, false');
}
if (!(d.отъезд >= MIN_THIRD_PERSON)) {
  problems.push('Tab не уводит камеру в третье лицо: отъезд ' + d.отъезд.toFixed(2) +
    ' при пороге ' + MIN_THIRD_PERSON + '. События шлются на document.body всплывающими.');
}
if (!(d.смотритНаИгрока >= MIN_LOOK_AT)) {
  problems.push('камера в осмотре смотрит не на игрока: совпадение ' + d.смотритНаИгрока.toFixed(3) +
    ' при пороге ' + MIN_LOOK_AT + '. Точка, где остался игрок, обязана быть в центре кадра.');
}
if (!(d.разбросРадиуса <= MAX_RADIUS_SPREAD)) {
  problems.push('это не вращение вокруг точки, а отлёт по спирали: радиус гуляет на ' +
    (d.разбросРадиуса * 100).toFixed(1) + '% при пороге ' + (MAX_RADIUS_SPREAD * 100) + '%');
}
if (!(d.объехалГрадусов >= MIN_ORBIT_DEG)) {
  problems.push('камера не вращается вокруг точки: за 60 кадров объехала ' +
    d.объехалГрадусов.toFixed(1) + '° при пороге ' + MIN_ORBIT_DEG + '°');
}
const плюс = Math.abs(d.радиусПлюс - d.радиусДо) / (d.радиусДо || 1);
const минус = Math.abs(d.радиусМинус - d.радиусПлюс) / (d.радиусПлюс || 1);
if (!(плюс >= MIN_WHEEL_CHANGE) || !(минус >= MIN_WHEEL_CHANGE)) {
  problems.push('колесо мыши не меняет радиус: ' + d.радиусДо.toFixed(2) + ' → ' +
    d.радиусПлюс.toFixed(2) + ' → ' + d.радиусМинус.toFixed(2) + ' (нужно менять в обе стороны ' +
    'хотя бы на ' + (MIN_WHEEL_CHANGE * 100) + '%)');
}
if ((d.радиусПлюс - d.радиусДо) * (d.радиусМинус - d.радиусПлюс) > 0) {
  problems.push('колесо крутит радиус в одну сторону независимо от знака deltaY: ' +
    d.радиусДо.toFixed(2) + ' → ' + d.радиусПлюс.toFixed(2) + ' → ' + d.радиусМинус.toFixed(2));
}
if (!(d.расхождениеМеста <= MAX_RETURN_DIFF) || !(d.расхождениеУгла <= MAX_RETURN_DIFF)) {
  problems.push('повторный Tab не возвращает камеру туда, откуда её забрали: расхождение места ' +
    d.расхождениеМеста.toExponential(2) + ', угла взгляда ' + d.расхождениеУгла.toExponential(2) +
    ' при пороге ' + MAX_RETURN_DIFF + '. Запоминать надо и position, и quaternion — до того, ' +
    'как камера уехала в осмотр.');
}
if (!(d.отъездВторойРаз >= MIN_THIRD_PERSON) || !(d.расхождениеМестаВторойРаз <= MAX_RETURN_DIFF)) {
  problems.push('со второго раза переключение работает иначе: отъезд ' + d.отъездВторойРаз.toFixed(2) +
    ', возврат ' + d.расхождениеМестаВторойРаз.toExponential(2) +
    '. Режим включают и выключают много раз за показ.');
}
if (!(d.ходПослеDispose <= MAX_AFTER_DISPOSE)) {
  problems.push('dispose не снял слушатели: после него Tab сдвинул камеру на ' + d.ходПослеDispose.toFixed(6));
}

bye(problems.length === 0, problems);
