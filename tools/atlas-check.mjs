// Проверка атласа: открывает atlas.html в Chrome, читает пиксели и по каждой клетке
// считает, есть ли чернила и насколько габарит глифа смещён от центра клетки.
//
// Мерить надо именно габарит, а не центр масс: у глифов с неравномерной заливкой
// (▩, ∮) центр масс законно уезжает от центра, и проверка по нему даёт ложный провал.
// Запуск: node tools/atlas-check.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CDP_PORT = 9366;
const PORT = 5173;
const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('ПРОВАЛ: chrome.exe не найден'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-atlas-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

function bye(ok, lines = []) {
  try { chrome.kill(); } catch {}
  try { srv.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  if (ok) console.log('ATLAS_OK');
  else { console.error('ПРОВАЛ: атлас собран неверно'); for (const l of lines) console.error('  ' + l); }
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
const problems = [];
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

const targets = await send('Target.getTargets', {}, null);
const page = targets.targetInfos.find(t => t.type === 'page');
const att = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, null);
sessionId = att.sessionId;
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/atlas.html' });
await sleep(2500);

const probe = `(() => {
  const c = document.getElementById('atlas');
  if (!c) return { error: 'на atlas.html нет canvas#atlas' };
  const g = c.getContext('2d', { willReadFrequently: true });
  const cell = 64, cols = 16;
  const rows = Math.round(c.height / cell);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      let ink = 0, sx = 0, sy = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const px = col * cell + x, py = r * cell + y;
          if (px >= c.width || py >= c.height) continue;
          const a = d[(py * c.width + px) * 4 + 3];
          if (a > 16) {
            ink++; sx += x; sy += y;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      cells.push(ink ? {
        index: r * cols + col, ink,
        cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
        w: maxX - minX + 1, h: maxY - minY + 1,
        edge: minX <= 0 || minY <= 0 || maxX >= cell - 1 || maxY >= cell - 1,
      } : { index: r * cols + col, ink: 0 });
    }
  }
  return { width: c.width, height: c.height, rows, cells };
})()`;

const res = await send('Runtime.evaluate', { expression: probe, returnByValue: true });
const v = res.result.value;
if (!v || v.error) bye(false, [v?.error || 'страница не отдала данные']);

const used = v.cells.slice(0, 128);
const empty = used.filter(c => c.ink === 0);
const drawn = used.filter(c => c.ink > 0);
const offsets = drawn.map(c => Math.hypot(c.cx - 32, c.cy - 32));
const maxOff = Math.max(...offsets);
const meanOff = offsets.reduce((a, b) => a + b, 0) / offsets.length;
const touching = drawn.filter(c => c.edge);

console.log('атлас ' + v.width + 'x' + v.height + ', клеток занято ' + drawn.length + ' из 128');
console.log('смещение габарита от центра клетки: среднее ' + meanOff.toFixed(1) +
  'px, максимум ' + maxOff.toFixed(1) + 'px');
const big = drawn.slice().sort((a, b) => (b.w * b.h) - (a.w * a.h))[0];
console.log('самая крупная клетка: индекс ' + big.index + ', габарит ' + big.w + 'x' + big.h + 'px');
if (empty.length) problems.push('пустых клеток: ' + empty.length + ' (индексы ' +
  empty.slice(0, 12).map(c => c.index).join(', ') + ')');
if (touching.length) problems.push('глифы касаются края клетки: ' + touching.length +
  ' (индексы ' + touching.slice(0, 12).map(c => c.index).join(', ') + ')');
if (maxOff > 4) problems.push('габарит глифа уехал от центра клетки на ' + maxOff.toFixed(1) +
  'px — центровка считается неверно');

bye(problems.length === 0, problems);
