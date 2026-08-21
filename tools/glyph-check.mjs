// Проверка алфавита в настоящем браузере: рисуется ли каждый глиф, влезает ли он в клетку
// атласа, нет ли «пустых квадратов» — символов, которых нет в шрифте.
// Запуск: node tools/glyph-check.mjs [--cell 64] [--font 48]
//
// Критерий не в том, чтобы все глифы были одной ширины: символы вроде ⊕ законно шире
// буквы M. Критерий — габарит глифа должен помещаться в клетку атласа, иначе в N06
// соседние клетки будут заезжать друг на друга.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NL = String.fromCharCode(10);
const CDP_PORT = 9355;
const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env['ProgramFiles(x86)'] || '') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(p => p && fs.existsSync(p));

if (!CHROME) { console.error('ПРОВАЛ: chrome.exe не найден'); process.exit(1); }

const { GLYPHS, GLYPH_GROUPS } = await import('../src/core/glyphs.js').catch(async () => {
  return await import(new URL('../src/core/glyphs.js', import.meta.url).href);
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-glyph-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

function bye(ok, lines) {
  try { chrome.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  if (ok) console.log('GLYPHS_OK');
  else { console.error('ПРОВАЛ: алфавит непригоден для атласа'); for (const l of lines) console.error('  ' + l); }
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
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || {}); pending.delete(m.id); }
};

const targets = await send('Target.getTargets', {}, null);
const page = targets.targetInfos.find(t => t.type === 'page');
const att = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, null);
sessionId = att.sessionId;
await send('Runtime.enable');

const probe = `(() => {
  const list = ${JSON.stringify(GLYPHS)};
  const size = FONT_SIZE, cell = CELL_SIZE;
  const c = document.createElement('canvas');
  c.width = cell; c.height = cell;
  const g = c.getContext('2d', { willReadFrequently: true });
  const font = size + 'px monospace';
  function draw(ch) {
    g.clearRect(0, 0, cell, cell);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText(ch, cell / 2, cell / 2);
    const d = g.getImageData(0, 0, cell, cell).data;
    let ink = 0, hash = 5381;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] > 16) { ink++; hash = ((hash * 33) ^ (i + d[i])) >>> 0; }
    }
    return { ink, hash };
  }
  g.font = font;
  const refWidth = g.measureText('M').width;
  const out = [];
  for (const ch of list) {
    g.font = font;
    const w = g.measureText(ch).width;
    const m = g.measureText(ch);
    const boxW = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0);
    const boxH = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0);
    const { ink, hash } = draw(ch);
    out.push({ ch, code: ch.codePointAt(0), w, boxW, boxH, ink, hash });
  }
  return { refWidth, out };
})()`;

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? Number(process.argv[i + 1]) : def;
};
const CELL = arg('cell', 64);
const FONT = arg('font', 48);

const res = await send('Runtime.evaluate', {
  expression: 'const CELL_SIZE = ' + CELL + ', FONT_SIZE = ' + FONT + ';' + probe,
  returnByValue: true,
});
const { refWidth, out } = res.result.value;

const problems = [];
const blank = out.filter(g => g.ink === 0);
if (blank.length) {
  problems.push('не рисуются вовсе (' + blank.length + '): ' +
    blank.map(g => g.ch + ' U+' + g.code.toString(16).toUpperCase()).join(' '));
}
const byHash = new Map();
for (const g of out) {
  if (g.ink === 0) continue;
  if (!byHash.has(g.hash)) byHash.set(g.hash, []);
  byHash.get(g.hash).push(g);
}
for (const [, group] of byHash) {
  if (group.length > 1) {
    problems.push('рисуются одинаково, вероятно пустой квадрат (' + group.length + '): ' +
      group.map(g => g.ch + ' U+' + g.code.toString(16).toUpperCase()).join(' '));
  }
}
const limit = CELL * 0.94;
const tooBig = out.filter(g => g.boxW > limit || g.boxH > limit);
if (tooBig.length) {
  problems.push('не влезают в клетку ' + CELL + 'px при шрифте ' + FONT + 'px (' + tooBig.length + '): ' +
    tooBig.map(g => g.ch + ' ' + g.boxW.toFixed(1) + 'x' + g.boxH.toFixed(1)).join(', '));
}
const widest = out.slice().sort((a, b) => b.boxW - a.boxW)[0];
const uneven = out.filter(g => Math.abs(g.w - refWidth) > 0.51).length;

const inks = out.map(g => g.ink).filter(Boolean).sort((a, b) => a - b);
console.log('глифов: ' + out.length + ', моноширинная ширина ' + refWidth.toFixed(1) + 'px');
console.log('заполнение клетки: медиана ' + inks[Math.floor(inks.length / 2)] +
  ' пикселей, минимум ' + inks[0] + ', максимум ' + inks[inks.length - 1]);
console.log('самый крупный глиф: ' + widest.ch + ' ' + widest.boxW.toFixed(1) + 'x' +
  widest.boxH.toFixed(1) + 'px, предел клетки ' + limit.toFixed(1) + 'px');
console.log('шире буквы M: ' + uneven + ' из ' + out.length + ' — это нормально, ' +
  'но плотность в кадре будет неравномерной');
console.log('группы: ' + Object.entries(GLYPH_GROUPS).map(([k, v]) => k + ' ' + v.length).join(', '));

bye(problems.length === 0, problems);
