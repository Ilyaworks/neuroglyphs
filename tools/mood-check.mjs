// Проверка признака 8 из REFERENCE.md: палитра настроения доходит до сцены, и настроения
// различимы на кадре числом, а не на слово.
//
//   node tools/mood-check.mjs
//   node tools/mood-check.mjs --fixture              эталон: тул сам применяет палитру
//   node tools/mood-check.mjs --structure 3 --density 9
//
// Зачем: у N26 проверкой был `node --check src/world/world.js` плюс `world-check`. Обе
// проходит мир, в котором палитра посчитана и выброшена: `resolvePalette` вызван,
// результат положен в userData и нигде не применён. Экран при этом остаётся на зашитых
// цветах `buildFieldMaterial` — те же cyan/magenta/green/white во всех шести настроениях.
// `world-check` этого не видит: он сравнивает атрибуты геометрии, а цвет живёт в uniform-ах.
//
// Чего этот гейт НЕ проверяет и почему. В тексте N26 был обещан замер «два сида,
// различающиеся только полем mood, дают ту же геометрию и другой цвет». Такого замера быть
// не может: `decodeSeed` заводит поток случайности от всего упакованного кода —
// `mulberry32(packed & 0xffffffff ^ packed >> 32)`. Сдвиг трёх бит настроения меняет весь
// поток: на сидах 0000-755t-l5w3 и 0000-755t-l5xv, отличающихся только полем mood, первые
// числа потока 0.526492 и 0.421217. Значит и раскладка другая, и геометрия другая — при том,
// что поле structure одно и то же. Требовать побайтово равную геометрию значило бы требовать
// переделки кодека сида, а признак 8 просит не этого. Поэтому от геометрии тут спрашивается
// только то, что честно проверяемо: тот же номер структуры и то же число точек в допуске.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const NL = String.fromCharCode(10);
const CDP_PORT = 9391;
const PORT = 5173;
const READY_MS = 30000;
const STABLE_MS = 700;

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const FIXTURE = process.argv.includes('--fixture');
const STRUCTURE = Number(arg('structure', '3'));
const DENSITY = Number(arg('density', '9'));
// Мутация: намеренная поломка, наносимая в странице перед замером. Нужна, чтобы
// проверить сам гейт: инструмент, который не краснеет ни на чём, ничего не стережёт.
// Ломать в странице, а не в файлах, приходится потому, что src/ во время сессии держит
// модель, и правка файлов проверяющим — это изменение кода мимо ворот.
const MUTATE = arg('mutate', '');

// Пороги. Все замерены на эталоне, замер печатается рядом с порогом.
const COLOR_TOL = 3;        // ±3 на канал: THREE.Color гоняет цвет через линейное
                            // пространство и обратно, round-trip даёт расхождение в единицу
const FOG_MIN = 0.0003;     // полоса сцены из N26: ниже — тумана нет
const FOG_MAX = 0.0040;     // выше — мир тонет в заливке
const FOG_SPREAD_MIN = 2;   // самый густой туман к самому редкому: в палитрах разрыв 10x
const COUNT_TOL = 0.10;     // разброс числа точек между настроениями
// Поле обязано что-то нарисовать, иначе цвет мерить нечем. Порог не абсолютный, а от числа
// точек: первая версия требовала 2000 светящихся пикселей и падала на сиде с density=0 —
// там поле честно состоит из 1500 точек, и 438 пикселей у eerie это не дефект, а самый
// разреженный мир из возможных. Замеры доли светящихся пикселей к точкам поля: на
// density=9 это 0.48…3.69, на density=0 — 0.29…5.29. Порог 0.15 оставляет запас вдвое
// от худшего замера (eerie на density=0).
const MIN_LIT_RATIO = 0.15;
const MIN_LIT_FLOOR = 200;

