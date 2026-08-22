// Гоняет собранную демонстрацию как человек: открывает страницу, жмёт W и Tab
// по-настоящему и смотрит, летит ли камера и возвращается ли она из осмотра.
//
//   node tools/demo-check.mjs
//   node tools/demo-check.mjs --seed 0000-71k2-dlpf
//
// Зачем отдельно от остальных: полёт, осмотр, мир и портал по отдельности зелёные, а
// демонстрация живёт на их стыке. Две вещи ломаются именно там и не видны никому:
// порядок вызовов в кадре (полёт дерётся с осмотром, камера дрожит) и прыжок взгляда
// после выхода из осмотра (у полёта свои yaw/pitch, они уехали, пока камера была
// отвязана). Проверка N21 «страница без ошибок в консоли» обе пропускает.
//
// Эталона-фикстуры у этого гейта нет — как и у world-check с browser-check: проверяется
// не модуль, а собранное приложение. Красная ветка проверена на сборке до N21, где ни
// flyCam, ни freeze из boot.js не экспортируются.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NL = String.fromCharCode(10);
const CDP_PORT = 9375;
const PORT = 5173;

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
// Сид фиксирован по той же причине, что и в browser-check: плотность поля — поле сида,
// и на случайном сиде замеры превращались в лотерею.
const SEED = arg('seed', '0000-71k2-dlpc');

// Пороги. Замер на живой сборке печатается в выводе.
const MIN_FLY = 5;             // за 400 мс с зажатой W камера обязана улететь заметно
const MIN_THIRD_PERSON = 5;    // Tab обязан увести камеру от точки игрока
const MAX_RETURN_DIFF = 1e-3;  // возврат по второму Tab: расхождение места и угла
const MAX_JUMP = 0.02;         // прыжок взгляда после выхода из осмотра, радианы (~1.1°)
const MAX_JITTER = 0.35;       // дрожь в осмотре: разброс радиуса, доля от него самого

const problems = [];
const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('ПРОВАЛ: chrome.exe не найден'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-demo-'));
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
  if (ok) console.log('DEMO_OK');
  else {
    console.error('');
    for (const l of lines) console.error('  x ' + l);
    console.error('');
    console.error('DEMO_FAIL');
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
      !/favicon/.test(m.params.entry.url || '')) problems.push('ошибка страницы: ' + m.params.entry.text);
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    problems.push('исключение на странице: ' + (d.exception?.description || d.text));
  }
};

const targets = await send('Target.getTargets', {}, null);
const page = targets.targetInfos.find(t => t.type === 'page');
sessionId = (await send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, null)).sessionId;
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/?seed=' + SEED });
await sleep(6000);

async function evalJson(expression, awaitPromise = true) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) {
    return { ошибка: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  }
  const v = r.result?.value;
  if (typeof v !== 'string') return { ошибка: 'проба вернула не строку: ' + typeof v };
  try { return JSON.parse(v); } catch (e) { return { ошибка: 'не разобрать ответ пробы' }; }
}

// Сборка обязана отдать наружу то, чем управляет человек.
const SETUP = [
  '(async () => {',
  '  const m = await import("/src/boot.js");',
  '  window.__ng = m;',
  '  const есть = (k) => m[k] !== undefined && m[k] !== null;',
  '  const world = m.scene && m.scene.children.find(o => o.userData && o.userData.exitPosition);',
  '  return JSON.stringify({',
  '    экспорты: ["camera", "scene", "flyCam", "freeze"].filter(есть),',
  '    методыПолёта: есть("flyCam") ? Object.keys(m.flyCam) : [],',
  '    методыОсмотра: есть("freeze") ? Object.keys(m.freeze) : [],',
  '    мирСПорталом: !!world,',
  '    сид: location.search,',
  '  });',
  '})()',
].join(NL);
const setup = await evalJson(SETUP);
if (setup.ошибка) bye(false, ['страница не отдала boot.js: ' + setup.ошибка].concat(problems));
console.log('экспорты boot.js: ' + (setup.экспорты.join(', ') || 'нет'));
console.log('мир с порталом в сцене: ' + setup.мирСПорталом + ', адрес: ' + setup.сид);
for (const k of ['camera', 'scene', 'flyCam', 'freeze']) {
  if (!setup.экспорты.includes(k)) {
    problems.push('boot.js не экспортирует ' + k + '. Гейт демонстрации управляет тем же, ' +
      'чем человек, и без этих объектов проверить сборку нечем.');
  }
}
if (!setup.мирСПорталом) {
  problems.push('в сцене нет мира с userData.exitPosition — портал в сборку не попал');
}
if (problems.length) bye(false, problems);

// Полёт: зажать W на 400 мс и посмотреть, улетела ли камера. Кадры крутит сама страница.
const FLY = [
  '(async () => {',
  '  const m = window.__ng;',
  '  const p0 = m.camera.position.clone();',
  '  const key = (type, code) => document.body.dispatchEvent(',
  '    new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));',
  '  key("keydown", "KeyW");',
  '  await new Promise(r => setTimeout(r, 400));',
  '  const p1 = m.camera.position.clone();',
  '  key("keyup", "KeyW");',
  '  await new Promise(r => setTimeout(r, 600));',
  '  const p2 = m.camera.position.clone();',
  '  return JSON.stringify({ путь: p1.distanceTo(p0), выбегПослеОтпускания: p2.distanceTo(p1) });',
  '})()',
].join(NL);
const fly = await evalJson(FLY);
if (fly.ошибка) problems.push('проба полёта упала: ' + fly.ошибка);
else {
  console.log('W за 400 мс: путь ' + fly.путь.toFixed(2) + ' (нужно не меньше ' + MIN_FLY +
    '), выбег после отпускания ' + fly.выбегПослеОтпускания.toFixed(2));
  if (!(fly.путь >= MIN_FLY)) {
    problems.push('в собранной странице W не летит: путь ' + fly.путь.toFixed(2) +
      ' при пороге ' + MIN_FLY + '. Обычно flyCam.update(dt) не вызывается в кадре.');
  }
}

