// Проверка мира на экране: детерминизм по сиду и читаемость глубины.
//
//   node tools/world-check.mjs
//   node tools/world-check.mjs --seed 0000-8cng-bh0b --other 0000-e13w-u1of
//
// Зачем: инвариант «тот же сид = тот же мир побайтово» — правило 7 проекта, и до этого
// инструмента его не проверял никто. Приёмка N11 предлагала открыть ?seed=TEST-TEST-TEST
// дважды и сравнить глазами, но такой код `decodeSeed` отвергает, и каждая загрузка
// молча делала НОВЫЙ случайный мир — сравнение всегда «сходилось» ни о чём.
//
// Сравниваем не пиксели, а атрибуты геометрии: пиксели зависят от фазы пульсации,
// то есть от момента снимка, а геометрия — только от сида.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CDP_PORT = 9368;
const PORT = 5173;
const READY_MS = 30000;
const STABLE_MS = 700;

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const SEED = arg('seed', '0000-8cng-bh0b');
const OTHER = arg('other', '0000-e13w-u1of');

// Туман: средняя яркость обязана вырасти, когда плотность тумана обнуляется.
// Замер идёт со стенда, где камера отнесена на 1200 — там влияние тумана крупное,
// а не на грани шума.
const FOG_GAIN_MIN = 1.15;

const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('ПРОВАЛ: chrome.exe не найден'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-world-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--window-size=800,600',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  'about:blank',
], { stdio: 'ignore' });

const problems = [];
function bye(ok, lines = []) {
  try { chrome.kill(); } catch {}
  try { srv.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  if (ok) console.log('WORLD_OK');
  else { console.error('ПРОВАЛ: мир на экране не проходит проверку'); for (const l of lines) console.error('  ' + l); }
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
    problems.push('исключение: ' + (d.exception?.description || d.text));
  }
};

async function assertOurServer(file) {
  const norm = t => t.split(String.fromCharCode(13)).join('');
  const want = norm(fs.readFileSync(file, 'utf8'));
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/' + file);
      if (norm(await r.text()) === want) return;
      bye(false, ['на порту ' + PORT + ' отвечает не этот проект: ' + file + ' не совпадает ' +
        'с файлом на диске. Сними процесс, который держит порт: netstat -ano | findstr :' + PORT]);
    } catch {}
    await sleep(250);
  }
  bye(false, ['сервер на порту ' + PORT + ' не ответил за 10 секунд']);
}

const targets = await send('Target.getTargets', {}, null);
const page = targets.targetInfos.find(t => t.type === 'page');
const att = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, null);
sessionId = att.sessionId;
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await assertOurServer('index.html');

// Слепок мира: обходим сцену и хешируем атрибуты каждого облака точек. Пиксели тут
// не годятся — они зависят от фазы пульсации, то есть от момента снимка.
const SNAPSHOT = [
  '(async () => {',
  '  const m = await import("/src/boot.js");',
  '  const clouds = [];',
  '  m.scene.traverse(o => { if (o.isPoints) clouds.push(o); });',
  '  const h = (arr) => {',
  '    let x = 2166136261;',
  '    for (let i = 0; i < arr.length; i++) {',
  '      x ^= Math.round(arr[i] * 1000) | 0;',
  '      x = Math.imul(x, 16777619) >>> 0;',
  '    }',
  '    return x;',
  '  };',
  '  const names = ["position", "glyph", "size", "offset"];',
  '  const out = clouds.map(c => {',
  '    const a = c.geometry.attributes;',
  '    const parts = names.map(n => (a[n] ? n + ":" + h(a[n].array) : n + ":нет"));',
  '    let nonZero = 0;',
  '    const p = a.position ? a.position.array : [];',
  '    for (let i = 0; i < p.length; i += 3) if (p[i] || p[i+1] || p[i+2]) nonZero++;',
  '    return { count: a.position ? a.position.count : 0, nonZero, hash: parts.join("|") };',
  '  });',
  '  return JSON.stringify({ clouds: out, search: location.search });',
  '})()',
].join('\n');

const FRAME_STATS = [
  '(() => {',
  '  const m = window.__ng_boot;',
  // Пульсация меняет яркость между кадрами, поэтому перед каждым снимком фаза
  // прибивается к одному значению — иначе сравнение мерит не туман, а момент.
  '  m.scene.traverse(o => {',
  '    if (o.isPoints && o.material && o.material.uniforms && o.material.uniforms.uPulse) {',
  '      o.material.uniforms.uPulse.value = 0.5;',
  '    }',
  '  });',
  '  const gl = m.renderer.getContext();',
  '  const w = 400, hh = 300;',
  '  const px = new Uint8Array(w * hh * 4);',
  // Замерный стенд: камера отнесена от поля, чтобы весь объём оказался на большой
  // глубине. Внутри сферы радиуса 400 туман по формуле FogExp2 почти не виден, и
  // разница кадров тонула бы в шуме — на 1200 она однозначная. Позицию возвращаем.
  '  const saved = m.camera.position.clone();',
  '  m.camera.position.set(0, 0, 1200);',
  '  m.camera.lookAt(0, 0, 0);',
  '  m.camera.updateMatrixWorld(true);',
  '  m.renderer.render(m.scene, m.camera);',
  '  gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, px);',
  '  let lit = 0, sum = 0;',
  '  for (let i = 0; i < px.length; i += 4) {',
  '    const v = Math.max(px[i], px[i+1], px[i+2]);',
  '    if (v > 16) lit++;',
  '    sum += v;',
  '  }',
  '  m.camera.position.copy(saved);',
  '  m.camera.lookAt(0, 0, 0);',
  '  m.camera.updateMatrixWorld(true);',
  '  return JSON.stringify({ lit, mean: sum / (px.length / 4) });',
  '})()',
].join('\n');

