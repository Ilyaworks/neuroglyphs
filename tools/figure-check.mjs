// Проверка невозможной фигуры В МИРЕ: видно ли её от точки входа и сходятся ли швы
// из настоящей камеры, а не из той точки, которую модуль получил аргументом.
//
//   node tools/figure-check.mjs
//   node tools/figure-check.mjs --fixture     эталон: тул сам пересобирает фигуру крупной
//
// Зачем: у модуля свой гейт (impossible-check), и он зелёный — швы сходятся, иллюзия
// ломается при отходе. Но в мире фигура может оказаться в 41 единицу габарита на удалении
// 320, то есть шесть процентов ширины кадра: замкнутый треугольник, который правда
// замкнут, и которого на кадре не найти среди четырнадцати тысяч глифов. Гейт мира этого
// не видит: он спрашивает «даёт ли облако хоть двадцать пикселей», а фигура давала 470.
//
// Фигуру ищем по метке `group.userData.impossible = { kind, anchor, seams }`, где `seams`
// уже в координатах мира. Без метки проверить нечего: какое из облаков фигура, из сцены
// не следует.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NL = String.fromCharCode(10);
const CDP_PORT = 9396;
const PORT = 5173;
const READY_MS = 30000;

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const FIXTURE = process.argv.includes('--fixture');
const SEED = arg('seed', '0000-8cng-bh0b');

// Пороги. Замеры печатаются рядом с каждым.
const MIN_SCREEN = 0.20;    // экранный размер фигуры к высоте кадра
const MAX_SCREEN = 1.60;    // больше — игрок стоит внутри фигуры, а не смотрит на неё
const SEAM_MAX = 0.01;      // расхождение швов в проекции из настоящей камеры
const MIN_POINT_SIZE = 4;   // точка мельче — это не глиф, а пылинка
const MIN_AHEAD = 0.9;      // доля точек перед камерой

const problems = [];
const bad = (m) => problems.push(m);

const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('ПРОВАЛ: chrome.exe не найден'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-figure-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--window-size=800,600',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore' });

function bye(ok, lines = []) {
  try { chrome.kill(); } catch {}
  try { srv.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  if (ok) console.log('FIGURE_OK');
  else {
    console.error('');
    for (const l of lines) console.error('  x ' + l);
    console.error('');
    console.error('FIGURE_FAIL');
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
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    problems.push('исключение: ' + String((d.exception && d.exception.description) || d.text).slice(0, 200));
  }
};

async function assertOurServer(file) {
  const norm = t => t.split(String.fromCharCode(13)).join('');
  const want = norm(fs.readFileSync(file, 'utf8'));
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/' + file);
      if (norm(await r.text()) === want) return;
      bye(false, ['на порту ' + PORT + ' отвечает не этот проект']);
    } catch {}
    await sleep(250);
  }
  bye(false, ['сервер на порту ' + PORT + ' не ответил']);
}

const targets = await send('Target.getTargets', {}, null);
const page = targets.targetInfos.find(t => t.type === 'page');
sessionId = (await send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, null)).sessionId;
await send('Runtime.enable');
await send('Page.enable');
await assertOurServer('index.html');
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/?seed=' + SEED });

async function evalJson(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) {
    return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
  }
  const v = r.result && r.result.value;
  if (typeof v !== 'string') return { error: 'проба вернула не строку: ' + typeof v };
  try { return JSON.parse(v); } catch { return { error: 'не разобрать ответ пробы' }; }
}

const started = Date.now();
let ready = false;
while (Date.now() - started < READY_MS) {
  await sleep(700);
  const got = await evalJson([
    '(async () => {',
    '  const m = await import("/src/boot.js");',
    '  window.__ng = m;',
    '  let group = null;',
    '  m.scene.children.forEach(c => { if (c.userData && c.userData.seed) group = c; });',
    '  return JSON.stringify({ ok: !!group });',
    '})()',
  ].join(NL), true);
  if (got.ok) { ready = true; break; }
}
if (!ready) bye(false, ['мир по сиду ' + SEED + ' не собрался']);

