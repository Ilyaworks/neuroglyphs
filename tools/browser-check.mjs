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

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : def;
};

const PORT = 5173;
const CDP_PORT = 9333;
const urlPath = arg('url', '/');
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
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + urlPath });
  await sleep(waitSec * 1000);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync('.planning/shots', { recursive: true });
  const file = '.planning/shots/' + shotName + '.png';
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log('скриншот: ' + file);

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
