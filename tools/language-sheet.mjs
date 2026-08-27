// Контактный лист языков: по строке на сид, в строке — формы этого языка в вариациях.
//
//   node tools/language-sheet.mjs
//   node tools/language-sheet.mjs .planning/shots/n81.png
//
// Зачем. language-check меряет числами, что языки разные, что язык ограничивает и что
// вариации при своих формах. Чего он не умеет — сказать, выглядят ли формы одного мира
// РОДНЁЙ. Это решает глаз, и решать ему удобнее по листу.
//
// Масштаб в строке ОБЩИЙ: все вариации одного языка нарисованы одной меркой, иначе
// разница в размерах — главное, чего просил человек, — на листе пропадёт.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = process.argv[2] || 'C:/neuroglyphs/.planning/shots/n81.png';
const CDP = 9401, PORT = 5173;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.log('нет Chrome — лист не снять'); process.exit(1); }

const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore', cwd: 'C:/neuroglyphs' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-lang-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--window-size=1500,1300',
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
  const L = await import('/src/world/language.js');
  const { GLYPHS } = await import('/src/core/glyphs.js');

  const SEEDS = ['0000-79hp-m53c', '0000-asnx-dnu9', '0000-0p9o-2q82', '0000-c5ki-ob23',
                 '0000-3n56-4p2k', '0000-1et9-s88l', '0000-bwd4-2jjq', '0000-bma9-zp3r'];
  const COLS = 6, CELL = 235, HEAD = 128;
  const cv = document.createElement('canvas');
  cv.width = HEAD + COLS * CELL;
  cv.height = SEEDS.length * CELL;
  const g = cv.getContext('2d');
  g.fillStyle = '#05060a';
  g.fillRect(0, 0, cv.width, cv.height);
  g.textBaseline = 'middle';

  // Лёгкий разворот, чтобы плоские формы не выглядели чертой.
  const ca = Math.cos(0.55), sa = Math.sin(0.55), cb = Math.cos(0.32), sb = Math.sin(0.32);
  const project = (x, y, z) => {
    const x1 = x * ca - z * sa, z1 = x * sa + z * ca;
    return [x1, y * cb - z1 * sb];
  };

  function rngOf(salt) {
    let s = Math.imul(salt ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
    return () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
      return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
    };
  }

  SEEDS.forEach((seed, row) => {
    const lang = L.buildLanguage(seed);
    const oy = row * CELL;

    // Шесть вариаций: формы языка по кругу, у каждой свой бросок.
    const cells = [];
    let widest = 1;
    for (let c = 0; c < COLS; c++) {
      const form = lang.forms[c % lang.forms.length];
      const v = lang.variantOf(form, rngOf(7000 + row * 101 + c * 17));
      const pts = [];
      const out = [0, 0, 0];
      let ext = 0;
      for (let i = 0; i < v.count; i++) {
        v.fill(i, out);
        const p = project(out[0], out[1], out[2]);
        pts.push(p);
        ext = Math.max(ext, Math.abs(p[0]), Math.abs(p[1]));
      }
      widest = Math.max(widest, ext);
      cells.push({ form, pts, glyphs: lang.glyphs });
    }
    // ОДНА мерка на строку: иначе разница размеров пропадёт.
    const scale = (CELL * 0.40) / widest;

    cells.forEach((cell, c) => {
      const ox = HEAD + c * CELL;
      // Разрежаем до примерно двухсот знаков на клетку и берём кегль по видимому
      // размеру. Иначе мелкие вариации сливаются в силуэт, а на референсе постройка
      // читается проволокой из символов, а не пятном.
      let ext = 1;
      for (const q of cell.pts) ext = Math.max(ext, Math.abs(q[0]), Math.abs(q[1]));
      const seen = ext * scale * 2;
      const font = Math.max(6, Math.min(14, seen / 11));
      const stride = Math.max(1, Math.round(cell.pts.length / 200));
      g.fillStyle = '#7ff0d0';
      g.font = font.toFixed(1) + 'px monospace';
      g.textAlign = 'center';
      for (let i = 0; i < cell.pts.length; i += stride) {
        const gi = cell.glyphs[(i * 7) % cell.glyphs.length];
        g.fillText(GLYPHS[gi], ox + CELL / 2 + cell.pts[i][0] * scale,
                   oy + CELL * 0.58 - cell.pts[i][1] * scale);
      }
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.font = '10px monospace';
      g.fillText(cell.form, ox + CELL / 2, oy + CELL - 12);
      g.strokeStyle = 'rgba(255,255,255,0.07)';
      g.strokeRect(ox + 0.5, oy + 0.5, CELL - 1, CELL - 1);
    });

    g.textAlign = 'left';
    g.fillStyle = '#fff';
    g.font = 'bold 12px monospace';
    g.fillText(lang.manner, 10, oy + 26);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.font = '9px monospace';
    g.fillText(seed, 10, oy + 44);
    g.fillText(lang.alphabet.join('+'), 10, oy + 60);
    g.fillText('форм ' + lang.forms.length, 10, oy + 76);
    g.fillText('плотн ' + lang.density.toFixed(2), 10, oy + 92);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.moveTo(0, oy + 0.5); g.lineTo(cv.width, oy + 0.5); g.stroke();
  });

  document.body.innerHTML = '';
  document.body.style.margin = '0';
  document.body.style.background = '#05060a';
  document.body.appendChild(cv);
  return JSON.stringify({ rows: SEEDS.length, w: cv.width, h: cv.height });
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
await sleep(600);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log('лист сохранён: ' + OUT);
try { chrome.kill(); } catch {}
try { srv.kill(); } catch {}
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