// Эталон: пересобрать фигуру крупной, тем же модулем и той же точкой привязки. Так гейт
// проверяется в обе стороны, не трогая src/: если на крупной фигуре он зелёный, а на
// нынешней красный — он мерит именно размер, а не что-то своё.
if (FIXTURE) {
  const w = await evalJson([
    '(async () => {',
    '  const THREE = await import("three");',
    '  const I = await import("/src/atmosphere/impossible.js");',
    '  const m = window.__ng;',
    '  let group = null;',
    '  m.scene.children.forEach(c => { if (c.userData && c.userData.seed) group = c; });',
    '  if (!group) return JSON.stringify({ сбой: "в сцене нет группы мира" });',
    '  const clouds = [];',
    '  group.traverse(o => { if (o.isPoints) clouds.push(o); });',
    '  const donor = clouds[0];',
    '  if (!donor) return JSON.stringify({ сбой: "в группе мира нет облаков" });',
    // Фигура ставится так, как её и надо ставить: точка привязки — камера, центр — перед
    // камерой на полпути к порталу, габарит соразмерен миру.
    '  const cam = m.camera.position;',
    '  const anchor = [cam.x, cam.y, cam.z];',
    '  const exitZ = (group.userData.exitPosition && group.userData.exitPosition.z) || -400;',
    '  const center = [cam.x, cam.y, cam.z + exitZ * 0.45];',
    '  const kind = I.IMPOSSIBLE_KINDS[0];',
    '  const count = 3000;',
    '  const built = I.buildImpossible(kind, anchor, { count, extent: 260, center });',
    '  const pos = new Float32Array(count * 3);',
    '  const glyph = new Float32Array(count);',
    '  const size = new Float32Array(count);',
    '  const offset = new Float32Array(count);',
    '  const out = [0, 0, 0];',
    '  for (let i = 0; i < count; i++) {',
    '    built.fill(i, out);',
    '    pos[i * 3] = out[0]; pos[i * 3 + 1] = out[1]; pos[i * 3 + 2] = out[2];',
    '    glyph[i] = i % 128;',
    '    size[i] = 12;',
    '    offset[i] = (i % 4) / 4;',
    '  }',
    '  const geo = new THREE.BufferGeometry();',
    '  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));',
    '  geo.setAttribute("glyph", new THREE.BufferAttribute(glyph, 1));',
    '  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));',
    '  geo.setAttribute("offset", new THREE.BufferAttribute(offset, 1));',
    '  const pts = new THREE.Points(geo, donor.material);',
    '  pts.frustumCulled = false;',
    '  pts.userData.impossible = true;',
    '  group.add(pts);',
    '  group.userData.impossible = { kind, anchor, center, count, seams: built.seams };',
    '  return JSON.stringify({ ok: 1, kind });',
    '})()',
  ].join(NL), true);
  if (w.error || w.сбой) bye(false, ['эталонная сборка не удалась: ' + (w.error || w.сбой)]);
}

const PROBE = [
  '(() => {',
  '  const m = window.__ng;',
  '  let group = null;',
  '  m.scene.children.forEach(c => { if (c.userData && c.userData.seed) group = c; });',
  '  if (!group) return JSON.stringify({ сбой: "в сцене нет группы мира" });',
  '  const mark = group.userData.impossible;',
  '  if (!mark) return JSON.stringify({ сбой: "нет метки group.userData.impossible — какое из облаков фигура, из сцены не следует" });',
  '  const clouds = [];',
  '  group.traverse(o => { if (o.isPoints) clouds.push(o); });',
  '  const fig = clouds.find(o => o.userData && o.userData.impossible) ||',
  '              clouds.find(o => o.geometry.attributes.position.count === mark.count);',
  '  if (!fig) return JSON.stringify({ сбой: "облако фигуры не найдено: помечай его o.userData.impossible = true" });',
  '  const cam = m.camera;',
  '  cam.updateMatrixWorld(true);',
  '  const THREE_V = fig.geometry.attributes.position;',
  '  const w = m.renderer.domElement.width, h = m.renderer.domElement.height;',
  '  const project = (x, y, z) => {',
  '    const v = new (Object.getPrototypeOf(cam.position).constructor)(x, y, z);',
  '    v.project(cam);',
  '    return { x: (v.x * 0.5 + 0.5) * w, y: (1 - (v.y * 0.5 + 0.5)) * h, z: v.z };',
  '  };',
  '  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;',
  '  let ahead = 0, near = Infinity, far = 0;',
  '  const arr = THREE_V.array;',
  '  for (let i = 0; i < THREE_V.count; i++) {',
  '    const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];',
  '    const p = project(x, y, z);',
  '    if (p.z > -1 && p.z < 1) {',
  '      ahead++;',
  '      if (p.x < minX) minX = p.x;',
  '      if (p.x > maxX) maxX = p.x;',
  '      if (p.y < minY) minY = p.y;',
  '      if (p.y > maxY) maxY = p.y;',
  '    }',
  '    const d = Math.hypot(x - cam.position.x, y - cam.position.y, z - cam.position.z);',
  '    if (d < near) near = d;',
  '    if (d > far) far = d;',
  '  }',
  '  const seams = (mark.seams || []).map(s => {',
  '    const pa = project(s.a[0], s.a[1], s.a[2]);',
  '    const pb = project(s.b[0], s.b[1], s.b[2]);',
  '    return {',
  '      разрыв: Math.hypot(pa.x - pb.x, pa.y - pb.y) / Math.hypot(w, h),',
  '      вКадре: pa.x > 0 && pa.x < w && pa.y > 0 && pa.y < h && pa.z > -1 && pa.z < 1,',
  '      место: [Math.round(pa.x / w * 100), Math.round(pa.y / h * 100)],',
  '    };',
  '  });',
  '  const size = fig.geometry.attributes.size;',
  '  return JSON.stringify({',
  '    kind: mark.kind,',
  '    точек: THREE_V.count,',
  '    впереди: ahead / THREE_V.count,',
  '    экранШирина: (maxX - minX) / h,',
  '    экранВысота: (maxY - minY) / h,',
  '    ближе: Math.round(near), дальше: Math.round(far),',
  '    швы: seams,',
  '    размерТочки: size ? [Math.min(...size.array), Math.max(...size.array)] : null,',
  '    кадр: [w, h],',
  '  });',
  '})()',
].join(NL);

