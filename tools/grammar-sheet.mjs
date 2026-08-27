// Контактный лист грамматики: по плитке на правило сборки.
//
//   node tools/grammar-sheet.mjs
//   node tools/grammar-sheet.mjs .planning/shots/n86.png
//
// Зачем. grammar-check меряет числами: зазоры, соосность, симметрию, монотонность.
// Чего он не умеет — сказать, читается ли расстановка ПОСТРОЙКОЙ. Это решает глаз.
//
// Каждая копия рисуется коробкой её габарита, с учётом поворота: так видно не только
// где копия стоит, но и куда развёрнута — у зала колонны смотрят в неф, у веера в центр.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = process.argv[2] || 'C:/neuroglyphs/.planning/shots/n86.png';
const CDP = 9402, PORT = 5173;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.log('нет Chrome — лист не снять'); process.exit(1); }

const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore', cwd: 'C:/neuroglyphs' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-gram-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--window-size=1400,1000',
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
await sleep(2200);

const script = `(async () => {
  const G = await import('/src/world/grammar.js');
  const ELEMENT = { footprint: [40, 90, 30] };
  const SEED = '0000-3n56-4p2k';

  const CELL = 420, COLS = 3;
  const rows = Math.ceil(G.RULES.length / COLS);
  const cv = document.createElement('canvas');
  cv.width = COLS * CELL;
  cv.height = rows * CELL;
  const g = cv.getContext('2d');
  g.fillStyle = '#05060a';
  g.fillRect(0, 0, cv.width, cv.height);
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  // Взгляд с угла и сверху: так видно и глубину, и высоту.
  const ca = Math.cos(0.62), sa = Math.sin(0.62), cb = Math.cos(0.42), sb = Math.sin(0.42);
  const project = (x, y, z) => {
    const x1 = x * ca - z * sa, z1 = x * sa + z * ca;
    return [x1, y * cb - z1 * sb];
  };

  G.RULES.forEach((rule, idx) => {
    const ox = (idx % COLS) * CELL, oy = Math.floor(idx / COLS) * CELL;
    const r = G.assemble(rule, ELEMENT, SEED, {});
    const f = ELEMENT.footprint;

    // Восемь углов коробки копии, с поворотом вокруг Y.
    const corners = [];
    for (const p of r.places) {
      const c = Math.cos(p.turn || 0), s = Math.sin(p.turn || 0);
      const hw = f[0] * p.scale / 2, hh = f[1] * p.scale, hd = f[2] * p.scale / 2;
      const box = [];
      for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
        const lx = sx * hw, lz = sz * hd;
        box.push(project(p.at[0] + lx * c - lz * s, p.at[1] + sy * hh, p.at[2] + lx * s + lz * c));
      }
      corners.push(box);
    }

    let ex = 1;
    for (const box of corners) for (const q of box) ex = Math.max(ex, Math.abs(q[0]), Math.abs(q[1]));
    const scale = (CELL * 0.36) / ex;
    const px = (q) => ox + CELL / 2 + q[0] * scale;
    const py = (q) => oy + CELL * 0.56 - q[1] * scale;

    // Рёбра коробки: порядок углов — sx, sy, sz по битам
    const EDGES = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
    corners.forEach((box, k) => {
      const t = k / Math.max(1, corners.length - 1);
      g.strokeStyle = 'rgba(127,240,208,' + (0.9 - t * 0.45).toFixed(2) + ')';
      g.lineWidth = 1.1;
      g.beginPath();
      for (const [a, b] of EDGES) {
        g.moveTo(px(box[a]), py(box[a]));
        g.lineTo(px(box[b]), py(box[b]));
      }
      g.stroke();
    });

    // Ось постройки
    if (r.axis) {
      const a = project(r.axis.from[0], r.axis.from[1], r.axis.from[2]);
      const b = project(r.axis.to[0], r.axis.to[1], r.axis.to[2]);
      g.strokeStyle = 'rgba(255,180,90,0.55)';
      g.setLineDash([5, 5]);
      g.beginPath(); g.moveTo(px(a), py(a)); g.lineTo(px(b), py(b)); g.stroke();
      g.setLineDash([]);
    }

    g.fillStyle = '#fff';
    g.font = 'bold 14px monospace';
    g.fillText(rule, ox + CELL / 2, oy + 22);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.font = '11px monospace';
    g.fillText('копий ' + r.places.length, ox + CELL / 2, oy + CELL - 18);
    g.strokeStyle = 'rgba(255,255,255,0.1)';
    g.strokeRect(ox + 0.5, oy + 0.5, CELL - 1, CELL - 1);
  });

  document.body.innerHTML = '';
  document.body.style.margin = '0';
  document.body.style.background = '#05060a';
  document.body.appendChild(cv);
  return JSON.stringify({ rules: G.RULES.length, w: cv.width, h: cv.height });
})()`;

const r = await send('Runtime.evaluate', { expression: script, returnByValue: true, awaitPromise: true });
const info = r.result && r.result.value;
if (!info) {
  console.log('лист не собрался: ' + JSON.stringify(r).slice(0, 500));
  try { chrome.kill(); } catch {}
  try { srv.kill(); } catch {}
  process.exit(1);
}
console.log(info);
const { w, h } = JSON.parse(info);
await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
await sleep(500);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log('лист сохранён: ' + OUT);
try { chrome.kill(); } catch {}
try { srv.kill(); } catch {}
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