// Пороги на цвет кадра. Ставятся по замеру на эталоне, замер печатается рядом.
// HUE_MARGIN: худшее из четырёх названных настроений на эталоне — joyful, 0.350.
// VOID_MAX_SPREAD: у void разброс каналов 0.030.
// PAIR_MIN: попарное расстояние считается не по одному оттенку, а по вектору
// [доли R, G, B, средняя яркость/255]. Причина в том, что первая версия этого гейта
// мерила только оттенок и объявляла дефектом честную пару: void и claustrophobic — оба
// серые, доли каналов 0.320/0.330/0.350 и 0.317/0.317/0.367, расстояние 0.022. Они
// отличаются не цветом, а светимостью и густотой тумана: яркость 129.4 против 66.2, и по
// четырёхмерному вектору расстояние выходит 0.249. Худшая пара на эталоне — void и uncanny,
// 0.167; порог 0.04 оставляет запас вчетверо.
const HUE_MARGIN = Number(arg('hue-margin', '0.10'));
const PAIR_MIN = Number(arg('pair-min', '0.04'));
const VOID_MAX_SPREAD = Number(arg('void-spread', '0.10'));

const problems = [];
const bad = (m) => problems.push(m);

for (const f of ['src/core/seed.js', 'src/art/palettes.js', 'src/world/world.js']) {
  if (!fs.existsSync(f)) { console.error(f + ' не найден'); process.exit(1); }
}

const seedMod = await import(pathToFileURL(path.resolve('src/core/seed.js')).href);
const palMod = await import(pathToFileURL(path.resolve('src/art/palettes.js')).href);

// Шесть сидов, отличающихся ровно полем mood: остальные поля прибиты, поэтому номер
// структуры и цель по плотности одни и те же во всех шести мирах.
const BASE = {
  structure: STRUCTURE, palette: 2, mood: 0, density: DENSITY,
  fractal: 4, motion: 2, nonEuclid: 1, music: 7, shape: 21, exit: 130,
};
const cases = palMod.PALETTES.map((name, mood) => {
  const code = seedMod.encodeSeed({ ...BASE, mood });
  const fields = code ? seedMod.decodeSeed(code) : null;
  return { name, mood, code, fields, pal: fields ? palMod.resolvePalette(fields) : null };
});
if (cases.some(c => !c.code || !c.fields || !c.pal)) {
  console.error('не удалось собрать сиды на шесть настроений — проверь encodeSeed/decodeSeed');
  process.exit(1);
}

const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('ПРОВАЛ: chrome.exe не найден'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-mood-'));
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
  if (ok) console.log('MOOD_OK');
  else {
    console.error('');
    for (const l of lines) console.error('  x ' + l);
    console.error('');
    console.error('MOOD_FAIL');
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
      !/favicon/.test(m.params.entry.url || '')) {
    problems.push('ошибка страницы: ' + String(m.params.entry.text).slice(0, 200));
  }
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
      bye(false, ['на порту ' + PORT + ' отвечает не этот проект: ' + file + ' не совпадает ' +
        'с файлом на диске. Сними процесс, который держит порт: netstat -ano | findstr :' + PORT]);
    } catch {}
    await sleep(250);
  }
  bye(false, ['сервер на порту ' + PORT + ' не ответил за 10 секунд']);
}

const targets = await send('Target.getTargets', {}, null);
const page = targets.targetInfos.find(t => t.type === 'page');
sessionId = (await send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, null)).sessionId;
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await assertOurServer('index.html');

async function evalJson(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) {
    return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
  }
  const v = r.result && r.result.value;
  if (typeof v !== 'string') return { error: 'проба вернула не строку: ' + typeof v };
  try { return JSON.parse(v); } catch { return { error: 'не разобрать ответ пробы' }; }
}

