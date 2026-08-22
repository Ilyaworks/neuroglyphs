// Прогоняет дисторсии по-настоящему: компилирует шейдеры в WebGL и пропускает через
// них известную картинку — линейный градиент по x.
//
//   node tools/shaders-check.mjs
//   node tools/shaders-check.mjs --mod tools/fixture-shaders.js
//
// Зачем: проверкой N23 был `Object.keys(m)` — счёт имён экспортов. Её проходит и шейдер
// с ошибкой в GLSL, и шейдер, который ничего не делает, и шейдер, который падает на
// первом кадре: именно так и приехал FisheyeShader с `center: { value: null }`.
//
// Картинка выбрана так, чтобы замер был однозначным. Градиент по x: тождественность
// видна как точное совпадение, бочкообразная дисторсия — как сдвиг выборки к центру
// (справа темнее, слева светлее), а расхождение каналов — как разность R и B, которая
// обязана менять знак при переходе через центр.
//
// Фильтрация текстуры линейная не для красоты: с точечной сдвиг меньше текселя не виден
// вовсе, и первый замер объявил живую хроматику мёртвой.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NL = String.fromCharCode(10);
const CDP_PORT = 9387;
const PORT = 5173;

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const rawMod = arg('mod', 'src/render/shaders.js').split('\\').join('/');
const LOCAL = (rawMod.match(/(?:tools|src)\/.*/) || [rawMod.replace(/^\//, '')])[0];
const MOD = '/' + LOCAL;

// Пороги. Замер на эталоне печатается в выводе.
const MAX_IDENTITY_DIFF = 2;   // при нулевом параметре выход обязан совпасть со входом
const MIN_FISHEYE_SHIFT = 4;   // сдвиг выборки при strength 0.5, в единицах яркости
const MIN_CHROMA_SPLIT = 8;    // расхождение R и B при amount 0.3 (на эталоне 24)
const MAX_GREEN_DRIFT = 2;     // зелёный канал — опора, он не должен уезжать

if (!fs.existsSync(LOCAL)) { console.error(LOCAL + ' не найден'); process.exit(1); }

const problems = [];
const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('ПРОВАЛ: chrome.exe не найден'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-shaders-'));
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
  if (ok) console.log('SHADERS_OK');
  else {
    console.error('');
    for (const l of lines) console.error('  x ' + l);
    console.error('');
    console.error('SHADERS_FAIL');
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
      !/favicon|404/.test(m.params.entry.text || '')) {
    problems.push('ошибка страницы: ' + m.params.entry.text.slice(0, 200));
  }
};

const targets = await send('Target.getTargets', {}, null);
const page = targets.targetInfos.find(t => t.type === 'page');
sessionId = (await send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, null)).sessionId;
await send('Runtime.enable');
await send('Log.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' });
await sleep(3000);

const PROBE = [
  '(async () => {',
  '  const THREE = await import("three");',
  '  const { FullScreenQuad } = await import("three/addons/postprocessing/Pass.js");',
  '  const sh = await import(' + JSON.stringify(MOD) + ');',
  '  const нет = ["FisheyeShader", "ChromaShader"].filter(k => !sh[k]);',
  '  if (нет.length) return JSON.stringify({ ошибка: "нет экспортов: " + нет.join(", ") });',
  '  const N = 64;',
  '  const data = new Uint8Array(N * N * 4);',
  '  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {',
  '    const v = Math.round((x / (N - 1)) * 255);',
  '    const i = (y * N + x) * 4;',
  '    data[i] = v; data[i+1] = v; data[i+2] = v; data[i+3] = 255;',
  '  }',
  '  const tex = new THREE.DataTexture(data, N, N);',
  '  tex.minFilter = THREE.LinearFilter;',
  '  tex.magFilter = THREE.LinearFilter;',
  '  tex.needsUpdate = true;',
  '  const renderer = new THREE.WebGLRenderer({ antialias: false });',
  '  renderer.setSize(N, N, false);',
  '  const target = new THREE.WebGLRenderTarget(N, N);',
  '  const прогон = (def, правки) => {',
  '    const uniforms = THREE.UniformsUtils.clone(def.uniforms);',
  '    uniforms.tDiffuse.value = tex;',
  '    for (const [k, v] of Object.entries(правки)) uniforms[k] = { value: v };',
  '    const material = new THREE.ShaderMaterial({ uniforms,',
  '      vertexShader: def.vertexShader, fragmentShader: def.fragmentShader });',
  '    const quad = new FullScreenQuad(material);',
  '    renderer.setRenderTarget(target);',
  '    let ошибка = null;',
  '    try { quad.render(renderer); } catch (e) { ошибка = String(e && e.message).slice(0, 160); }',
  '    const px = new Uint8Array(N * N * 4);',
  '    renderer.readRenderTargetPixels(target, 0, 0, N, N, px);',
  '    const glError = renderer.getContext().getError();',
  '    quad.dispose(); material.dispose();',
  '    const точка = (fx) => { const i = ((N >> 1) * N + Math.floor(N * fx)) * 4; return [px[i], px[i+1], px[i+2]]; };',
  '    return { ошибка, glError, справа: точка(0.9), слева: точка(0.1) };',
  '  };',
  '  const вход = { справа: [231, 231, 231], слева: [24, 24, 24] };',
  '  const итог = { вход };',
  '  итог.fisheyeКакОтдан = прогон(sh.FisheyeShader, {});',
  '  итог.fisheye0 = прогон(sh.FisheyeShader, { strength: 0, center: new THREE.Vector2(0.5, 0.5) });',
  '  итог.fisheyeПлюс = прогон(sh.FisheyeShader, { strength: 0.5, center: new THREE.Vector2(0.5, 0.5) });',
  '  итог.fisheyeМинус = прогон(sh.FisheyeShader, { strength: -0.5, center: new THREE.Vector2(0.5, 0.5) });',
  '  итог.chroma0 = прогон(sh.ChromaShader, { amount: 0 });',
  '  итог.chromaПлюс = прогон(sh.ChromaShader, { amount: 0.3 });',
  '  итог.поляFisheye = Object.keys(sh.FisheyeShader.uniforms || {});',
  '  итог.поляChroma = Object.keys(sh.ChromaShader.uniforms || {});',
  '  renderer.dispose();',
  '  return JSON.stringify(итог);',
  '})()',
].join(NL);

const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true, awaitPromise: true });
if (r.exceptionDetails) {
  bye(false, ['проба упала: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)].concat(problems));
}
let d;
try { d = JSON.parse(r.result.value); } catch (e) { bye(false, ['проба вернула не JSON'].concat(problems)); }
if (d.ошибка) bye(false, [d.ошибка].concat(problems));

const p3 = (v) => Array.isArray(v) ? v.join('/') : String(v);
const diff = (a, b) => Math.max(...[0, 1, 2].map(i => Math.abs(a[i] - b[i])));
const rb = (v) => v[0] - v[2];

console.log('модуль: ' + MOD);
console.log('uniform-ы: fisheye ' + d.поляFisheye.join(', ') + ' | chroma ' + d.поляChroma.join(', '));
console.log('вход (справа/слева): ' + p3(d.вход.справа) + '  ' + p3(d.вход.слева));
for (const [имя, з] of [['как отдан', d.fisheyeКакОтдан], ['strength 0', d.fisheye0],
    ['strength +0.5', d.fisheyeПлюс], ['strength -0.5', d.fisheyeМинус],
    ['chroma 0', d.chroma0], ['chroma 0.3', d.chromaПлюс]]) {
  console.log('  ' + имя.padEnd(14) + ' справа ' + p3(з.справа) + ', слева ' + p3(з.слева) +
    (з.ошибка ? ' — ПАДЕНИЕ: ' + з.ошибка : '') + (з.glError ? ' — ошибка GL ' + з.glError : ''));
}

for (const k of ['tDiffuse', 'strength', 'center']) {
  if (!d.поляFisheye.includes(k)) problems.push('у FisheyeShader нет uniform ' + k);
}
for (const k of ['tDiffuse', 'amount']) {
  if (!d.поляChroma.includes(k)) problems.push('у ChromaShader нет uniform ' + k);
}
// Шейдер обязан работать как отдан: значения по умолчанию — часть контракта.
if (d.fisheyeКакОтдан.ошибка) {
  problems.push('FisheyeShader падает с нетронутыми uniform-ами: ' + d.fisheyeКакОтдан.ошибка +
    '. Значения по умолчанию — часть модуля: три читает у vec2 поле x, и null роняет ' +
    'первый же кадр. Ставь new Vector2(0.5, 0.5).');
} else if (diff(d.fisheyeКакОтдан.справа, d.вход.справа) > MAX_IDENTITY_DIFF) {
  problems.push('FisheyeShader с нетронутыми uniform-ами уже искажает картинку: справа ' +
    p3(d.fisheyeКакОтдан.справа) + ' против входа ' + p3(d.вход.справа) +
    '. По задаче strength = 0 значит «выключено».');
}
for (const [имя, з] of [['FisheyeShader при strength 0', d.fisheye0], ['ChromaShader при amount 0', d.chroma0]]) {
  if (з.ошибка) { problems.push(имя + ' падает: ' + з.ошибка); continue; }
  const dd = Math.max(diff(з.справа, d.вход.справа), diff(з.слева, d.вход.слева));
  console.log(имя + ': расхождение со входом ' + dd + ' (порог ' + MAX_IDENTITY_DIFF + ')');
  if (dd > MAX_IDENTITY_DIFF) {
    const чёрное = з.справа.every(v => v === 0) && з.слева.every(v => v === 0);
    problems.push(имя + ' меняет картинку: расхождение со входом ' + dd +
      ' при пороге ' + MAX_IDENTITY_DIFF + '. ' + (чёрное
        ? 'Выход целиком чёрный — обычно это значит, что шейдер не скомпилировался: ' +
          'смотри ошибку компиляции GLSL в консоли страницы.'
        : 'Ноль обязан быть тождественностью.'));
  }
}
// Бочка: выборка тянется к центру, справа темнеет, слева светлеет. Знак strength
// обязан разворачивать смещение.
if (!d.fisheyeПлюс.ошибка && !d.fisheyeМинус.ошибка) {
  const плюсСправа = d.вход.справа[1] - d.fisheyeПлюс.справа[1];
  const плюсСлева = d.fisheyeПлюс.слева[1] - d.вход.слева[1];
  const минусСправа = d.fisheyeМинус.справа[1] - d.вход.справа[1];
  console.log('бочка при strength +0.5: справа темнее на ' + плюсСправа + ', слева светлее на ' +
    плюсСлева + ' (нужно не меньше ' + MIN_FISHEYE_SHIFT + '); при -0.5 справа светлее на ' + минусСправа);
  if (!(плюсСправа >= MIN_FISHEYE_SHIFT) || !(плюсСлева >= MIN_FISHEYE_SHIFT)) {
    problems.push('бочкообразной дисторсии нет: при strength 0.5 выборка сдвинулась к центру на ' +
      плюсСправа + '/' + плюсСлева + ' при пороге ' + MIN_FISHEYE_SHIFT +
      '. Проверь, что uv считается от center, а не от нуля.');
  }
  if (!(минусСправа >= MIN_FISHEYE_SHIFT)) {
    problems.push('знак strength не разворачивает дисторсию: при -0.5 сдвиг ' + минусСправа +
      ' вместо обратного');
  }
}
// Хроматика: R и B расходятся радиально, знак разности переворачивается через центр,
// зелёный остаётся опорой.
if (!d.chromaПлюс.ошибка) {
  const справа = rb(d.chromaПлюс.справа);
  const слева = rb(d.chromaПлюс.слева);
  const зелёный = Math.max(Math.abs(d.chromaПлюс.справа[1] - d.вход.справа[1]),
    Math.abs(d.chromaПлюс.слева[1] - d.вход.слева[1]));
  console.log('хроматика при amount 0.3: R-B справа ' + справа + ', слева ' + слева +
    ' (нужно не меньше ' + MIN_CHROMA_SPLIT + ' и с разными знаками), уход зелёного ' + зелёный);
  // Разности R-B недостаточно: сдвинь только синий — и знак всё равно перевернётся,
  // а красный останется на месте. Мутация «хроматика мертва» проскочила именно так.
  const уходR = Math.max(Math.abs(d.chromaПлюс.справа[0] - d.вход.справа[0]),
    Math.abs(d.chromaПлюс.слева[0] - d.вход.слева[0]));
  const уходB = Math.max(Math.abs(d.chromaПлюс.справа[2] - d.вход.справа[2]),
    Math.abs(d.chromaПлюс.слева[2] - d.вход.слева[2]));
  console.log('  ушли оба канала: красный на ' + уходR + ', синий на ' + уходB +
    ' (нужно каждому не меньше ' + (MIN_CHROMA_SPLIT / 2) + ')');
  if (!(уходR >= MIN_CHROMA_SPLIT / 2) || !(уходB >= MIN_CHROMA_SPLIT / 2)) {
    problems.push('расходится только один канал: красный ушёл на ' + уходR + ', синий на ' + уходB +
      ' при пороге ' + (MIN_CHROMA_SPLIT / 2) + ' каждому. Оба обязаны сдвигаться, в разные стороны.');
  }
  if (!(Math.abs(справа) >= MIN_CHROMA_SPLIT) || !(Math.abs(слева) >= MIN_CHROMA_SPLIT)) {
    problems.push('расхождения каналов нет: R-B справа ' + справа + ', слева ' + слева +
      ' при пороге ' + MIN_CHROMA_SPLIT);
  } else if (справа * слева > 0) {
    problems.push('расхождение каналов не радиальное: R-B справа ' + справа + ' и слева ' + слева +
      ' одного знака, а при переходе через центр знак обязан переворачиваться');
  }
  if (зелёный > MAX_GREEN_DRIFT) {
    problems.push('зелёный канал уехал на ' + зелёный + ' при пороге ' + MAX_GREEN_DRIFT +
      ': он опорный, расходиться должны красный и синий');
  }
}

bye(problems.length === 0, problems);
