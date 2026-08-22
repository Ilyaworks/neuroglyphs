// Закрывает задачу: ставит done в .planning/BACKLOG.md, коммитит работу и печатает
// промт следующей задачи.
//
//   node tools/finish-task.mjs N01
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const id = (process.argv[2] || '').toUpperCase();
if (!/^[NR]\d+$/.test(id)) {
  console.error('нужен номер задачи или правки, например: node tools/finish-task.mjs N01');
  process.exit(1);
}

function run(cmd) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') || e.message };
  }
}

function refuse(what, out) {
  console.error('');
  console.error('#'.repeat(78));
  console.error('ЗАДАЧА НЕ ЗАКРЫТА: ' + what);
  console.error('#'.repeat(78));
  const NL = String.fromCharCode(10);
  console.error(out.trim().split(NL).slice(-25).join(NL));
  console.error('');
  console.error('Задача осталась todo, коммита нет. Исправь причину и запусти finish-task снова.');
  console.error('Если не получается — напечатай: ПРОВАЛ ' + id + ', покажи этот вывод Клоду.');
  process.exit(1);
}

const pkg = fs.existsSync('package.json') ? JSON.parse(fs.readFileSync('package.json', 'utf8')) : {};
if (pkg.scripts && pkg.scripts.test) {
  const r = run('npm test');
  if (!r.ok) refuse('падают тесты (npm test)', r.out);
  console.log('тесты прошли');
}

if (fs.existsSync('atlas.html') && fs.existsSync('src/core/atlas.js')) {
  const r = run('node tools/atlas-check.mjs');
  if (!r.ok) refuse('атлас собран неверно', r.out);
  console.log('атлас в порядке');
}

// node --check у геометрии поля проверяет только синтаксис, а browser-check её не видит:
// до N11 модуль ниоткуда не импортируется. Поэтому отдельный прогон с заглушкой three.
if (fs.existsSync('src/world/fieldGeometry.js')) {
  const r = run('node tools/geometry-check.mjs');
  if (!r.ok) refuse('геометрия глифового поля не работает', r.out);
  console.log('геометрия поля в порядке');
}

// У N10 проверка была `node --check`: шейдер, который компилируется и рисует пустоту,
// проходил её молча. Ключевой замер — пиксели спрайта, а не синтаксис.
if (fs.existsSync('src/world/fieldMaterial.js')) {
  const r = run('node tools/material-check.mjs');
  if (!r.ok) refuse('шейдер глифового поля не рисует глифы', r.out);
  console.log('шейдер поля в порядке');
}

// Детерминизм по сиду (правило 7) и читаемость глубины — признак 2 в REFERENCE.md.
if (fs.existsSync('src/world/world.js')) {
  const r = run('node tools/world-check.mjs');
  if (!r.ok) refuse('мир на экране не проходит проверку', r.out);
  console.log('мир в порядке: сид детерминирован, глубина читается');
}

if (fs.existsSync('server.mjs') && fs.existsSync('index.html')) {
  const worldReady = fs.existsSync('src/world/world.js');
  const extra = worldReady ? ' --expect-content' : '';
  const r = run('node tools/browser-check.mjs --name ' + id.toLowerCase() + ' --wait 5' + extra);
  if (!r.ok) refuse('страница открывается с ошибками', r.out);
  console.log('страница чистая, скриншот: .planning/shots/' + id.toLowerCase() + '.png');
}

const path = '.planning/BACKLOG.md';
const before = fs.readFileSync(path, 'utf8');
const row = new RegExp('(\\|\\s*' + id + '\\s*\\|[^|]*\\|\\s*)todo(\\s*\\|)');
if (!row.test(before)) {
  if (new RegExp('\\|\\s*' + id + '\\s*\\|[^|]*\\|\\s*done').test(before)) {
    console.log(id + ' уже отмечена как done');
  } else {
    console.error(id + ' не найдена в ' + path);
    process.exit(1);
  }
} else {
  fs.writeFileSync(path, before.replace(row, '$1done$2'));
  console.log(id + ' отмечена done');
}

const title = (() => {
  const m = fs.readFileSync('.planning/ISSUES.md', 'utf8').match(new RegExp('^## ' + id + ' — (.+)$', 'm'));
  return m ? m[1] : id;
})();