// Слепок сцены: цвет фона, туман, спектр материала поля. Группу мира ищем по userData.seed —
// её ставит world.js, и она есть в мире начиная с N11.
const PROBE = [
  '(() => {',
  '  const m = window.__ng_boot;',
  '  let group = null;',
  '  m.scene.children.forEach(c => { if (c.userData && c.userData.seed) group = c; });',
  '  if (!group) return JSON.stringify({ сбой: "в сцене нет группы мира с userData.seed" });',
  '  const clouds = [];',
  '  group.traverse(o => { if (o.isPoints) clouds.push(o); });',
  '  const hex = (c) => (c && c.getHexString) ? "#" + c.getHexString() : null;',
  '  const spectrumOf = (o) => {',
  '    const u = o.material && o.material.uniforms && o.material.uniforms.uSpectrum;',
  '    return (u && Array.isArray(u.value)) ? u.value.map(hex) : null;',
  '  };',
  '  const fogOf = (o) => {',
  '    const u = o.material && o.material.uniforms && o.material.uniforms.uFogDensity;',
  '    return u ? u.value : null;',
  '  };',
  '  const h = (arr) => {',
  '    let x = 2166136261;',
  '    for (let i = 0; i < arr.length; i++) { x ^= Math.round(arr[i] * 1000) | 0; x = Math.imul(x, 16777619) >>> 0; }',
  '    return x;',
  '  };',
  '  const field = clouds[0] || null;',
  '  return JSON.stringify({',
  '    bg: hex(m.scene.background),',
  '    fog: m.scene.fog ? { color: hex(m.scene.fog.color), density: m.scene.fog.density } : null,',
  '    structure: group.userData.structure,',
  '    hasPalette: !!group.userData.palette,',
  '    field: field ? {',
  '      count: field.geometry.attributes.position.count,',
  '      spectrum: spectrumOf(field),',
  '      fogDensity: fogOf(field),',
  '      hash: h(field.geometry.attributes.position.array),',
  '    } : null,',
  '    clouds: clouds.length,',
  '    search: location.search,',
  '  });',
  '})()',
].join(NL);

// Кадр для замера цвета. Три решения, у каждого своя причина:
// 1. Рисуем напрямую renderer.render, минуя композер: bloom тянет плотные места к белому,
//    а на выбеленном пикселе оттенка нет. Цвет мерится до свечения — намеренно.
// 2. Фон на время замера гасится в ноль: у joyful он #140b02, то есть ярче порога
//    «пиксель светится», и без этого замер мерил бы фон, а не глифы.
// 3. Видимым оставляем только поле: дальний план и портал живут на своих цветах,
//    в контракте N26 их нет, а в замер они подмешивались бы на всех настроениях одинаково.
const FRAME = [
  '(() => {',
  '  const m = window.__ng_boot;',
  '  let group = null;',
  '  m.scene.children.forEach(c => { if (c.userData && c.userData.seed) group = c; });',
  '  if (!group) return JSON.stringify({ сбой: "в сцене нет группы мира" });',
  '  const inGroup = [];',
  '  group.traverse(o => { if (o.isPoints) inGroup.push(o); });',
  '  const all = [];',
  '  m.scene.traverse(o => { if (o.isPoints) all.push(o); });',
  '  const vis = all.map(o => o.visible);',
  '  all.forEach(o => { o.visible = (o === inGroup[0]); });',
  '  all.forEach(o => {',
  '    const u = o.material && o.material.uniforms && o.material.uniforms.uPulse;',
  '    if (u) u.value = 0.5;',
  '  });',
  '  const savedBg = m.scene.background;',
  '  m.scene.background = null;',
  '  const gl = m.renderer.getContext();',
  '  const w = 400, hh = 300;',
  '  const px = new Uint8Array(w * hh * 4);',
  '  m.renderer.render(m.scene, m.camera);',
  '  gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, px);',
  '  m.scene.background = savedBg;',
  '  all.forEach((o, i) => { o.visible = vis[i]; });',
  '  let lit = 0, r = 0, g = 0, b = 0, litU = 0, rU = 0, gU = 0, bU = 0, sat = 0;',
  '  for (let i = 0; i < px.length; i += 4) {',
  '    const mx = Math.max(px[i], px[i+1], px[i+2]);',
  '    if (mx <= 16) continue;',
  '    lit++; r += px[i]; g += px[i+1]; b += px[i+2];',
  '    if (mx >= 250) { sat++; continue; }',
  '    litU++; rU += px[i]; gU += px[i+1]; bU += px[i+2];',
  '  }',
  '  return JSON.stringify({ lit, r, g, b, litU, rU, gU, bU, sat, total: w * hh });',
  '})()',
].join(NL);

