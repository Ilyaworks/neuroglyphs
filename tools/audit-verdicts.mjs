// Был ли учёт от человека: проверка последних закрытых задач.
//
//   node tools/audit-verdicts.mjs        последние 5
//   node tools/audit-verdicts.mjs 10     последние 10
//
// Зачем: приёмка глазами назначена двенадцати задачам, и до появления заслонки её
// ничто не удерживало — R25 закрылась отчётом «все гейты прошли», хотя на контактном
// листе семь форм из восьми остались одной и той же. Эта команда показывает по каждой
// закрытой задаче, был ли вердикт человека, и если был — кто его записал: человек сам
// или модель с его слов.
//
// Задачи без приёмки глазами тут не подозреваемые: их закрывают гейты, и это норма.
// Тревога — только «приёмка глазами была назначена, а вердикта нет».
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const N = Math.max(1, Math.min(50, parseInt(process.argv[2], 10) || 5));

const backlog = fs.readFileSync('.planning/BACKLOG.md', 'utf8');
const issues = fs.readFileSync('.planning/ISSUES.md', 'utf8').split(/\r?\n/);

const done = [];
for (const l of backlog.split(/\r?\n/)) {
  const c = l.split('|').map(x => x.trim());
  if (c.length >= 4 && /^[NR]\d+$/.test(c[1] || '') && c[3] === 'done') {
    done.push({ id: c[1], title: c[2] });
  }
}

// Порядок закрытия берём из истории: finish-task делает коммит «<НОМЕР>: заголовок».
function closedAt(id) {
  try {
    const out = execSync('git log -1 --format=%ct --grep="^' + id + ': " ',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return out ? parseInt(out, 10) : 0;
  } catch { return 0; }
}
for (const t of done) t.at = closedAt(t.id);
done.sort((a, b) => b.at - a.at);
const last = done.slice(0, N);

function needsEyes(id) {
  const s = issues.findIndex(l => new RegExp('^## ' + id + ' — ').test(l));
  if (s < 0) return false;
  let e = issues.length;
  for (let i = s + 1; i < issues.length; i++) {
    if (/^## [NR]\d+ — /.test(issues[i])) { e = i; break; }
  }
  return issues.slice(s, e).some(l => /\*\*Приёмка глазами/.test(l));
}

const store = fs.existsSync('.planning/VERDICTS.md')
  ? fs.readFileSync('.planning/VERDICTS.md', 'utf8').split(/\r?\n/)
    .map(l => l.split('|').map(x => x.trim()))
    .filter(c => c.length >= 6 && /^[NR]\d+$/.test(c[1] || ''))
    .map(c => ({ id: c[1], verdict: c[2], when: c[4], reason: c[5], who: c[6] || 'человек сам' }))
  : [];

const line = '='.repeat(78);
console.log(line);
console.log('УЧЁТ ОТ ЧЕЛОВЕКА — последние ' + last.length + ' закрытых задач');
console.log(line);
console.log('');

let alarm = 0, byHand = 0, viaModel = 0, noEyes = 0;
for (const t of last) {
  const eyes = needsEyes(t.id);
  const mine = store.filter(v => v.id === t.id && v.verdict === 'принято');
  const v = mine.length ? mine[mine.length - 1] : null;
  const when = t.at ? new Date(t.at * 1000).toISOString().slice(0, 10) : 'дата неизвестна';

  let mark, note;
  if (!eyes) {
    mark = '  · ';
    note = 'приёмка глазами не назначена — закрыли гейты, это норма';
    noEyes++;
  } else if (!v) {
    mark = ' !! ';
    note = 'ЗАКРЫТА БЕЗ ВАШЕГО ВЗГЛЯДА — приёмка глазами была назначена, вердикта нет';
    alarm++;
  } else if (v.who === 'человек сам') {
    mark = '  + ';
    note = 'вердикт «принято» от ' + v.when + ', записали вы сами';
    byHand++;
  } else {
    mark = '  + ';
    note = 'вердикт «принято» от ' + v.when + ', записала модель с ваших слов';
    viaModel++;
  }
  console.log(mark + t.id + ' — ' + t.title);
  console.log('      закрыта ' + when + '; ' + note);
  console.log('');
}

console.log(line);
console.log('Итог: без приёмки глазами ' + noEyes + ', с вашим вердиктом лично ' + byHand
  + ', с вердиктом через модель ' + viaModel + ', без вердикта ' + alarm + '.');
if (alarm) {
  console.log('');
  console.log('Задачи с пометкой !! закрылись до того, как заслонка была поставлена,');
  console.log('либо мимо неё. Стоит открыть их картинки и посмотреть самому: именно');
  console.log('так R25 уехала с семью одинаковыми формами.');
}
process.exit(alarm ? 2 : 0);
