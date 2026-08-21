// Проверка шейдера глифового поля: рисует настоящим WebGL по одной точке на глиф
// и смотрит на пиксели спрайта.
//
//   node tools/material-check.mjs
//
// Зачем: у N10 проверка была `node --check`, то есть только синтаксис. Шейдер, который
// компилируется и рисует залитый квадрат вместо глифа, проходит её молча — а именно это
// и решает, будет ли на экране картинка. Ключевой замер: доля закрашенных пикселей
// внутри габарита спрайта. У глифа внутри есть пустоты, у квадрата — нет.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CDP_PORT = 9367;
const PORT = 5173;
const READY_MS = 25000;
const PROBE = 'tools/material-probe.html';
// --mod <путь> подставляет другой модуль материала. Нужен только для проверки самого
// инструмента на эталоне tools/fixture-material.js: инструмент, который не проходит
// ни на чём, ничего не проверяет.
const modArg = (() => {
  const i = process.argv.indexOf('--mod');
  if (i <= 0) return null;
  const v = process.argv[i + 1] || '';
  // Git Bash переписывает аргумент, начинающийся со слэша, в путь Windows — принимаем
  // и без ведущего слэша, и добавляем его сами.
  return v ? (v.startsWith('/') ? v : '/' + v) : null;
})();

// Пороги. Ниже 0.90 — значит внутри спрайта есть форма, а не залитый прямоугольник.
const FILL_MAX = 0.90;
const SHADES_MIN = 3;
const BOX_MIN = 8;
const BOX_MAX = 80;
const NEED_SHAPED = 4;

const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('ПРОВАЛ: chrome.exe не найден'); process.exit(1); }
if (!fs.existsSync(PROBE)) { console.error('ПРОВАЛ: нет ' + PROBE); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-material-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check',
  // Без программного GL headless-Chrome часто вообще не даёт WebGL-контекста.
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  'about:blank',
], { stdio: 'ignore' });

const problems = [];
function bye(ok, lines = []) {
  try { chrome.kill(); } catch {}
  try { srv.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  if (ok) console.log('MATERIAL_OK');
  else { console.error('ПРОВАЛ: шейдер глифового поля не рисует глифы'); for (const l of lines) console.error('  ' + l); }
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
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    const txt = (m.params.args || []).map(a => a.value || a.description || '').join(' ');
    if (txt) problems.push('console.error: ' + txt.slice(0, 400));
  }
};

// Порт мог держать чужой сервер — тогда проверка читает не этот проект.
async function assertOurServer(file) {
  const norm = t => t.split(String.fromCharCode(13)).join('');
  const want = norm(fs.readFileSync(file, 'utf8'));
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/' + file);
      const got = norm(await r.text());
      if (got === want) return;
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
await assertOurServer(PROBE);
await send('Page.navigate', {
  url: 'http://127.0.0.1:' + PORT + '/' + PROBE + (modArg ? '?mod=' + modArg : ''),
});
if (modArg) console.log('материал взят из ' + modArg + ' (проверка самого инструмента)');

const startedAt = Date.now();
let probe = null;
while (Date.now() - startedAt < READY_MS) {
  try {
    const r = await send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__probe || null)',
      returnByValue: true,
    });
    const v = r.result?.value;
    const parsed = v ? JSON.parse(v) : null;
    if (parsed && parsed.state && parsed.state !== 'старт') { probe = parsed; break; }
  } catch {}
  await sleep(250);
}
const waited = Date.now() - startedAt;

if (!probe) {
  bye(false, ['страница не отдала замеры за ' + READY_MS + ' мс. Обычно это ошибка ' +
    'импорта модуля или недоступный CDN с three — смотри сообщения выше.'].concat(problems));
}
if (probe.state === 'исключение') {
  bye(false, ['проба упала: ' + probe.error].concat(problems));
}

console.log('замеры получены через ' + waited + ' мс, программ собрано: ' + probe.programs);
console.log('uniform-ы: ' + (probe.uniformNames || []).join(', '));
console.log('additive ' + probe.additive + ', depthWrite ' + probe.depthWrite +
  ', depthTest ' + probe.depthTest + ', transparent ' + probe.transparent);
console.log('зажим gl_PointSize через min(): ' + probe.hasClamp +
  ', gl_PointCoord во фрагментном шейдере: ' + probe.usesPointCoord);

for (const g of probe.perGlyph || []) {
  console.log('глиф ' + String(g.glyph).padStart(3) + ': светящихся пикселей ' +
    String(g.lit).padStart(5) + ', габарит ' + g.boxW + 'x' + g.boxH +
    ', заливка габарита ' + g.fill.toFixed(3) + ', оттенков ' + g.shades);
}

const per = probe.perGlyph || [];
if (!per.length) problems.push('проба не отрисовала ни одного глифа');

const blank = per.filter(g => g.lit === 0);
if (blank.length) {
  problems.push('спрайт пустой у ' + blank.length + ' глифов из ' + per.length +
    ' (индексы ' + blank.map(g => g.glyph).join(', ') + '): точка не нарисовалась совсем. ' +
    'Если во фрагментном шейдере есть discard по альфе, а выборка идёт по одному ' +
    'значению на весь спрайт, то прозрачный тексель убивает всю точку.');
}

const shaped = per.filter(g => g.lit > 0 && g.fill < FILL_MAX && g.shades >= SHADES_MIN &&
  g.boxW >= BOX_MIN && g.boxH >= BOX_MIN && g.boxW <= BOX_MAX && g.boxH <= BOX_MAX);
console.log('спрайтов с формой внутри: ' + shaped.length + ' из ' + per.length +
  ', нужно не меньше ' + NEED_SHAPED);
if (per.length && shaped.length < NEED_SHAPED) {
  const flat = per.filter(g => g.lit > 0 && g.fill >= FILL_MAX);
  if (flat.length) {
    problems.push('спрайт залит целиком у ' + flat.length + ' глифов (заливка габарита ' +
      flat.map(g => g.fill.toFixed(2)).join(', ') + ' при пороге ' + FILL_MAX + '): это ' +
      'однотонный квадрат, а не глиф. Выборка из атласа должна идти по gl_PointCoord, ' +
      'то есть на каждый пиксель спрайта своя точка внутри клетки; varying, посчитанный ' +
      'в вершинном шейдере, у точки один на весь спрайт.');
  } else {
    problems.push('форму внутри спрайта нашли только у ' + shaped.length + ' глифов из ' +
      per.length + ', нужно не меньше ' + NEED_SHAPED);
  }
}

if (!probe.hasClamp) {
  problems.push('в вершинном шейдере нет обязательного зажима gl_PointSize = min(..., 64.0)');
}
if (!probe.additive) problems.push('blending не AdditiveBlending — неон превратится в грязные квадраты');
if (probe.depthWrite !== false) problems.push('depthWrite должен быть false');
if (probe.depthTest !== true) problems.push('depthTest должен быть true');
if (probe.transparent !== true) problems.push('transparent должен быть true');
for (const u of ['uPulse', 'uTime', 'uSpectrum']) {
  if (!(probe.uniformNames || []).includes(u)) problems.push('нет uniform ' + u + ' — его ждут задачи D3');
}

bye(problems.length === 0, problems);