// Эталон. Тем и хорош, что это не файл-двойник, а та самая проводка, которую просит N26,
// выполненная снаружи: если гейт зелен с ней и красен без неё — он мерит именно проводку
// палитры, а не что-то своё.
const FIXTURE_WIRE = [
  '(async () => {',
  '  const THREE = await import("three");',
  '  const P = await import("/src/art/palettes.js");',
  '  const S = await import("/src/core/seed.js");',
  '  const m = window.__ng_boot;',
  '  const code = new URLSearchParams(location.search).get("seed");',
  '  const fields = S.decodeSeed(code);',
  '  if (!fields) return JSON.stringify({ сбой: "сид из адреса не разбирается: " + code });',
  '  const pal = P.resolvePalette(fields);',
  '  let group = null;',
  '  m.scene.children.forEach(c => { if (c.userData && c.userData.seed) group = c; });',
  '  if (!group) return JSON.stringify({ сбой: "в сцене нет группы мира" });',
  '  group.userData.palette = pal;',
  '  m.scene.background = new THREE.Color(pal.bg);',
  '  const mix = Math.min(0.0040, Math.max(0.0003, pal.fogDensity * (0.75 + 0.5 * fields.density / 15)));',
  '  m.scene.fog = new THREE.FogExp2(new THREE.Color(pal.fog).getHex(), mix);',
  '  let field = null;',
  '  group.traverse(o => { if (!field && o.isPoints) field = o; });',
  '  if (!field) return JSON.stringify({ сбой: "в группе мира нет облака точек" });',
  '  field.material.uniforms.uSpectrum.value = pal.glyph.map(h => new THREE.Color(h));',
  '  field.material.uniforms.uFogDensity.value = mix;',
  '  return JSON.stringify({ ok: 1, mix });',
  '})()',
].join(NL);

// Мутации. Каждая — правдоподобный способ сдать N26 так, чтобы палитра до кадра не
// дошла. Гейт обязан краснеть на каждой; список прогонов и результат — в .planning/review.
const MUTATIONS = {
  spectrum: 'field.material.uniforms.uSpectrum.value = [0x00ffff, 0xff00ff, 0x00ff88, 0xffffff].map(h => new THREE.Color(h));',
  bg: 'm.scene.background = new THREE.Color(0x0a0a0a);',
  fogcolor: 'm.scene.fog.color = new THREE.Color(0x555555);',
  fogflat: 'field.material.uniforms.uFogDensity.value = 0.0011;',
  fogband: 'field.material.uniforms.uFogDensity.value = 0.03;',
  fogflip: 'field.material.uniforms.uFogDensity.value = 0.0043 - field.material.uniforms.uFogDensity.value;',
  onemood: [
    'const first = P.resolvePalette({ mood: 0, palette: 0 });',
    'm.scene.background = new THREE.Color(first.bg);',
    'm.scene.fog.color = new THREE.Color(first.fog);',
    'field.material.uniforms.uSpectrum.value = first.glyph.map(h => new THREE.Color(h));',
    'field.material.uniforms.uFogDensity.value = first.fogDensity;',
  ].join(NL),
  gray: 'field.material.uniforms.uSpectrum.value = ["#808080", "#a0a0a0", "#606060", "#c0c0c0"].map(h => new THREE.Color(h));',
};

const mutationScript = (body) => [
  '(async () => {',
  '  const THREE = await import("three");',
  '  const P = await import("/src/art/palettes.js");',
  '  const m = window.__ng_boot;',
  '  let group = null;',
  '  m.scene.children.forEach(c => { if (c.userData && c.userData.seed) group = c; });',
  '  if (!group) return JSON.stringify({ сбой: "в сцене нет группы мира" });',
  '  let field = null;',
  '  group.traverse(o => { if (!field && o.isPoints) field = o; });',
  '  if (!field) return JSON.stringify({ сбой: "в группе мира нет облака точек" });',
  '  ' + body,
  '  return JSON.stringify({ ok: 1 });',
  '})()',
].join(NL);

if (MUTATE && !MUTATIONS[MUTATE]) {
  console.error('нет такой мутации: ' + MUTATE + '. Есть: ' + Object.keys(MUTATIONS).join(', '));
  process.exit(1);
}

const READY = [
  '(async () => {',
  '  const m = await import("/src/boot.js");',
  '  window.__ng_boot = m;',
  '  const clouds = [];',
  '  m.scene.traverse(o => { if (o.isPoints) clouds.push(o); });',
  '  let nonZero = 0;',
  '  if (clouds[0]) {',
  '    const p = clouds[0].geometry.attributes.position.array;',
  '    for (let i = 0; i < p.length; i += 3) if (p[i] || p[i+1] || p[i+2]) nonZero++;',
  '  }',
  '  return JSON.stringify({ clouds: clouds.length, nonZero });',
  '})()',
].join(NL);

