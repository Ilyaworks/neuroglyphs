// Чей сейчас ход. Отвечает на вопрос человека «а мне что делать?» —
// по файлам, а не по переписке.
//
//   node tools/what-now.mjs
//
// Зачем: раньше состояние работы жило в сообщениях между человеком, моделью и
// проверяющим, поэтому человеку приходилось помнить, что он куда вставлял. Теперь
// состояние в файлах: BACKLOG знает, что закрыто, VERDICTS — что человек принял,
// ISSUES — что делать дальше. Эта команда просто читает их и называет одно действие.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const NL = String.fromCharCode(10);
const line = '='.repeat(78);
const say = (s = '') => console.log(s);

function tryRun(cmd) {
  try {
    return { ok: true, out: execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') || e.message };
  }
}

const backlog = fs.readFileSync('.planning/BACKLOG.md', 'utf8');
const issues = fs.readFileSync('.planning/ISSUES.md', 'utf8').split(/\r?\n/);

// Промт печатаем ИЗ ФАЙЛА и целиком: человек не должен ходить за ним в другое место,
// а огрызок промта хуже отсутствия — он теряет заслонку приёмки и запреты.
function prompt() {
  const F = '.planning/START.md';
  if (!fs.existsSync(F)) return '(нет ' + F + ')';
  const t = fs.readFileSync(F, 'utf8');
  const i = t.indexOf('\n---\n');
  return (i < 0 ? t : t.slice(i + 5)).trim();
}

function newSession(why) {
  say(why);
  say('');
  say('#'.repeat(78));
  say('Вставьте это в новую сессию Квена целиком:');
  say('#'.repeat(78));
  say('');
  say(prompt());
  say('');
  say('#'.repeat(78));
  process.exit(0);
}

// Работа модели, оставшаяся незакоммиченной. Если задача при этом не закрыта и не
// отложена — сессия оборвалась на середине: так и случилось на R26, модель напечатала
// сводку вместо команды, и человек не получил ни промта, ни указаний.
const dirty = (() => {
  try {
    return execSync('git status --porcelain -- src test', { encoding: 'utf8' }).trim();
  } catch { return ''; }
})();

// Незакрытое: сначала правки по ревью, потом задачи — тот же порядок, что у next-task.
const open = [];
for (const l of backlog.split(/\r?\n/)) {
  const c = l.split('|').map(x => x.trim());
  if (c.length >= 4 && /^[NR]\d+$/.test(c[1] || '') && c[3] === 'todo') {
    open.push({ id: c[1], title: c[2] });
  }
}
open.sort((a, b) => (a.id[0] === b.id[0] ? 0 : a.id[0] === 'R' ? -1 : 1));
const task = open[0];

say(line);
say('ЧЕЙ ХОД');
say(line);
say();

// Отложенные печатаем ВСЕГДА и первыми: задача со статусом blocked выпадает из
// очереди, и если о ней не напоминать, она исчезнет молча — этим в проекте уже
// дважды теряли работу.
{
  const blocked = backlog.split(/\r?\n/)
    .map(l => l.split('|').map(x => x.trim()))
    .filter(c => c.length >= 4 && /^[NR]\d+$/.test(c[1] || '') && c[3] === 'blocked')
    .map(c => c[1] + ' — ' + c[2]);
  if (blocked.length) {
    say('ОТЛОЖЕНО И ЖДЁТ РАЗБОРА (' + blocked.length + '):');
    for (const b of blocked) say('  ' + b);
    say('');
    say('Подробности: .planning\\BLOCKED.md. Само не решится — это либо неверно');
    say('написанная задача, либо неправый гейт.');
    say('');
  }
}

if (!task) {
  say('Незакрытых задач в BACKLOG нет.');
  say('Ваш ход: ничего. Всё закрыто — можно смотреть демо или ставить новые задачи.');
  process.exit(0);
}

say('Сейчас в работе: ' + task.id + ' — ' + task.title);
say();

// Нужна ли этой задаче приёмка глазами
const s = issues.findIndex(l => new RegExp('^## ' + task.id + ' — ').test(l));
let needsEyes = false;
if (s >= 0) {
  let e = issues.length;
  for (let i = s + 1; i < issues.length; i++) {
    if (/^## [NR]\d+ — /.test(issues[i])) { e = i; break; }
  }
  needsEyes = issues.slice(s, e).some(l => /\*\*Приёмка глазами/.test(l));
}

if (!needsEyes) {
  say('Приёмка глазами этой задаче не назначена — её закроют гейты сами.');
  say();
  newSession('ВАШ ХОД: запустить сессию модели.');
}

const check = tryRun('node tools/verdict.mjs ' + task.id + ' --check');
const store = fs.existsSync('.planning/VERDICTS.md')
  ? fs.readFileSync('.planning/VERDICTS.md', 'utf8').split(/\r?\n/)
    .map(l => l.split('|').map(x => x.trim()))
    .filter(c => c.length >= 6 && c[1] === task.id)
  : [];
const last = store.length ? store[store.length - 1] : null;

if (check.ok) {
  say('Вы уже приняли эту картинку. Модель может закрывать задачу.');
  say();
  say('ВАШ ХОД: передайте в ТУ ЖЕ сессию Квена одну строку:');
  say();
  say('  Вердикт человека: принято. Выполни: node tools/finish-task.mjs ' + task.id);
  process.exit(0);
}

if (last && last[2] === 'не принято') {
  say('Ваш последний вердикт — НЕ ПРИНЯТО (' + last[4] + '):');
  say('  ' + (last[5] || 'причина не записана'));
  say();
  say('Причина уедет модели сама вместе с задачей, пересказывать не надо.');
  say();
  newSession('ВАШ ХОД: запустить НОВУЮ сессию модели.');
}

// Модель встала, не закрыв и не отложив задачу, и оставила правки в дереве.
// Это не «ждите» — это оборванная сессия, и человеку надо начинать новую.
if (dirty) {
  say('В дереве лежит незакоммиченная работа по этой задаче:');
  say('');
  say(dirty);
  say('');
  say('Задача не закрыта и не отложена. Значит сессия оборвалась на середине —');
  say('модель остановилась, не выполнив ни finish-task, ни blocked. Работа не');
  say('потеряна: новая сессия увидит её и продолжит с того же места.');
  say('');
  say('Если модель успела показать вам картинку и список пунктов — сначала ответьте');
  say('вердиктом (node tools/verdict.mjs ' + task.id + ' да либо нет "причина"),');
  say('и только потом начинайте новую сессию.');
  say('');
  newSession('ВАШ ХОД: начать новую сессию модели.');
}

say('Вердикта по текущей картинке нет — значит ход либо модели, либо ваш:');
say();
say('  * если модель ещё работает и не печатала STOP — ждите, делать нечего;');
say('  * если модель напечатала блок «ЧТО ПРОВЕРИТЬ ГЛАЗАМИ» и STOP — ваш ход, ниже.');
say();
say(line);
const shown = tryRun('node tools/verdict.mjs ' + task.id);
say(shown.out.trim());
