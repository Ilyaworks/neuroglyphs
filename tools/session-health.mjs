// Пора ли в новую сессию.
//
//   node tools/session-health.mjs
//
// Зачем: длинная сессия сжимает свой контекст, и каждое сжатие теряет подробности.
// Через несколько итераций модель начинает уверенно рассказывать о том, чего не было —
// а в этом проекте отчёты и так приходится сверять с диском. Дешевле начать новую
// сессию, чем ловить последствия.
//
// Число сжатий прослойка не записывает (time_compacting в базе пустой у всех сессий),
// поэтому мерим то, что записано: сколько сообщений и сколько входных токенов набрала
// самая свежая сессия. Оба растут только вверх и служат заменой счётчику сжатий.
//
// ВАЖНО про пороги: они СОВЕТЧИКИ, а не замер. Взяты по наблюдённым размерам сессий
// этого проекта (R24 закрылась на 161k, R25 на 325k, R26 перевалила 571k), а не из
// измеренной точки, где падает качество. Такую точку никто не мерил, и выдавать их за
// измеренные нельзя.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DB = path.join(process.env.USERPROFILE || process.env.HOME || '',
  '.local', 'share', 'opencode', 'opencode.db');

const WARN_MSGS = 150, STOP_MSGS = 250;
const WARN_TOK = 300000, STOP_TOK = 450000;

const START = '.planning/START.md';

// Промт для следующей сессии читаем ИЗ ФАЙЛА и печатаем дословно. Модель не должна
// пересказывать его по памяти: пересказ теряет правила, а вместе с ними — заслонку
// приёмки глазами и запрет на git reset. Берём всё после строки-разделителя «---».
function prompt() {
  if (!fs.existsSync(START)) {
    return 'промт лежит в ' + START + ', но файла нет — скажи об этом человеку';
  }
  const text = fs.readFileSync(START, 'utf8');
  const i = text.indexOf('\n---\n');
  return (i < 0 ? text : text.slice(i + 5)).trim();
}

if (!fs.existsSync(DB)) {
  console.log('базы сессий нет по пути ' + DB + ' — размер сессии не проверить.');
  console.log('Ориентируйся на счёт закрытых задач: после трёх просить новую сессию.');
  process.exit(0);
}

// Читаем через python: sqlite3 в узле без сборки нет, а python на этой машине есть.
// Только чтение, immutable — база в этот момент открыта работающей прослойкой.
const PY = [
  'import sqlite3, json',
  'c = sqlite3.connect("file:' + DB.split('\\').join('/') + '?mode=ro&immutable=1", uri=True)',
  'r = list(c.execute("select id,title,tokens_input,tokens_output from session order by time_updated desc limit 1"))',
  'if not r: print("{}")',
  'else:',
  '    sid, title, ti, to = r[0]',
  '    n = list(c.execute("select count(*) from message where session_id=?", (sid,)))[0][0]',
  '    print(json.dumps({"title": title or "", "tin": ti or 0, "tout": to or 0, "msgs": n}))',
].join('\n');

let info;
try {
  info = JSON.parse(execFileSync('python', ['-c', PY], { encoding: 'utf8' }).trim() || '{}');
} catch (e) {
  console.log('базу сессий прочитать не удалось: ' + String(e.message).split('\n')[0]);
  console.log('Ориентируйся на счёт закрытых задач: после трёх просить новую сессию.');
  process.exit(0);
}

if (!info.title) {
  console.log('свежих сессий в базе нет.');
  process.exit(0);
}

const tin = info.tin, msgs = info.msgs;
console.log('сессия: ' + info.title);
console.log('сообщений: ' + msgs + ' (совет: до ' + WARN_MSGS + ')');
console.log('входных токенов: ' + tin + ' (совет: до ' + WARN_TOK + ')');
console.log('');

if (msgs >= STOP_MSGS || tin >= STOP_TOK) {
  console.log('ПОРА В НОВУЮ СЕССИЮ.');
  console.log('');
  console.log('Задачу не бросай недоделанной: доведи текущую до закрытия или до вопроса');
  console.log('человеку, и только потом останавливайся. Остановившись, напечатай человеку');
  console.log('ВСЁ, что ниже разделителя, дословно как есть — это готовый промт, ему');
  console.log('останется только скопировать. По памяти его не пересказывай: пересказанный');
  console.log('промт теряет правила, и следующая сессия поедет без них.');
  console.log('');
  console.log('#'.repeat(78));
  console.log('СЕССИЯ ВЫРОСЛА: ' + msgs + ' сообщений, ' + tin + ' входных токенов.');
  console.log('Дальше в ней работать не стоит — контекст сжимается, подробности теряются.');
  console.log('Начните новую сессию и вставьте в неё промт целиком:');
  console.log('#'.repeat(78));
  console.log('');
  console.log(prompt());
  console.log('');
  console.log('#'.repeat(78));
  process.exit(2);
}

if (msgs >= WARN_MSGS || tin >= WARN_TOK) {
  console.log('ещё можно работать, но запас кончается — новую задачу лучше не брать.');
  console.log('Доведи текущую и попроси новую сессию.');
  process.exit(0);
}

console.log('можно продолжать: бери следующую задачу.');
process.exit(0);