async function load(seed) {
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/?seed=' + seed });
  const startedAt = Date.now();
  let prev = null;
  while (Date.now() - startedAt < READY_MS) {
    await sleep(STABLE_MS);
    const got = await evalJson(READY, true);
    if (got.error || !got.clouds) { prev = null; continue; }
    const key = JSON.stringify(got);
    if (prev === key && got.nonZero > 0) return true;
    prev = key;
  }
  return false;
}

const hexOk = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  for (let s = 0; s <= 16; s += 8) {
    if (Math.abs(((A >> s) & 255) - ((B >> s) & 255)) > COLOR_TOL) return false;
  }
  return true;
};

console.log('стенд: структура ' + STRUCTURE + ', плотность ' + DENSITY +
  ', эталонная проводка: ' + (FIXTURE ? 'да' : 'нет') +
  (MUTATE ? ', мутация: ' + MUTATE : ''));

const measured = [];
for (const c of cases) {
  if (!(await load(c.code))) {
    bye(false, ['мир по сиду ' + c.code + ' (' + c.name + ') не собрался за ' + READY_MS + ' мс']
      .concat(problems));
  }
  if (FIXTURE) {
    const w = await evalJson(FIXTURE_WIRE, true);
    if (w.error || w.сбой) bye(false, ['эталонная проводка не применилась: ' + (w.error || w.сбой)]);
  }
  if (MUTATE) {
    const w = await evalJson(mutationScript(MUTATIONS[MUTATE]), true);
    if (w.error || w.сбой) bye(false, ['мутация ' + MUTATE + ' не применилась: ' + (w.error || w.сбой)]);
  }
  const state = await evalJson(PROBE);
  if (state.error || state.сбой) {
    bye(false, ['проба сцены не прошла на ' + c.name + ': ' + (state.error || state.сбой)]);
  }
  const frame = await evalJson(FRAME);
  if (frame.error || frame.сбой) {
    bye(false, ['замер кадра не прошёл на ' + c.name + ': ' + (frame.error || frame.сбой)]);
  }
  const share = (r, g, b) => {
    const s = r + g + b;
    return s > 0 ? [r / s, g / s, b / s] : [0, 0, 0];
  };
  measured.push({
    ...c, state, frame,
    share: share(frame.r, frame.g, frame.b),
    shareU: share(frame.rU, frame.gU, frame.bU),
    // Светимость нужна отдельной осью: серые настроения отличаются друг от друга не
    // оттенком, а тем, насколько ярки глифы.
    mean: frame.lit > 0 ? (frame.r + frame.g + frame.b) / (3 * frame.lit) : 0,
  });
}

console.log('');
console.log('настроение       сид             фон сцены  ожидался   туман поля  ожидался   точек');
for (const m of measured) {
  const st = m.state;
  console.log('  ' + m.name.padEnd(14) + ' ' + m.code + '  ' +
    String(st.bg || '—').padEnd(10) + ' ' + m.pal.bg.padEnd(10) + ' ' +
    String(st.field && typeof st.field.fogDensity === 'number' ? st.field.fogDensity.toFixed(5) : '—').padEnd(11) +
    ' ' + String(m.pal.fogDensity).padEnd(10) + ' ' + (st.field ? st.field.count : '—'));
}

console.log('');
console.log('спектр материала поля (четыре слота uSpectrum):');
for (const m of measured) {
  const got = (m.state.field && m.state.field.spectrum) || null;
  console.log('  ' + m.name.padEnd(14) + ' в сцене:   ' + (got ? got.join(' ') : 'нет uSpectrum'));
  console.log('  ' + ' '.repeat(14) + ' в палитре: ' + m.pal.glyph.join(' '));
}

console.log('');
console.log('цвет кадра (только поле, без свечения, фон погашен): доли каналов R/G/B');
for (const m of measured) {
  const [r, g, b] = m.share;
  const [ru, gu, bu] = m.shareU;
  console.log('  ' + m.name.padEnd(14) +
    ' светится ' + String(m.frame.lit).padStart(6) + ', в потолке ' + String(m.frame.sat).padStart(5) +
    ' | все: ' + r.toFixed(3) + '/' + g.toFixed(3) + '/' + b.toFixed(3) +
    ' | не в потолке: ' + ru.toFixed(3) + '/' + gu.toFixed(3) + '/' + bu.toFixed(3) +
    ' | яркость ' + m.mean.toFixed(1));
}