const st = await evalJson(PROBE);
if (st.error || st.сбой) bye(false, [st.error || st.сбой].concat(problems));

const screen = Math.max(st.экранШирина, st.экранВысота);
console.log('фигура: ' + st.kind + ', точек ' + st.точек + ', кадр ' + st.кадр.join('x') +
  ', удаление ' + st.ближе + '…' + st.дальше + (FIXTURE ? ' (эталонная пересборка)' : ''));
console.log('экранный размер: ' + (st.экранШирина).toFixed(3) + ' по ширине и ' +
  (st.экранВысота).toFixed(3) + ' по высоте от высоты кадра (нужно ' + MIN_SCREEN + '…' + MAX_SCREEN + ')');
console.log('точек перед камерой: ' + (st.впереди * 100).toFixed(1) + '% (нужно не меньше ' +
  (MIN_AHEAD * 100) + '%)');
console.log('швы из настоящей камеры: ' + (st.швы.length ? st.швы.map(s =>
  'разрыв ' + s.разрыв.toFixed(5) + ' (нужно ≤ ' + SEAM_MAX + '), стык ' +
  (s.вКадре ? 'в кадре' : 'ЗА КАДРОМ') + ' на ' + s.место[0] + '% x ' + s.место[1] + '% кадра'
  ).join('; ') : 'швов в метке нет'));
console.log('размер точки: ' + (st.размерТочки ? st.размерТочки.map(v => v.toFixed(1)).join('…') : 'нет атрибута size') +
  ' (нужно не меньше ' + MIN_POINT_SIZE + ')');

if (!(screen >= MIN_SCREEN)) {
  bad('фигура занимает ' + screen.toFixed(3) + ' высоты кадра при пороге ' + MIN_SCREEN +
    '. Это не ориентир, а точка: замкнутый треугольник в шесть процентов кадра среди ' +
    'четырнадцати тысяч глифов игрок не найдёт, и признак 26 не выполнится.');
}
if (screen > MAX_SCREEN) {
  bad('фигура занимает ' + screen.toFixed(3) + ' высоты кадра — игрок стоит внутри неё, ' +
    'а не смотрит на неё. Иллюзия читается только целиком.');
}
if (!(st.впереди >= MIN_AHEAD)) {
  bad('перед камерой только ' + (st.впереди * 100).toFixed(1) + '% точек фигуры: остальное ' +
    'за спиной или вне кадра. От точки входа фигура обязана быть видна целиком.');
}
if (!st.швы.length) {
  bad('в метке group.userData.impossible нет швов в координатах мира. Без них не проверить, ' +
    'сходится ли иллюзия из настоящей камеры: у модуля швы в своих координатах, а мир ' +
    'ставит фигуру со сдвигом.');
} else {
  st.швы.forEach((s, i) => {
    const gap = s.разрыв;
    if (!s.вКадре) {
      bad('шов ' + i + ' виден не в кадре: стык проецируется на ' + s.место[0] + '% x ' +
        s.место[1] + '% кадра. Иллюзия держится ровно на этом стыке — если его не видно, ' +
        'фигура читается просто большой рамкой. Уменьши габарит или отодвинь фигуру.');
    }
    if (!(gap <= SEAM_MAX)) {
      bad('шов ' + i + ' из настоящей камеры расходится на ' + gap.toFixed(5) +
        ' диагонали кадра при допуске ' + SEAM_MAX + '. Точка привязки фигуры не совпала ' +
        'с тем, откуда игрок смотрит.');
    }
  });
}
if (st.размерТочки && st.размерТочки[1] < MIN_POINT_SIZE) {
  bad('самая крупная точка фигуры — ' + st.размерТочки[1].toFixed(1) +
    ' при пороге ' + MIN_POINT_SIZE + '. Бруски собраны из пылинок, на кадре это дымка.');
}

bye(problems.length === 0, problems);
