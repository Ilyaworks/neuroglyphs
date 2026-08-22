// Автоматическая проверка страницы в настоящем Chrome без зависимостей.
// Поднимает server.mjs, открывает страницу в headless Chrome по протоколу CDP,
// собирает ошибки консоли, исключения и неудавшиеся запросы, снимает скриншот.
//
//   node tools/browser-check.mjs
//   node tools/browser-check.mjs --url "/?seed=TEST-TEST-TEST" --wait 6 --name n11
//
// Печатает PAGE_OK, если ошибок нет. Иначе печатает их и выходит с кодом 1.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { frameStats } from './frame-stats.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : def;
};

const PORT = 5173;
const CDP_PORT = 9333;
const urlPathArg = arg('url', '/');
const expectContent = process.argv.includes('--expect-content');
// Сид для замера непустого кадра. Без него страница берёт случайный сид от Date.now(),
// и проверка превращалась в лотерею: плотность поля — поле сида, при её нуле мир честно
// даёт 1500 точек на объём радиуса 400. Замер по восьми структурам при средней плотности:
// 6.86, 3.71, 4.60, 13.95, 1.85, 7.62, 3.39, 4.15 процента светящихся пикселей — все
// проходят. А сид 0000-71k2-dijo (плотность 0, структура 4) даёт 0.37% и валится всегда,
// хотя мир отрисован. Модель это списывала на «CDN не успел», хотя терпения тут 25 секунд.
// Берём середину: 0000-71k2-dlpc — 6.86%, порог 0.5%, запас больше десятикратного.
const CONTENT_SEED = '0000-71k2-dlpc';
const urlPath = (expectContent && !/[?&]seed=/.test(urlPathArg))
  ? urlPathArg + (urlPathArg.includes('?') ? '&' : '?') + 'seed=' + CONTENT_SEED
  : urlPathArg;
const expectMotion = process.argv.includes('--expect-motion');
const waitSec = Number(arg('wait', 4));
const shotName = arg('name', 'page');

const CHROME = [
  (process.env.ProgramFiles || 'C:/Program Files') + '/Google/Chrome/Application/chrome.exe',
  (process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)') + '/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
  (process.env.ProgramFiles || 'C:/Program Files') + '/Microsoft/Edge/Application/msedge.exe',
].find(p => p && fs.existsSync(p));

if (!CHROME) {
  console.error('ПРОВАЛ: chrome.exe не найден, проверить страницу автоматически нельзя');
  process.exit(1);
}
if (!fs.existsSync('server.mjs')) {
  console.error('ПРОВАЛ: нет server.mjs, сначала задача N01');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=' + CDP_PORT,
  '--user-data-dir=' + profile,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--window-size=1600,900',
  'about:blank',
], { stdio: 'ignore' });