// 1. Палитра доходит до сцены.
for (const m of measured) {
  const st = m.state;
  if (!st.field) { bad('в группе мира нет облака точек — мерить нечего'); continue; }
  if (!hexOk(st.bg, m.pal.bg)) {
    bad('фон сцены на настроении ' + m.name + ' — ' + st.bg + ', а палитра просит ' + m.pal.bg +
      '. scene.background создаётся в boot.js, туда палитру и надо донести.');
  }
  if (!st.fog) bad('в сцене нет scene.fog на настроении ' + m.name);
  else if (!hexOk(st.fog.color, m.pal.fog)) {
    bad('цвет тумана сцены на ' + m.name + ' — ' + st.fog.color + ', а палитра просит ' + m.pal.fog);
  }
  const spec = st.field.spectrum;
  if (!spec) bad('у материала поля нет uSpectrum — красить нечем');
  else if (!m.pal.glyph.every((want, i) => hexOk(spec[i], want))) {
    bad('спектр поля на ' + m.name + ' — ' + spec.join(' ') + ', а палитра просит ' +
      m.pal.glyph.join(' ') + '. Четыре цвета ставятся поверх готового материала: ' +
      'material.uniforms.uSpectrum.value = [четыре THREE.Color].');
  }
  const fd = st.field.fogDensity;
  if (typeof fd !== 'number') bad('у материала поля нет числового uFogDensity на ' + m.name);
  else if (fd < FOG_MIN || fd > FOG_MAX) {
    bad('плотность тумана поля на ' + m.name + ' — ' + fd + ', полоса сцены ' + FOG_MIN +
      ' … ' + FOG_MAX);
  }
}

// 2. Туман слушает настроение: у палитр разрыв 10x между void и claustrophobic.
const fogs = measured.map(m => (m.state.field ? m.state.field.fogDensity : null))
  .filter(v => typeof v === 'number');
if (fogs.length === measured.length) {
  const spread = Math.min(...fogs) > 0 ? Math.max(...fogs) / Math.min(...fogs) : 0;
  const order = [...measured].sort((a, b) => a.pal.fogDensity - b.pal.fogDensity);
  let monotone = true;
  for (let i = 1; i < order.length; i++) {
    if (order[i].state.field.fogDensity < order[i - 1].state.field.fogDensity - 1e-9) monotone = false;
  }
  console.log('');
  console.log('туман поля: разрыв густого к редкому ' + spread.toFixed(2) + ' (нужно не меньше ' +
    FOG_SPREAD_MIN + '), порядок настроений сохранён: ' + monotone);
  if (!(spread >= FOG_SPREAD_MIN)) {
    bad('плотность тумана почти не зависит от настроения: разрыв ' + spread.toFixed(2) +
      ' при пороге ' + FOG_SPREAD_MIN + '. В палитрах между void и claustrophobic 10x.');
  }
  if (!monotone) {
    bad('порядок настроений по туману в сцене не совпадает с порядком в палитрах: густое ' +
      'настроение вышло реже редкого. Плотность обязана расти вместе с fogDensity палитры.');
  }
}

// 3. Геометрия: поле structure у всех шести одно, значит и структура мира одна.
const structures = new Set(measured.map(m => m.state.structure));
const counts = measured.map(m => (m.state.field ? m.state.field.count : 0));
const spreadCount = Math.max(...counts) / Math.max(1, Math.min(...counts)) - 1;
console.log('номеров структуры среди шести настроений: ' + [...structures].join(', ') +
  ', разброс числа точек ' + (spreadCount * 100).toFixed(1) + '% (допуск ' + (COUNT_TOL * 100) + '%)');
if (structures.size !== 1) {
  bad('настроение меняет номер структуры мира: ' + [...structures].join(', ') +
    '. Поле structure в этих сидах одно и то же, значит структуру выбирают не по нему.');
}
if (spreadCount > COUNT_TOL) {
  bad('число точек скачет на ' + (spreadCount * 100).toFixed(1) + '% между настроениями при ' +
    'одинаковом поле density — настроение влияет на плотность поля, а не только на цвет.');
}

