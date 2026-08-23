// Вердикт приёмки глазами. Смотрит человек, записывает эта команда.
//
//   node tools/verdict.mjs R26                  что именно проверить на картинке
//   node tools/verdict.mjs R26 да               принято
//   node tools/verdict.mjs R26 нет "причина"    не принято, с причиной
//
// Модель может записать вердикт со слов человека, сказанных прямо в сессии:
//   node tools/verdict.mjs R26 да --via-model
// Тогда в журнале останется «модель со слов человека». Это не защита — подделать
// «да» модель может, — а честный учёт: видно, какие вердикты человек ставил сам.
//
// Зачем. Приёмка глазами двенадцати задач была назначена, но ничем не удерживалась:
// R25 закрылась отчётом «все гейты прошли», хотя приёмку по контактному листу никто
// не делал, и семь форм из восьми на листе остались одной и той же. Картинка при этом
// лежала на диске и была в списке report.mjs — не хватало не картинки, а запрета
// закрывать задачу без вердикта. Запрет стоит в finish-task, а вердикты живут здесь.
//
// Вердикт привязан к ОТПЕЧАТКУ картинки, а не только к номеру задачи: поправили код —
// пересняли лист — отпечаток другой — вердикт устарел, и нужен новый. Иначе одно «да»
// закрывало бы всю дальнейшую работу над той же задачей.
import fs from 'node:fs';
import crypto from 'node:crypto';

const NL = String.fromCharCode(10);
const STORE = '.planning/VERDICTS.md';
const ISSUES = '.planning/ISSUES.md';

const argv = process.argv.slice(2);
// --via-model: вердикт записывает модель со слов человека, сказанных в сессии.
// Сам факт этого попадает в журнал: подделать «да» модель может, скрыть — нет.
const viaModel = argv.includes('--via-model');
const clean = argv.filter(a => a !== '--via-model');
const id = (clean[0] || '').toUpperCase();
const answer = (clean[1] || '').toLowerCase();
const reason = clean.slice(2).join(' ').replace(/^"|"$/g, '');

if (!/^[NR]\d+$/.test(id)) {
  console.error('нужен номер задачи: node tools/verdict.mjs R26');
  process.exit(1);
}

