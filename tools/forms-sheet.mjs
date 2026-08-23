// Контактный лист форм: каждая форма рисуется отдельной плиткой, чтобы её можно было
// посмотреть глазами. Нужен потому, что механически «это правда узел, а не шар» проверить
// нельзя — пробовал: подпись «радиус плюс углы» даёт 0.181 у форм, которые на кадре
// неотличимы, и 0.197 у двух честно разных узлов. Порогом это не разделяется, значит
// последнее слово за кадром.
//
//   node tools/forms-sheet.mjs
//   node tools/forms-sheet.mjs /src/world/shapeCatalog.js SHAPES .planning/shots/catalog.png
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MODULE = process.argv[2] || '/src/world/shapeIllusions.js';
const EXPORT = process.argv[3] || 'ILLUSION_SHAPES';
const OUT = process.argv[4] || 'C:/neuroglyphs/.planning/shots/forms-sheet.png';
const CDP = 9398, PORT = 5173;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(p => p && fs.existsSync(p));

const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore', cwd: 'C:/neuroglyphs' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-sheet-'));
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
const sock = new WebSocket(ws);
let id = 0, sessionId = null;
const pending = new Map();
const send = (method, params = {}, sid = sessionId) => new Promise(res => {
  const n = ++id; pending.set(n, res);
  sock.send(JSON.stringify(sid ? { id: n, method, params, sessionId: sid } : { id: n, method, params }));
});
await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
sock.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || {}); pending.delete(m.id); }
};
const targets = await send('Target.getTargets', {}, null);
const page = targets.targetInfos.find(t => t.type === 'page');
sessionId = (await send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, null)).sessionId;
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' });
await sleep(3000);

const script = `(async () => {
  const mod = await import('${MODULE}');
  const shapes = mod['${EXPORT}'];
  const keys = Object.keys(shapes);
  const P = { radius: 60, flatten: 0.8, distPow: 0.8, tubeR: 10, arms: 4, twist: 4,
    spread: 0.6, thickness: 8, strands: 3, turns: 4, clusterCount: 6, clusterRadius: 12,
    freq: 0.3, amp: 8, knotP: 3, knotQ: 4 };
  const TILE = 260, COLS = 5, N = 4000;
  const rows = Math.ceil(keys.length / COLS);
  const cv = document.createElement('canvas');
  cv.width = COLS * TILE; cv.height = rows * TILE;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  // Слегка повёрнутая проекция, чтобы плоские формы не выглядели линией.
  const ca = Math.cos(0.5), sa = Math.sin(0.5), cb = Math.cos(0.35), sb = Math.sin(0.35);
  keys.forEach((k, idx) => {
    const ox = (idx % COLS) * TILE, oy = Math.floor(idx / COLS) * TILE;
    const out = [0, 0, 0];
    const pts = [];
    for (let i = 0; i < N; i++) {
      out[0] = 0; out[1] = 0; out[2] = 0;
      shapes[k](i, P, out);
      if (!out.every(Number.isFinite)) continue;
      const x1 = out[0] * ca - out[2] * sa, z1 = out[0] * sa + out[2] * ca;
      const y1 = out[1] * cb - z1 * sb;
      pts.push([x1, y1]);
    }
    let mx = 0;
    for (const p of pts) mx = Math.max(mx, Math.abs(p[0]), Math.abs(p[1]));
    const s = mx > 0 ? (TILE * 0.40) / mx : 1;
    g.fillStyle = 'rgba(120, 255, 210, 0.55)';
    for (const p of pts) {
      g.fillRect(ox + TILE / 2 + p[0] * s, oy + TILE / 2 - p[1] * s, 1.6, 1.6);
    }
    g.fillStyle = '#fff';
    g.font = '13px monospace';
    g.fillText(k, ox + 8, oy + 18);
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.strokeRect(ox, oy, TILE, TILE);
  });
  document.body.innerHTML = '';
  document.body.style.margin = '0';
  document.body.style.background = '#000';
  document.body.appendChild(cv);
  return JSON.stringify({ forms: keys.length, w: cv.width, h: cv.height });
})()`;

const r = await send('Runtime.evaluate', { expression: script, returnByValue: true, awaitPromise: true });
console.log(r.result && r.result.value);
await send('Emulation.setDeviceMetricsOverride', {
  width: 1400, height: Math.min(4000, 260 * Math.ceil(23 / 5) + 40), deviceScaleFactor: 1, mobile: false,
});
await sleep(500);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log('лист сохранён: ' + OUT);
try { chrome.kill(); } catch {}
try { srv.kill(); } catch {}
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