// 4. Настроения различимы на кадре. Признак 8 из REFERENCE.md.
const by = {};
for (const m of measured) by[m.name] = m;
const litRatio = (m) => {
  const count = m.state.field ? m.state.field.count : 0;
  return count > 0 ? m.frame.lit / count : 0;
};
console.log('  светящихся пикселей на точку поля: ' +
  measured.map(m => m.name + ' ' + litRatio(m).toFixed(2)).join(', ') +
  ' (нужно не меньше ' + MIN_LIT_RATIO + ' и ' + MIN_LIT_FLOOR + ' пикселей)');
const lowLit = measured.filter(m => litRatio(m) < MIN_LIT_RATIO || m.frame.lit < MIN_LIT_FLOOR);
if (lowLit.length) {
  bad('на стенде почти нет светящихся пикселей: ' +
    lowLit.map(m => m.name + ' ' + m.frame.lit + ' на ' + (m.state.field ? m.state.field.count : 0) +
      ' точек').join(', ') + ' при пороге ' + MIN_LIT_RATIO + ' пикселя на точку. Цвет мерить ' +
    'нечем — либо поле не рисуется, либо стенд смотрит в пустоту (попробуй другую ' +
    'структуру: --structure).');
}

const claim = (name, ok, what, got) => {
  const m = by[name];
  if (!m) return;
  console.log('  ' + name.padEnd(14) + ' ' + what + ': ' + got + ' — ' + (ok ? 'да' : 'НЕТ'));
  if (!ok) {
    bad('настроение ' + name + ' не читается на кадре: ' + what + ', замер ' + got +
      '. Признак 8 в REFERENCE.md просит именно этого.');
  }
};
console.log('');
console.log('признак 8: настроения различимы');
if (measured.every(m => m.frame.litU > 0)) {
  const s = (n) => (by[n] ? by[n].shareU : [0, 0, 0]);
  const [sr, , sb] = s('serene');
  claim('serene', sb - sr >= HUE_MARGIN, 'голубой: синего больше красного на ' + HUE_MARGIN,
    (sb - sr).toFixed(3));
  const [er, , eb] = s('eerie');
  claim('eerie', er - eb >= HUE_MARGIN, 'красно-багровый: красного больше синего на ' + HUE_MARGIN,
    (er - eb).toFixed(3));
  const [vr, vg, vb] = s('void');
  claim('void', Math.max(vr, vg, vb) - Math.min(vr, vg, vb) <= VOID_MAX_SPREAD,
    'монохромный: разброс каналов не больше ' + VOID_MAX_SPREAD,
    (Math.max(vr, vg, vb) - Math.min(vr, vg, vb)).toFixed(3));
  const [jr, jg, jb] = s('joyful');
  claim('joyful', (jr + jg) / 2 - jb >= HUE_MARGIN, 'тёплый: тепло больше синего на ' + HUE_MARGIN,
    ((jr + jg) / 2 - jb).toFixed(3));

  // Попарно: шесть настроений — шесть разных кадров. Ось цвета тут не одна: серые
  // палитры (void, claustrophobic) отличаются светимостью, а не оттенком, поэтому в
  // вектор входит и яркость.
  const vec = (m) => [m.shareU[0], m.shareU[1], m.shareU[2], m.mean / 255];
  let worst = Infinity, worstPair = '';
  for (let i = 0; i < measured.length; i++) {
    for (let j = i + 1; j < measured.length; j++) {
      const a = vec(measured[i]), b = vec(measured[j]);
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]);
      if (d < worst) { worst = d; worstPair = measured[i].name + ' и ' + measured[j].name; }
    }
  }
  console.log('  худшая пара по цвету и яркости кадра: ' + worstPair + ', расстояние ' +
    worst.toFixed(3) + ' (нужно не меньше ' + PAIR_MIN + ')');
  if (!(worst >= PAIR_MIN)) {
    bad('два настроения дают один и тот же кадр: ' + worstPair + ', расстояние ' + worst.toFixed(3) +
      ' при пороге ' + PAIR_MIN + ' по цвету и яркости. На экране их не различить.');
  }
}

const noPalette = measured.filter(m => !m.state.hasPalette).map(m => m.name);
if (noPalette.length) {
  console.log('');
  console.log('замечание: group.userData.palette нет на настроениях ' + noPalette.join(', ') +
    ' — не провал, но N26 просила донести палитру именно так');
}

bye(problems.length === 0, problems);