// ---- разбор задачи ------------------------------------------------------------
const issues = fs.readFileSync(ISSUES, 'utf8').split(/\r?\n/);
const start = issues.findIndex(l => new RegExp('^## ' + id + ' — ').test(l));
if (start < 0) {
  console.error(id + ' не найдена в ' + ISSUES);
  process.exit(1);
}
let end = issues.length;
for (let i = start + 1; i < issues.length; i++) {
  if (/^## [NR]\d+ — /.test(issues[i])) { end = i; break; }
}
const body = issues.slice(start, end);

export function taskNeedsEyes(lines) {
  return lines.some(l => /\*\*Приёмка глазами/.test(l));
}

// Картинки: строка «**Картинка:**» с путями в обратных кавычках. Если её нет —
// берём то, что снимает browser-check под именем задачи, и общий контактный лист.
function imagesOf(lines) {
  const line = lines.find(l => /^\*\*Картинк[аи]:\*\*/.test(l));
  if (line) {
    const found = [...line.matchAll(/`([^`]+\.png)`/g)].map(m => m[1]);
    if (found.length) return found;
  }
  const guess = ['.planning/shots/' + id.toLowerCase() + '.png'];
  if (/forms-sheet/.test(lines.join(NL))) guess.push('.planning/shots/forms-sheet.png');
  return guess;
}

// Пункты проверки: строки «- [ ] …» внутри задачи. Если их нет — печатаем абзац
// приёмки как есть, чтобы человеку было что читать даже у старых задач.
function checklistOf(lines) {
  const items = lines.filter(l => /^\s*- \[ \]/.test(l)).map(l => l.replace(/^\s*- \[ \]\s*/, ''));
  if (items.length) return items;
  const i = lines.findIndex(l => /\*\*Приёмка глазами/.test(l));
  if (i < 0) return [];
  const out = [lines[i].replace(/\*\*Приёмка глазами[^:]*:\*\*/, '').trim()];
  for (let j = i + 1; j < lines.length; j++) {
    if (!lines[j].trim() || /^\*\*/.test(lines[j])) break;
    out.push(lines[j].trim());
  }
  return [out.join(' ').trim()].filter(Boolean);
}

const fingerprint = (p) => {
  if (!fs.existsSync(p)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 12);
};

const images = imagesOf(body);
const stamps = images.map(p => ({ p, hash: fingerprint(p) }));
const key = stamps.map(s => s.p.split('/').pop() + ':' + (s.hash || 'нет')).join(' ');

// ---- чтение и запись вердиктов -------------------------------------------------
function readStore() {
  if (!fs.existsSync(STORE)) return [];
  return fs.readFileSync(STORE, 'utf8').split(/\r?\n/)
    .map(l => l.split('|').map(x => x.trim()))
    .filter(c => c.length >= 6 && /^[NR]\d+$/.test(c[1] || ''))
    .map(c => ({ id: c[1], verdict: c[2], key: c[3], when: c[4], reason: c[5],
      who: c[6] || 'человек сам' }));
}

// Вердикт годится, только если он про эту задачу, принят и снят с ТЕХ ЖЕ картинок.
export function acceptedFor(taskId, currentKey) {
  return readStore().some(v => v.id === taskId && v.verdict === 'принято' && v.key === currentKey);
}

function writeVerdict(verdict) {
  const when = (() => {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    // Местное время, не UTC: человек читает эту строку и должен узнавать свой час.
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())
      + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  })();
  const rows = readStore();
  const head = [
    '# Вердикты приёмки глазами',
    '',
    'Пишет `node tools/verdict.mjs`, смотрит человек. Вердикт привязан к отпечатку',
    'картинки: поправили код — пересняли — отпечаток другой — нужен новый вердикт.',
    '',
    '| задача | вердикт | картинки (отпечаток) | когда | причина отказа | кто записал |',
    '|---|---|---|---|---|---|',
  ];
  rows.push({ id, verdict, key, when, reason, who: viaModel ? 'модель со слов человека' : 'человек сам' });
  const lines = rows.map(v => '| '
    + [v.id, v.verdict, v.key, v.when, v.reason || '', v.who || 'человек сам'].join(' | ') + ' |');
  fs.writeFileSync(STORE, head.concat(lines, ['']).join(NL));
}

// ---- режим «последний отказ»: чтобы причина доехала до модели сама -------------
// Иначе человеку пришлось бы пересказывать её вручную, а конвейер должен вести себя сам.
if (answer === '--last') {
  const mine = readStore().filter(v => v.id === id);
  const last = mine[mine.length - 1];
  if (last && last.verdict === 'не принято') {
    console.log('## Человек уже смотрел на это и НЕ принял');
    console.log('');
    console.log('Отказ от ' + last.when + ': ' + (last.reason || 'причина не записана'));
    console.log('');
    console.log('Это не догадка и не замер — это приёмка глазами по картинке.');
    console.log('Спорить с ней замерами нельзя: гейт мерит то, что умеет, а решает картинка.');
    console.log('Исправь именно то, что названо в отказе, и не считай задачу сделанной,');
    console.log('пока человек не ответит «принято» на новую картинку.');
  }
  process.exit(0);
}

// ---- режим проверки для finish-task -------------------------------------------
// Печатает ВЕРДИКТ_ЕСТЬ только когда вердикт «принято» снят с этих самых картинок.
if (answer === '--check') {
  if (acceptedFor(id, key)) {
    console.log('ВЕРДИКТ_ЕСТЬ ' + key);
    process.exit(0);
  }
  console.log('вердикта нет для картинок: ' + key);
  process.exit(1);
}



// ---- режим печати: что проверить ----------------------------------------------
if (!answer) {
  const items = checklistOf(body);
  const title = body[0].replace(/^## /, '');
  console.log('='.repeat(78));
  console.log('ЧТО ПРОВЕРИТЬ ГЛАЗАМИ — ' + title);
  console.log('='.repeat(78));
  console.log('');
  console.log('Открой картинку:');
  for (const s of stamps) {
    console.log('  ' + s.p.replace(/\//g, '\\') + (s.hash ? '' : '   <- НЕТ ФАЙЛА, надо переснять'));
  }
  console.log('');
  if (!items.length) {
    console.log('Список проверки в задаче не расписан — читай абзац «Приёмка глазами» в ISSUES.md.');
  } else {
    console.log('Проверь по пунктам:');
    items.forEach((t, i) => console.log('  ' + (i + 1) + '. ' + t));
  }
  console.log('');
  const already = readStore().filter(v => v.id === id);
  if (already.length) {
    const last = already[already.length - 1];
    const fresh = last.key === key;
    console.log('Прошлый вердикт: ' + last.verdict + ' от ' + last.when
      + ' (записал: ' + last.who + ')'
      + (fresh ? ' — он про эту же картинку' : ' — картинка с тех пор изменилась, нужен новый'));
    console.log('');
  }
  console.log('-'.repeat(78));
  console.log('ОТВЕТИТЬ: скопируйте одну строку и вставьте в чат модели');
  console.log('-'.repeat(78));
  console.log('');
  console.log('  Если все пункты сошлись:');
  console.log('');
  console.log('      принято');
  console.log('');
  console.log('  Если что-то не так — назовите номера пунктов и что видите:');
  console.log('');
  console.log('      не принято: пункт 1 — <что видите своими словами>');
  if (items.length > 2) {
    console.log('      не принято: пункты 1 и 3 — <что видите своими словами>');
  }
  console.log('');
  console.log('Хватит и одного слова «принято» — модель сама запишет вердикт и закроет');
  console.log('задачу. «Ок», «продолжай», «давай дальше» вердиктом НЕ считаются: на них');
  console.log('модель обязана переспросить.');
  console.log('');
  console.log('Если хотите записать вердикт своей рукой, а не через модель:');
  console.log('  node tools/verdict.mjs ' + id + ' да');
  console.log('  node tools/verdict.mjs ' + id + ' нет "что именно не так"');
  console.log('');
  console.log('Без вердикта finish-task задачу не закроет.');
  process.exit(0);
}

// ---- режим записи --------------------------------------------------------------
const missing = stamps.filter(s => !s.hash);
if (missing.length) {
  console.error('нет картинок, по которым выносится вердикт:');
  for (const m of missing) console.error('  ' + m.p);
  console.error('сначала пересними их, потом выноси вердикт');
  process.exit(1);
}

if (['да', 'yes', 'принято', 'ок'].includes(answer)) {
  writeVerdict('принято');
  console.log(id + ': принято'
    + (viaModel ? ' (со слов человека в сессии)' : ' (человек записал сам)')
    + '. Картинки: ' + key);
  console.log('Теперь finish-task ' + id + ' пройдёт.');
} else if (['нет', 'no', 'отказ', 'не'].includes(answer)) {
  if (!reason) {
    console.error('к отказу нужна причина: node tools/verdict.mjs ' + id + ' нет "что не так"');
    process.exit(1);
  }
  writeVerdict('не принято');
  console.log(id + ': не принято — ' + reason);
  console.log('Задача остаётся открытой. Причину передай модели.');
} else {
  console.error('ответ — «да» или «нет "причина"», а не «' + answer + '»');
  process.exit(1);
}