// Осмотр: Tab туда, Tab обратно. Дрожь ловится по разбросу радиуса между кадрами.
const FREEZE = [
  '(async () => {',
  '  const m = window.__ng;',
  '  const key = (code) => document.body.dispatchEvent(',
  '    new KeyboardEvent("keydown", { code, key: code, bubbles: true, cancelable: true }));',
  '  const место = m.camera.position.clone();',
  '  const угол = m.camera.quaternion.clone();',
  '  key("Tab");',
  '  await new Promise(r => setTimeout(r, 250));',
  '  const радиусы = [];',
  '  for (let i = 0; i < 10; i++) {',
  '    await new Promise(r => requestAnimationFrame(r));',
  '    радиусы.push(m.camera.position.distanceTo(место));',
  '  }',
  '  const rmin = Math.min(...радиусы), rmax = Math.max(...радиусы);',
  '  const rmean = радиусы.reduce((a, b) => a + b, 0) / радиусы.length;',
  '  const вОсмотре = typeof m.freeze.isFrozen === "function" ? m.freeze.isFrozen() : null;',
  '  // Мышь в осмотре: у полёта уедут свои yaw/pitch, если он не пересинхронизируется.',
  '  for (let i = 0; i < 8; i++) {',
  '    document.body.dispatchEvent(new MouseEvent("mousemove", {',
  '      bubbles: true, movementX: 120, movementY: 40 }));',
  '  }',
  '  key("Tab");',
  '  await new Promise(r => setTimeout(r, 250));',
  '  const послеВозврата = m.camera.quaternion.clone();',
  '  const расхождениеМеста = m.camera.position.distanceTo(место);',
  '  const расхождениеУгла = послеВозврата.angleTo(угол);',
  '  // Первое движение мыши после выхода: не должно швырнуть взгляд.',
  '  document.body.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, movementX: 1, movementY: 0 }));',
  '  await new Promise(r => requestAnimationFrame(r));',
  '  const прыжок = m.camera.quaternion.angleTo(послеВозврата);',
  '  return JSON.stringify({ вОсмотре, радиус: rmean, дрожь: rmean > 0 ? (rmax - rmin) / rmean : 1,',
  '    расхождениеМеста, расхождениеУгла, прыжок,',
  '    сноваВПолёте: typeof m.freeze.isFrozen === "function" ? m.freeze.isFrozen() : null });',
  '})()',
].join(NL);
const fr = await evalJson(FREEZE);
if (fr.ошибка) problems.push('проба осмотра упала: ' + fr.ошибка);
else {
  console.log('Tab: в осмотре ' + fr.вОсмотре + ', радиус ' + fr.радиус.toFixed(2) +
    ', дрожь радиуса ' + fr.дрожь.toFixed(3) + ' (порог ' + MAX_JITTER + ')');
  console.log('второй Tab: снова в полёте ' + (fr.сноваВПолёте === false) +
    ', расхождение места ' + fr.расхождениеМеста.toExponential(2) +
    ', угла ' + fr.расхождениеУгла.toExponential(2) + ' (порог ' + MAX_RETURN_DIFF + ')');
  console.log('прыжок взгляда от первого движения мыши после выхода: ' +
    fr.прыжок.toFixed(4) + ' рад (порог ' + MAX_JUMP + ')');
  if (fr.вОсмотре !== true) problems.push('Tab не переводит собранную страницу в осмотр: isFrozen() = ' + fr.вОсмотре);
  if (!(fr.радиус >= MIN_THIRD_PERSON)) {
    problems.push('в осмотре камера не отъехала от точки игрока: радиус ' + fr.радиус.toFixed(2));
  }
  if (!(fr.дрожь <= MAX_JITTER)) {
    problems.push('камера в осмотре дрожит: радиус гуляет на ' + (fr.дрожь * 100).toFixed(1) +
      '% между кадрами при пороге ' + (MAX_JITTER * 100) + '%. Обычно это полёт, который ' +
      'продолжает двигать камеру в том же кадре: пока freeze.isFrozen(), flyCam.update звать нельзя.');
  }
  if (fr.сноваВПолёте !== false) problems.push('второй Tab не выводит из осмотра: isFrozen() = ' + fr.сноваВПолёте);
  if (!(fr.расхождениеМеста <= MAX_RETURN_DIFF) || !(fr.расхождениеУгла <= MAX_RETURN_DIFF)) {
    problems.push('в собранной странице выход из осмотра не возвращает камеру: место ' +
      fr.расхождениеМеста.toExponential(2) + ', угол ' + fr.расхождениеУгла.toExponential(2));
  }
  if (!(fr.прыжок <= MAX_JUMP)) {
    problems.push('после выхода из осмотра первое же движение мыши швыряет взгляд на ' +
      fr.прыжок.toFixed(3) + ' рад при пороге ' + MAX_JUMP + '. У полёта свои yaw и pitch, ' +
      'они уехали, пока камера была отвязана: пересинхронизируй их с камерой на выходе.');
  }
}

bye(problems.length === 0, problems);
