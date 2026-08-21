// Проверка задачи N01: поднимает server.mjs, стучится на index.html, гасит сервер.
// Запуск: node tools/check-server.mjs
// Печатает SERVER_OK при коде 200, иначе причину и код выхода 1.
import { spawn } from 'node:child_process';
import http from 'node:http';

const srv = spawn(process.execPath, ['server.mjs'], { stdio: 'ignore' });
let done = false;

function finish(ok, why) {
  if (done) return;
  done = true;
  srv.kill();
  if (ok) console.log('SERVER_OK');
  else console.error('ПРОВАЛ: ' + why);
  process.exit(ok ? 0 : 1);
}

srv.on('error', e => finish(false, 'сервер не запустился: ' + e.message));
setTimeout(() => {
  http.get('http://127.0.0.1:5173/index.html', r => {
    finish(r.statusCode === 200, 'код ответа ' + r.statusCode + ', ожидался 200');
  }).on('error', e => finish(false, 'запрос не прошёл: ' + e.code));
}, 900);
setTimeout(() => finish(false, 'сервер не ответил за 6 секунд'), 6000);