async function evalJson(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) {
    return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  }
  const v = r.result?.value;
  if (typeof v !== 'string') return { error: 'проба вернула не строку: ' + typeof v };
  try { return JSON.parse(v); } catch (e) { return { error: 'не разобрать ответ пробы' }; }
}

async function load(seed) {
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/?seed=' + seed });
  const startedAt = Date.now();
  let prev = null, snap = null;
  while (Date.now() - startedAt < READY_MS) {
    await sleep(STABLE_MS);
    const cur = await evalJson(SNAPSHOT, true);
    if (cur.error || !cur.clouds || !cur.clouds.length) { prev = null; continue; }
    const key = JSON.stringify(cur.clouds);
    if (prev === key && cur.clouds.every(c => c.nonZero > 0)) { snap = cur; break; }
    prev = key;
  }
  if (!snap) return null;
  await send('Runtime.evaluate', {
    expression: 'import("/src/boot.js").then(m => { window.__ng_boot = m; })',
    awaitPromise: true,
  });
  return snap;
}

const a = await load(SEED);
if (!a) bye(false, ['мир по сиду ' + SEED + ' не собрался за ' + READY_MS + ' мс'].concat(problems));
console.log('облаков точек: ' + a.clouds.length);
for (const c of a.clouds) {
  console.log('  точек ' + c.count + ', с непустой координатой ' + c.nonZero);
}
if (!a.search.toLowerCase().includes(SEED.toLowerCase())) {
  problems.push('сид из адреса потерялся: в строке запроса "' + a.search + '" нет ' + SEED +
    '. Правильный код обязан использоваться как есть, а не подменяться новым.');
}

// Туман: обнуляем плотность и смотрим, изменился ли кадр.
const withFog = await evalJson(FRAME_STATS);
const fogInfo = await evalJson([
  '(() => {',
  '  const names = [];',
  '  let touched = 0;',
  '  window.__ng_boot.scene.traverse(o => {',
  '    if (!o.isPoints || !o.material || !o.material.uniforms) return;',
  '    for (const k of Object.keys(o.material.uniforms)) {',
  '      if (/fog/i.test(k)) {',
  '        names.push(k);',
  '        const u = o.material.uniforms[k];',
  '        if (typeof u.value === "number") { u.value = 0; touched++; }',
  '      }',
  '    }',
  '  });',
  '  return JSON.stringify({ names: [...new Set(names)], touched });',
  '})()',
].join('\n'));
const withoutFog = await evalJson(FRAME_STATS);

console.log('uniform-ы тумана в материалах: ' +
  ((fogInfo.names && fogInfo.names.length) ? fogInfo.names.join(', ') : 'нет'));
if (withFog.lit !== undefined && withoutFog.lit !== undefined) {
  console.log('кадр с туманом: светится ' + withFog.lit + ' пикселей, средняя яркость ' +
    withFog.mean.toFixed(3));
  console.log('кадр без тумана: светится ' + withoutFog.lit + ' пикселей, средняя яркость ' +
    withoutFog.mean.toFixed(3));
}

if (!fogInfo.names || !fogInfo.names.length) {
  problems.push('ни в одном материале нет числового uniform-а тумана. scene.fog сам по себе ' +
    'на сырой ShaderMaterial не действует, поэтому дальние глифы не тускнеют и глубина ' +
    'не читается — признак 2 в REFERENCE.md для D1 не выполнен.');
} else if (withFog.mean !== undefined && withoutFog.mean !== undefined) {
  const gain = withFog.mean > 0 ? withoutFog.mean / withFog.mean : 0;
  console.log('прирост яркости при выключенном тумане: ' + gain.toFixed(3) +
    ', нужно не меньше ' + FOG_GAIN_MIN);
  if (!(gain >= FOG_GAIN_MIN)) {
    problems.push('обнуление плотности тумана не изменило кадр (прирост ' + gain.toFixed(3) +
      ' при пороге ' + FOG_GAIN_MIN + '): uniform есть, но шейдер им не пользуется.');
  }
}

// Детерминизм: та же ссылка ещё раз, потом другой сид.
const again = await load(SEED);
if (!again) bye(false, ['повторная загрузка сида ' + SEED + ' не собралась'].concat(problems));
const same = JSON.stringify(a.clouds.map(c => c.hash)) === JSON.stringify(again.clouds.map(c => c.hash));
console.log('повторная загрузка того же сида даёт тот же мир: ' + same);
if (!same) {
  problems.push('один и тот же сид ' + SEED + ' дал разные миры между загрузками — ' +
    'нарушено правило 7. Обычно причина в том, что генерация где-то зависит не только ' +
    'от сида: Date.now(), Math.random() или порядок расходования потока rng.');
}

const other = await load(OTHER);
if (!other) bye(false, ['мир по сиду ' + OTHER + ' не собрался'].concat(problems));
const differs = JSON.stringify(a.clouds.map(c => c.hash)) !== JSON.stringify(other.clouds.map(c => c.hash));
console.log('другой сид ' + OTHER + ' даёт другой мир: ' + differs);
if (!differs) {
  problems.push('сиды ' + SEED + ' и ' + OTHER + ' дали побитово один мир — сид не влияет ' +
    'на геометрию, хотя обязан.');
}

bye(problems.length === 0, problems);
