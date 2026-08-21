// Сводка для проверяющего: что сделано с прошлой сверки, что подозрительно, куда смотреть.
// Вывод целиком копируется Клоду, вместе со скриншотом, путь к которому напечатан внизу.
//
//   node tools/report.mjs
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const NL = String.fromCharCode(10);
const MARK = '.planning/.last-report';
const say = s => console.log(s);

function git(cmd, fallback = '') {
  try { return execSync('git ' + cmd, { encoding: 'utf8' }).trim(); } catch { return fallback; }
}

const backlog = fs.readFileSync('.planning/BACKLOG.md', 'utf8').split(NL);
const rows = backlog.filter(l => /^\|\s*N\d+\s*\|/.test(l))
  .map(l => l.split('|').map(x => x.trim()))
  .map(c => ({ id: c[1], title: c[2], done: c[3] === 'done' }));
const doneRows = rows.filter(r => r.done);
const next = rows.find(r => !r.done);

const epicOf = (() => {
  const issues = fs.readFileSync('.planning/ISSUES.md', 'utf8').split(NL);
  const map = {};
  let epic = null;
  for (const l of issues) {
    const e = l.match(/^# (D\d) — /);
    if (e) epic = e[1];
    const t = l.match(/^## (N\d+) — /);
    if (t && epic) map[t[1]] = epic;
  }
  return map;
})();

say('=== СООБЩЕНИЕ КЛОДУ от рабочей сессии neuroglyphs ===');
say('');
say('прогресс: ' + doneRows.length + ' из ' + rows.length + ' задач');

// Правки по ревью идут вперёд задач N. Если они висят, проверяющий должен увидеть
// это первой строкой отчёта, а не выяснять из diff, что модель их обошла.
const fixRows = backlog.filter(l => /^\|\s*R\d+\s*\|/.test(l))
  .map(l => l.split('|').map(x => x.trim()))
  .map(c => ({ id: c[1], title: c[2], st: c[3] }));
const pendingFixes = fixRows.filter(r => r.st === 'todo');
if (pendingFixes.length) {
  say('НЕЗАКРЫТЫЕ ПРАВКИ ПО РЕВЬЮ (идут вперёд задач N): '
    + pendingFixes.map(r => r.id).join(', '));
  for (const r of pendingFixes) say('  ' + r.id + ' — ' + r.title);
}
if (next) say('следующая: ' + next.id + ' — ' + next.title + ' (демо-точка ' + (epicOf[next.id] || '?') + ')');
else say('все задачи закрыты');
say('');

const since = fs.existsSync(MARK) ? fs.readFileSync(MARK, 'utf8').trim() : '';
const range = since ? since + '..HEAD' : '-8';
say('## что сделано с прошлой сверки');
say('');
const log = git('log --format="%h %s" ' + (since ? range : '-8'));
say(log ? log : 'коммитов нет');
say('');
const stat = git('diff --stat ' + (since ? since + '..HEAD' : 'HEAD~3..HEAD'), '');
if (stat) {
  const rowsOut = stat.split(NL);
  say('изменения по файлам:');
  say(rowsOut.slice(0, 14).join(NL));
  if (rowsOut.length > 14) say('  ... и ещё строк: ' + (rowsOut.length - 14));
  say('');
}

say('## замечания аудита');
say('');
const reviews = fs.existsSync('.planning/review')
  ? fs.readdirSync('.planning/review').filter(f => f.endsWith('.md')).sort()
  : [];
let noted = 0;
for (const f of reviews.slice(-6)) {
  const text = fs.readFileSync('.planning/review/' + f, 'utf8');
  if (/## (нарушения|предупреждения)/.test(text)) {
    say(text.trim());
    say('');
    noted++;
  }
}
if (!noted) say('нет замечаний');
say('');

say('## проверки прямо сейчас');
say('');
const pkg = fs.existsSync('package.json') ? JSON.parse(fs.readFileSync('package.json', 'utf8')) : {};
if (pkg.scripts && pkg.scripts.test) {
  try {
    const out = execSync('npm test', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    say('npm test: ' + (out.match(/\w+_OK/g) || ['прошёл']).join(' '));
  } catch (e) {
    say('npm test: ПАДАЕТ');
    say(((e.stdout || '') + (e.stderr || '')).trim().split(NL).slice(-8).join(NL));
  }
} else say('npm test: тестов ещё нет');

if (fs.existsSync('server.mjs') && fs.existsSync('index.html')) {
  try {
    execSync('node tools/browser-check.mjs --name report --wait 5',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    say('страница: чистая');
  } catch (e) {
    say('страница: С ОШИБКАМИ');
    say(((e.stdout || '') + (e.stderr || '')).trim().split(NL).slice(-10).join(NL));
  }
} else say('страница: ещё не собрана');
say('');

say('## скриншоты — приложи их к сообщению');
say('');
if (fs.existsSync('.planning/shots')) {
  const shots = fs.readdirSync('.planning/shots')
    .filter(f => f.endsWith('.png'))
    .map(f => ({ f, t: fs.statSync('.planning/shots/' + f).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(0, 3);
  for (const s of shots) say('  .planning/shots/' + s.f);
  if (!shots.length) say('  скриншотов пока нет');
} else say('  скриншотов пока нет');
say('');
say('=== КОНЕЦ СООБЩЕНИЯ ===');
say('');
say('Человеку: скопируй всё это Клоду вместе со скриншотом из списка выше.');
say('Ответ Клода вставь целиком в начало следующей сессии — модель поймёт его как');
say('указания проверяющего и выполнит до того, как возьмёт новую задачу.');

fs.writeFileSync(MARK, git('rev-parse HEAD', ''));
