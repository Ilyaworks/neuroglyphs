// Проверка задачи N01: поднимает server.mjs, стучится на index.html, гасит сервер.
// Запуск: node tools/check-server.mjs
// Печатает SERVER_OK при коде 200, иначе причину и код выхода 1.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';

const PORT = 5173;

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
  http.get('http://127.0.0.1:' + PORT + '/index.html', r => {
    if (r.statusCode !== 200) {
      finish(false, 'код ответа ' + r.statusCode + ', ожидался 200');
      return;
    }
    // Код 200 сам по себе ничего не значит: порт мог держать забытый server.mjs из
    // другого каталога, и тогда проверка хвалит чужой проект. Сверяем содержимое.
    let body = '';
    r.setEncoding('utf8');
    r.on('data', c => { body += c; });
    r.on('end', () => {
      const norm = t => t.split(String.fromCharCode(13)).join('');
      const want = norm(fs.readFileSync('index.html', 'utf8'));
      if (norm(body) !== want) {
        finish(false, 'на порту ' + PORT + ' отвечает не этот проект: index.html не совпадает ' +
          'с файлом на диске. Сними процесс, который держит порт: ' +
          'netstat -ano | findstr :' + PORT);
        return;
      }
      finish(true);
    });
  }).on('error', e => finish(false, 'запрос не прошёл: ' + e.code));
}, 900);
setTimeout(() => finish(false, 'сервер не ответил за 6 секунд'), 6000);
