// Прогоняет связку постобработки по-настоящему: собирает композер над известной
// картинкой и смотрит, что делают setFisheye и setChroma.
//
//   node tools/post-check.mjs
//   node tools/post-check.mjs --mod tools/fixture-post.js
//
// Зачем: проверка N24 — `node --check` плюс приёмка глазами. Между ними проходит
// ошибка, которую не видно ни там, ни там: setFisheye, который пишет в общий шаблон
// FisheyeShader.uniforms вместо uniform-ов своего прохода. ShaderPass клонирует
// uniform-ы при создании, поэтому правка шаблона не доходит до кадра: эффекта нет,
// синтаксис безупречен, а глазами это выглядит как «дисторсия слабовата».
//
// Картинка для замера — приглушённая шахматка: резкие края по всему кадру дают
// однозначную разницу и от загиба, и от расхождения каналов. Яркость намеренно не
// белая, а свечение на время замера глушится через setBloom(0, 0, 1): при полной силе
// bloom выжигает кадр в 255, и на насыщенном белом никакой сдвиг выборки не виден.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NL = String.fromCharCode(10);
const CDP_PORT = 9389;
const PORT = 5173;

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const rawMod = arg('mod', 'src/render/post.js').split('\\').join('/');
const LOCAL = (rawMod.match(/(?:tools|src)\/.*/) || [rawMod.replace(/^\//, '')])[0];
const MOD = '/' + LOCAL;

// Пороги. Замер на эталоне печатается в выводе.
const MAX_OFF_DIFF = 2;        // с выключенными эффектами кадр не должен отличаться от базового
const MIN_FISHEYE_EDGE = 12;   // setFisheye(0.35) обязан заметно двинуть края кадра
// setChroma(0.004) — то самое значение из приёмки задачи, и эффект от него мал: на
// эталоне средний модуль R-B поднимается с ровного нуля до 1.19. Порог 0.5 — половина
// замера, а не его край; ниже него только точный ноль, то есть «канал не тронут».
const MIN_CHROMA_SPLIT = 0.5;
const MIN_EDGE_OVER_CENTER = 2; // бочка гнёт края, а не середину
const MAX_TEMPLATE_DRIFT = 0;  // общий шаблон шейдера трогать нельзя вовсе

if (!fs.existsSync(LOCAL)) { console.error(LOCAL + ' не найден'); process.exit(1); }

const problems = [];
const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('ПРОВАЛ: chrome.exe не найден'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-post-'));
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
  if (ok) console.log('POST_OK');
  else {
    console.error('');
    for (const l of lines) console.error('  x ' + l);
    console.error('');
    console.error('POST_FAIL');
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
  '  const mod = await import(' + JSON.stringify(MOD) + ');',
  '  const shaders = await import("/src/render/shaders.js");',
  '  if (typeof mod.buildComposer !== "function") return JSON.stringify({ ошибка: "нет экспорта buildComposer" });',
  '  let итог0 = [];',
  '  const N = 128;',
  '  // Шахматка: резкие края по всему кадру, поэтому загиб и расхождение каналов видны.',
  '  const cv = document.createElement("canvas");',
  '  cv.width = N; cv.height = N;',
  '  const g = cv.getContext("2d");',
  '  const шаг = N / 8;',
  '  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {',
  '    g.fillStyle = ((x + y) % 2) ? "#909090" : "#101010";',
  '    g.fillRect(x * шаг, y * шаг, шаг, шаг);',
  '  }',
  '  const tex = new THREE.CanvasTexture(cv);',
  '  const renderer = new THREE.WebGLRenderer({ antialias: false });',
  '  renderer.setSize(N, N, false);',
  '  const scene = new THREE.Scene();',
  '  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);',
  '  camera.position.z = 1;',
  '  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2),',
  '    new THREE.MeshBasicMaterial({ map: tex })));',
  '  const post = mod.buildComposer(renderer, scene, camera);',
  '  const методы = ["setBloom", "setFisheye", "setChroma", "resize", "dispose"]',
  '    .filter(k => typeof post[k] === "function");',
  '  const проходы = post.composer ? post.composer.passes.map(p => p.constructor.name) : [];',
  '  // Выключены по умолчанию — это про uniform-ы проходов, а не про наличие методов.',
  '  const шейдерные = post.composer ? post.composer.passes.filter(p => p.uniforms) : [];',
  '  итог0 = шейдерные.map(p => {',
  '    const u = p.uniforms;',
  '    if (u.strength) return ["strength", u.strength.value];',
  '    if (u.amount) return ["amount", u.amount.value];',
  '    return ["?", null];',
  '  });',
  '  const кадр = () => {',
  '    post.composer.render();',
  '    const px = new Uint8Array(N * N * 4);',
  '    const gl = renderer.getContext();',
  '    gl.readPixels(0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, px);',
  '    return px;',
  '  };',
  '  const разница = (a, b) => {',
  '    let макс = 0, сумма = 0;',
  '    for (let i = 0; i < a.length; i += 4) {',
  '      const d = Math.abs(a[i] - b[i]);',
  '      if (d > макс) макс = d;',
  '      сумма += d;',
  '    }',
  '    return { макс, средняя: +(сумма / (a.length / 4)).toFixed(2) };',
  '  };',
  '  // Бочка сильнее всего двигает края, а центр почти не трогает. Поэтому меряем не',
  '  // яркость столбца (на симметричной шахматке она не меняется вовсе — первый заход',
  '  // гейта на этом и споткнулся), а где именно кадр разошёлся с базовым.',
  '  const поКольцу = (a, b) => {',
  '    let кольцо = 0, кольцоN = 0, центр = 0, центрN = 0;',
  '    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {',
  '      const i = (y * N + x) * 4;',
  '      const d = Math.abs(a[i+1] - b[i+1]);',
  '      const скраю = Math.min(x, y, N - 1 - x, N - 1 - y) < N * 0.2;',
  '      if (скраю) { кольцо += d; кольцоN++; } else { центр += d; центрN++; }',
  '    }',
  '    return { кольцо: +(кольцо / кольцоN).toFixed(2), центр: +(центр / центрN).toFixed(2) };',
  '  };',
  '  // Расхождение каналов на шахматке меняет знак от края к краю, поэтому среднее',
  '  // со знаком равно нулю. Меряем средний модуль: у серой картинки он около нуля.',
  '  const модульRB = (px) => {',
  '    let сумма = 0;',
  '    for (let i = 0; i < px.length; i += 4) сумма += Math.abs(px[i] - px[i+2]);',
  '    return +(сумма / (px.length / 4)).toFixed(2);',
  '  };',
  '  // Свечение на время замера глушим: при силе 0.9 оно выжигает кадр в 255, и сдвиг',
  '  // выборки на насыщенном белом не виден вовсе. Первый заход гейта на этом и споткнулся.',
  '  if (typeof post.setBloom === "function") post.setBloom(0, 0, 1);',
  '  const базовый = кадр();',
  '  const итог = { методы, проходы, поУмолчанию: итог0, базовыйМодульRB: модульRB(базовый) };',
  '  итог.выключеныПоУмолчанию = разница(базовый, кадр());',
  '  if (typeof post.setFisheye === "function") {',
  '    post.setFisheye(0.35);',
  '    const f = кадр();',
  '    итог.fisheye = разница(базовый, f);',
  '    итог.fisheyeКольцо = поКольцу(базовый, f);',
  '    итог.шаблонFisheye = shaders.FisheyeShader.uniforms.strength.value;',
  '    post.setFisheye(0);',
  '    итог.fisheyeВернулся = разница(базовый, кадр());',
  '  }',
  '  if (typeof post.setChroma === "function") {',
  '    post.setChroma(0.004);',
  '    const c = кадр();',
  '    итог.chroma = разница(базовый, c);',
  '    итог.chromaМодульRB = модульRB(c);',
  '    итог.шаблонChroma = shaders.ChromaShader.uniforms.amount.value;',
  '    post.setChroma(0);',
  '    итог.chromaВернулся = разница(базовый, кадр());',
  '  }',
  '  post.dispose();',
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

console.log('модуль: ' + MOD);
console.log('методы: ' + d.методы.join(', '));
console.log('проходы композера: ' + d.проходы.join(' → '));
console.log('значения по умолчанию: ' + d.поУмолчанию.map(p => p[0] + ' = ' + p[1]).join(', '));
console.log('с выключенными эффектами кадр не меняется: максимум ' +
  d.выключеныПоУмолчанию.макс + ' (порог ' + MAX_OFF_DIFF + ')');
if (d.fisheye) {
  console.log('setFisheye(0.35): разница с базовым максимум ' + d.fisheye.макс + ', средняя ' +
    d.fisheye.средняя + '; по кольцу у краёв ' + d.fisheyeКольцо.кольцо + ', в центре ' +
    d.fisheyeКольцо.центр + ' (край нужен не меньше ' + MIN_FISHEYE_EDGE +
    ' и больше центра в ' + MIN_EDGE_OVER_CENTER + ' раза)');
  console.log('  общий шаблон FisheyeShader.uniforms.strength: ' + d.шаблонFisheye +
    ' (обязан остаться 0), возврат к нулю: максимум ' + d.fisheyeВернулся.макс);
}
if (d.chroma) {
  console.log('setChroma(0.004): разница с базовым максимум ' + d.chroma.макс + ', средняя ' +
    d.chroma.средняя + '; средний модуль R-B ' + d.базовыйМодульRB + ' → ' + d.chromaМодульRB +
    ' (нужно не меньше ' + MIN_CHROMA_SPLIT + ')');
  console.log('  общий шаблон ChromaShader.uniforms.amount: ' + d.шаблонChroma +
    ' (обязан остаться 0), возврат к нулю: максимум ' + d.chromaВернулся.макс);
}

for (const k of ['setBloom', 'setFisheye', 'setChroma', 'resize', 'dispose']) {
  if (!d.методы.includes(k)) problems.push('buildComposer не отдаёт метод ' + k);
}
const порядок = d.проходы;
const iBloom = порядок.indexOf('UnrealBloomPass');
const iShader = порядок.indexOf('ShaderPass');
if (iBloom < 0) problems.push('в композере нет UnrealBloomPass — bloom из N22 потерян');
if (порядок.filter(p => p === 'ShaderPass').length < 2) {
  problems.push('в композере меньше двух ShaderPass: ' + порядок.join(' → ') +
    '. Задача просит два прохода — fisheye и хроматику.');
} else if (iBloom >= 0 && iShader >= 0 && iShader < iBloom) {
  problems.push('дисторсии стоят до bloom: ' + порядок.join(' → ') +
    '. Задача просит после: сначала свечение, потом искажение кадра.');
}
for (const [имя, значение] of d.поУмолчанию) {
  if (значение !== 0) {
    problems.push('дисторсия включена по умолчанию: ' + имя + ' = ' + значение +
      '. Задача просит оба прохода выключенными, а ноль в этих шейдерах — тождественность.');
  }
}
if (!(d.выключеныПоУмолчанию.макс <= MAX_OFF_DIFF)) {
  problems.push('кадр не повторяется от вызова к вызову: максимум расхождения ' +
    d.выключеныПоУмолчанию.макс + '. Замер после этого ничего не значит.');
}
if (d.fisheye) {
  if (!(d.fisheyeКольцо.кольцо >= MIN_FISHEYE_EDGE)) {
    problems.push('setFisheye(0.35) почти не двигает края: расхождение по кольцу ' +
      d.fisheyeКольцо.кольцо + ' при пороге ' + MIN_FISHEYE_EDGE +
      '. Частая причина: setFisheye пишет в общий шаблон FisheyeShader.uniforms, а ShaderPass ' +
      'клонирует uniform-ы при создании — писать надо в pass.uniforms.');
  }
  if (d.fisheyeКольцо.кольцо < d.fisheyeКольцо.центр * MIN_EDGE_OVER_CENTER) {
    problems.push('искажение размазано по всему кадру: по кольцу у краёв ' + d.fisheyeКольцо.кольцо +
      ', в центре ' + d.fisheyeКольцо.центр + '. Бочка обязана гнуть края сильнее середины.');
  }
  if (Math.abs(d.шаблонFisheye) > MAX_TEMPLATE_DRIFT) {
    problems.push('setFisheye поменял общий шаблон FisheyeShader.uniforms.strength на ' +
      d.шаблонFisheye + '. Шаблон общий на всё приложение: следующий ShaderPass родится ' +
      'уже искажённым. Писать надо в uniform-ы своего прохода.');
  }
  if (!(d.fisheyeВернулся.макс <= MAX_OFF_DIFF)) {
    problems.push('setFisheye(0) не возвращает кадр к базовому: расхождение ' +
      d.fisheyeВернулся.макс + ' при пороге ' + MAX_OFF_DIFF);
  }
}
if (d.chroma) {
  if (!(d.chromaМодульRB - d.базовыйМодульRB >= MIN_CHROMA_SPLIT)) {
    problems.push('setChroma(0.004) не разводит каналы: средний модуль R-B ' + d.базовыйМодульRB +
      ' → ' + d.chromaМодульRB + ' при пороге ' + MIN_CHROMA_SPLIT +
      '. Та же частая причина: правка уходит в общий шаблон, а не в uniform-ы прохода.');
  }
  if (Math.abs(d.шаблонChroma) > MAX_TEMPLATE_DRIFT) {
    problems.push('setChroma поменял общий шаблон ChromaShader.uniforms.amount на ' + d.шаблонChroma);
  }
  if (!(d.chromaВернулся.макс <= MAX_OFF_DIFF)) {
    problems.push('setChroma(0) не возвращает кадр к базовому: расхождение ' +
      d.chromaВернулся.макс + ' при пороге ' + MAX_OFF_DIFF);
  }
}

bye(problems.length === 0, problems);