let code = 1;
function bye(ok, lines) {
  try { chrome.kill(); } catch {}
  try { srv.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  if (ok) console.log('PAGE_OK');
  else { console.error('ПРОВАЛ: страница с ошибками'); for (const l of lines) console.error('  ' + l); }
  process.exit(ok ? 0 : 1);
}

try {
  let ws = null;
  for (let i = 0; i < 40 && !ws; i++) {
    await sleep(250);
    try {
      const r = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/version');
      ws = (await r.json()).webSocketDebuggerUrl;
    } catch {}
  }
  if (!ws) bye(false, ['Chrome не отдал адрес отладчика за 10 секунд']);

  const sock = new WebSocket(ws);
  const problems = [];
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
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      problems.push('console.error: ' + m.params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      problems.push('исключение: ' + (d.exception?.description || d.text));
    }
    if (m.method === 'Network.loadingFailed' && !/net::ERR_ABORTED/.test(m.params.errorText || '')) {
      problems.push('запрос не загрузился: ' + m.params.errorText + ' (' + m.params.type + ')');
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      const e = m.params.entry;
      if (!/favicon\.ico/.test(e.url || '')) {
        problems.push('ошибка страницы: ' + e.text + (e.url ? ' -> ' + e.url : ''));
      }
    }
  };

  const targets = await send('Target.getTargets', {}, null);
  const page = targets.targetInfos.find(t => t.type === 'page');
  const att = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, null);
  sessionId = att.sessionId;

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Page.enable');
  const SERVED_FILE = 'index.html';
  // Порт мог остаться занят чужим сервером — например, забытым server.mjs из другого
  // чекаута: тогда проверка молча читает чужие файлы и всё выглядит зелёным. Один раз
  // это уже дало ложный пропуск. Сверяем, что на порту отвечает именно этот каталог.
  async function assertOurServer(file) {
    const norm = t => t.split(String.fromCharCode(13)).join('');
    const want = norm(fs.readFileSync(file, 'utf8'));
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch('http://127.0.0.1:' + PORT + '/' + file);
        const got = norm(await r.text());
        if (got === want) return;
        bye(false, ['на порту ' + PORT + ' отвечает не этот проект: ' + file + ' не совпадает ' +
          'с файлом на диске. Обычно это забытый server.mjs из другого каталога — сними ' +
          'процесс, который держит порт, и запусти проверку снова. Кто держит порт: ' +
        'netstat -ano | findstr :' + PORT]);
      } catch {}
      await sleep(250);
    }
    bye(false, ['сервер на порту ' + PORT + ' не ответил за 10 секунд']);
  }
  await assertOurServer(SERVED_FILE);
  
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + urlPath });
  await sleep(waitSec * 1000);

  // Кадр может быть ещё пустым не потому, что мир не отрисовался, а потому, что three
  // качается с CDN. Порог непустого кадра тот же, что ниже (0.005 и 40) — меняется
  // только терпение, иначе проверка флакует и учит модель просто запускать её повторно.
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  if (expectContent) {
    const deadline = Date.now() + 25000;
    let tries = 1;
    while (Date.now() < deadline) {
      let s = null;
      try { s = frameStats(Buffer.from(shot.data, 'base64')); } catch {}
      if (s && s.litShare >= 0.005 && s.maxLum >= 40) break;
      await sleep(500);
      shot = await send('Page.captureScreenshot', { format: 'png' });
      tries++;
    }
    console.log('кадров снято до непустого: ' + tries);
  }
  fs.mkdirSync('.planning/shots', { recursive: true });
  const file = '.planning/shots/' + shotName + '.png';
  const png = Buffer.from(shot.data, 'base64');
  fs.writeFileSync(file, png);
  console.log('скриншот: ' + file);

  let stats = null;
  try {
    stats = frameStats(png);
    console.log('кадр: светится ' + (stats.litShare * 100).toFixed(2) + '% пикселей, ' +
      'средняя яркость ' + stats.meanLum.toFixed(1) + ', максимум ' + stats.maxLum +
      ', оттенков ' + stats.colors);
  } catch (e) {
    console.log('кадр разобрать не удалось: ' + e.message);
  }

  const fps = await send('Runtime.evaluate', {
    expression: 'new Promise(r => { let n = 0; const t0 = performance.now();' +
      ' const step = () => { n++; if (performance.now() - t0 < 1200) requestAnimationFrame(step);' +
      ' else r(Math.round(n / ((performance.now() - t0) / 1000))); }; requestAnimationFrame(step); })',
    awaitPromise: true,
    returnByValue: true,
  });
  if (typeof fps.result?.value === 'number') console.log('кадров в секунду: ' + fps.result.value);

  if (expectContent && stats) {
    if (stats.litShare < 0.005 || stats.maxLum < 40) {
      // Диагноз раньше был один — «мир не отрисовался», — и он врал на разреженном
      // мире: яркость 255 и восемь десятков оттенков, то есть отрисовался, но пусто.
      problems.push('кадр практически пустой: светится ' + (stats.litShare * 100).toFixed(2) +
        '% пикселей при максимальной яркости ' + stats.maxLum + ' и ' + stats.colors +
        ' оттенках. ' + (stats.maxLum < 40
          ? 'Яркого нет вовсе — мир не отрисовался.'
          : 'Яркие точки есть, значит рисование работает, а мир просто разрежен: ' +
            'смотри плотность поля у сида ' + urlPath + '.'));
    }
  }

  if (expectMotion) {
    await sleep(1400);
    const second = await send('Page.captureScreenshot', { format: 'png' });
    if (second.data === shot.data) {
      problems.push('два кадра с разницей 1.4 секунды побайтово одинаковы: сцена статична');
    } else {
      try {
        const s2 = frameStats(Buffer.from(second.data, 'base64'));
        const drift = Math.abs(s2.meanLum - stats.meanLum) + Math.abs(s2.litShare - stats.litShare) * 100;
        console.log('движение между кадрами: ' + drift.toFixed(3));
      } catch {}
    }
  }

  const banner = await send('Runtime.evaluate', {
    expression: 'document.body ? (document.body.innerText || "").slice(0, 300) : "нет body"',
    returnByValue: true,
  });
  const text = banner.result?.value || '';
  if (/ERROR|Ошибка|Uncaught/i.test(text)) problems.push('на странице текст ошибки: ' + text.slice(0, 160));

  bye(problems.length === 0, problems);
} catch (e) {
  bye(false, ['проверка сорвалась: ' + e.message]);
}
