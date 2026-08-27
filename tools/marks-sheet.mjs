// Контактный лист знаков: каждый род и каждый его рисунок отдельной плиткой, и не
// точками, а настоящими глифами атласа.
//
//   node tools/marks-sheet.mjs
//   node tools/marks-sheet.mjs .planning/shots/n66-marks.png
//
// Зачем. surface-check меряет свойства раскладки числами и ловит заливку, близнецов и
// одинаковый масштаб. Чего он не умеет — сказать, читается ли знак ЗНАКОМ. «Розетка
// похожа на циферблат», «формула похожа на запись» — это решает глаз, и решать ему
// удобнее по листу, чем по одному кадру мира, где всё наложено друг на друга.
//
// Лист не заменяет приёмку в мире: он отвечает на пункты про обводку, формулы и
// рисунок-не-текст. Пункты про то, что знаки лежат НА поверхности и поворачиваются
// вместе с ней, проверяются только в мире.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = process.argv[2] || 'C:/neuroglyphs/.planning/shots/n66-marks.png';
const CDP = 9399, PORT = 5173;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.log('нет Chrome — лист не снять'); process.exit(1); }

const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore', cwd: 'C:/neuroglyphs' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-marks-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--window-size=1400,1200',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore' });

let ws = null;
for (let i = 0; i < 40 && !ws; i++) {
  await sleep(250);
  try { ws = (await (await fetch('http://127.0.0.1:' + CDP + '/json/version')).json()).webSocketDebuggerUrl; } catch {}
}
if (!ws) { console.log('Chrome не поднялся'); process.exit(1); }
const sock = new WebSocket(ws);
let id = 0, sessionId = null;
const pending = new Map();
const send = (method, params = {}, sid = sessionId) => new Promise((res) => {
  const n = ++id; pending.set(n, res);
  sock.send(JSON.stringify(sid ? { id: n, method, params, sessionId: sid } : { id: n, method, params }));
});
await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
sock.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || {}); pending.delete(m.id); }
};
const targets = await send('Target.getTargets', {}, null);
const page = targets.targetInfos.find((t) => t.type === 'page');
sessionId = (await send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, null)).sessionId;
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' });
await sleep(2500);

const script = `(async () => {
  const marks = await import('/src/world/marks.js');
  const { GLYPHS } = await import('/src/core/glyphs.js');
  const { mulberry32, strToSeed } = await import('/src/core/rng.js');

  // Кегль подобран под плотность рода: обводка рисуется линией, значит глифы стоят
  // почти вплотную, а решётка — сеткой с шагом в клетку.
  const FONT = { emblem: 0.030, panel: 0.036, rosette: 0.030, edge: 0.014, marking: 0.024,
                 string: 0.032, formula: 0.075, lattice: 0.17, pattern: 0.075 };

  const TILE = 240, PAD = 26, COLS = 4;
  const cells = [];
  for (const kind of marks.MARK_KINDS) {
    for (const variant of marks.MARK_VARIANTS[kind]) cells.push([kind, variant]);
  }
  const rows = Math.ceil(cells.length / COLS);
  const cv = document.createElement('canvas');
  cv.width = COLS * TILE;
  cv.height = rows * TILE;
  const g = cv.getContext('2d');
  g.fillStyle = '#05060a';
  g.fillRect(0, 0, cv.width, cv.height);
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  const out = [0, 0, 0];
  cells.forEach(([kind, variant], idx) => {
    const ox = (idx % COLS) * TILE, oy = Math.floor(idx / COLS) * TILE;
    const rng = mulberry32(strToSeed(kind + ':' + variant + ':sheet'));
    const m = marks.buildMark(kind, rng, { variant });
    const inner = TILE - PAD * 2;
    const font = Math.max(4, Math.round(inner * (FONT[kind] || 0.03)));
    g.font = font + 'px monospace';
    g.fillStyle = '#7ff0d0';
    let drawn = 0;
    for (let i = 0; i < m.count; i++) {
      m.fill(i, out);
      if (out[0] < 0) continue;
      const gi = Math.max(0, Math.min(GLYPHS.length - 1, Math.round(out[2])));
      g.fillText(GLYPHS[gi], ox + PAD + out[0] * inner, oy + PAD + (1 - out[1]) * inner);
      drawn++;
    }
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.strokeRect(ox + 0.5, oy + 0.5, TILE - 1, TILE - 1);
    g.fillStyle = '#fff';
    g.font = '12px monospace';
    g.fillText(kind + ' / ' + variant, ox + TILE / 2, oy + 13);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.font = '10px monospace';
    g.fillText('точек ' + drawn + ', доля стены ' + m.scale.toFixed(3), ox + TILE / 2, oy + TILE - 10);
  });

  document.body.innerHTML = '';
  document.body.style.margin = '0';
  document.body.style.background = '#05060a';
  document.body.appendChild(cv);
  return JSON.stringify({ cells: cells.length, w: cv.width, h: cv.height });
})()`;

const r = await send('Runtime.evaluate', { expression: script, returnByValue: true, awaitPromise: true });
const info = r.result && r.result.value;
if (!info) {
  console.log('лист не собрался: ' + JSON.stringify(r).slice(0, 400));
  try { chrome.kill(); } catch {}
  try { srv.kill(); } catch {}
  process.exit(1);
}
console.log(info);
const { w, h } = JSON.parse(info);
await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
await sleep(600);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log('лист сохранён: ' + OUT);
try { chrome.kill(); } catch {}
try { srv.kill(); } catch {}
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