try {
  execSync('git add -A', { stdio: 'pipe' });
  const audit = run('node tools/audit-task.mjs ' + id);
  console.log(audit.out.trim());
  if (!audit.ok) {
    execSync('git reset', { stdio: 'pipe' });
    const NL2 = String.fromCharCode(10);
    const back = fs.readFileSync(path, 'utf8').split(NL2)
      .map(l => (l.includes('| ' + id + ' |') ? l.replace('| done |', '| todo |') : l))
      .join(String.fromCharCode(10));
    fs.writeFileSync(path, back);
    refuse('аудит нашёл нарушение инварианта', audit.out);
  }
  const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
  if (staged) {
    execSync('git commit -m "' + id + ': ' + title.replace(/"/g, '') + '"', { stdio: 'pipe' });
    console.log('коммит сделан, файлов: ' + staged.split('\n').length);
  } else {
    console.log('коммитить нечего');
  }
} catch (e) {
  console.log('коммит не удался: ' + String(e.message).split('\n')[0]);
}

const issues = fs.readFileSync('.planning/ISSUES.md', 'utf8');
const body = (() => {
  const from = issues.indexOf('## ' + id + ' — ');
  if (from < 0) return '';
  const rest = issues.slice(from);
  const to = rest.indexOf('\n## ');
  return to < 0 ? rest : rest.slice(0, to);
})();

const eyes = (() => {
  const m = body.match(/\*\*Приёмка глазами[^:]*:\*\*\s*([\s\S]*?)(?:\n\n|\n\*\*|$)/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
})();
const milestone = /Демо D\d готово/.test(body) ? (body.match(/Демо (D\d) готово/) || [])[1] : null;

const doneCount = fs.readFileSync(path, 'utf8').split(String.fromCharCode(10))
  .filter(l => /^\|\s*N\d+\s*\|/.test(l) && /\|\s*done\s*\|/.test(l)).length;
const reviewFile = '.planning/review/' + id + '.md';
const hasNotes = fs.existsSync(reviewFile) &&
  /## (нарушения|предупреждения)/.test(fs.readFileSync(reviewFile, 'utf8'));
const everyThird = doneCount % 3 === 0;
const askReport = true;

console.log('');
console.log('#'.repeat(78));
console.log('ЧТО ДЕЛАТЬ ЧЕЛОВЕКУ СЕЙЧАС');
console.log('#'.repeat(78));
if (milestone) {
  console.log('Закрыта демо-точка ' + milestone + '. Новую сессию пока НЕ начинай.');
  console.log('Открой http://localhost:5173 (сервер: npm run dev), посмотри результат');
  console.log('и покажи Клоду: что видно на экране и вывод последней проверки.');
  if (eyes) console.log('Смотреть именно на это: ' + eyes);
  console.log('Клод сверит с референсом и скажет, идём дальше или добираем.');
} else if (eyes) {
  console.log('Задача с визуальной приёмкой. Открой http://localhost:5173 и проверь:');
  console.log('  ' + eyes);
  console.log('Так — начинай новую сессию строкой ниже. Не так — напиши Клоду, что видишь.');
} else {
  console.log('Проверять глазами тут нечего. Просто начинай новую сессию строкой ниже.');
}
if (askReport) {
  console.log('');
  console.log('СООБЩЕНИЕ КЛОДУ. Повод: ' +
    (milestone ? 'закрыта демо-точка ' + milestone
      : hasNotes ? 'аудит оставил замечания по ' + id
      : eyes ? 'задача с визуальной приёмкой'
      : 'обычный отчёт по задаче, закрыто задач: ' + doneCount) + '.');
  console.log('Выполни и отправь весь вывод Клоду, вместе со скриншотом из списка внизу:');
  console.log('');
  console.log('  node tools/report.mjs');
  console.log('');
}
console.log('');
console.log('Строка для новой сессии (всегда одна и та же):');
console.log('');
console.log('  Первым действием выполни: node tools/next-task.mjs');
console.log('  Дальше делай ровно то, что он напечатал. Не составляй план.');
console.log('');
if (fs.existsSync('.planning/shots/' + id.toLowerCase() + '.png')) {
  console.log('Скриншот этой сессии: .planning/shots/' + id.toLowerCase() + '.png');
  console.log('');
}
console.log('Промт следующей задачи модель получит сама — копировать его не нужно.');
console.log('#'.repeat(78));
