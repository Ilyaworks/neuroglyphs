// Отложить застрявшую задачу и пустить очередь дальше.
//
//   node tools/blocked.mjs N33 "гейт требует того, чего в задаче не описано"
//   node tools/blocked.mjs --list
//
// Зачем: раньше «ПРОВАЛ после трёх попыток» означал тупик — задача остаётся todo,
// next-task выдаёт её же, и следующая сессия начинает то же самое заново. Разобраться,
// виновата задача, гейт или код, может только человек, а до него дело могло не дойти.
//
// Теперь у застрявшей задачи есть выход: статус blocked. next-task её пропускает и
// выдаёт следующую, а список отложенного лежит в .planning/BLOCKED.md и печатается
// в what-now. Работа не встаёт, но и не теряется.
//
// ВАЖНО: откладывать можно только по-настоящему застрявшую — после трёх честных
// попыток. Это не способ обойти задачу, которую не хочется делать, и не способ
// обойти приёмку глазами: отказ человека блокировкой не снимается.
import fs from 'node:fs';

const NL = String.fromCharCode(10);
const BACKLOG = '.planning/BACKLOG.md';
const STORE = '.planning/BLOCKED.md';

const args = process.argv.slice(2);

if (args[0] === '--list' || !args.length) {
  if (!fs.existsSync(STORE)) {
    console.log('отложенных задач нет.');
    process.exit(0);
  }
  console.log(fs.readFileSync(STORE, 'utf8').trim());
  process.exit(0);
}

const id = (args[0] || '').toUpperCase();
const why = args.slice(1).join(' ').replace(/^"|"$/g, '');

if (!/^[NR]\d+$/.test(id)) {
  console.error('нужен номер задачи: node tools/blocked.mjs N33 "почему застряла"');
  process.exit(1);
}
if (!why || why.length < 15) {
  console.error('нужна причина, и подробная — по ней человек потом будет разбираться.');
  console.error('  node tools/blocked.mjs ' + id + ' "гейт X требует Y, а в задаче про Y ничего нет"');
  process.exit(1);
}

const backlog = fs.readFileSync(BACKLOG, 'utf8');
const row = new RegExp('(\\|\\s*' + id + '\\s*\\|[^|]*\\|\\s*)todo(\\s*\\|)');
if (!row.test(backlog)) {
  if (new RegExp('\\|\\s*' + id + '\\s*\\|[^|]*\\|\\s*blocked').test(backlog)) {
    console.log(id + ' уже отложена.');
    process.exit(0);
  }
  console.error(id + ' не найдена среди задач со статусом todo в ' + BACKLOG);
  process.exit(1);
}

const d = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const when = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())
  + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());

fs.writeFileSync(BACKLOG, backlog.replace(row, '$1blocked$2'));

const head = [
  '# Отложенные задачи',
  '',
  'Пишет `node tools/blocked.mjs`. Задача застряла: три честные попытки не прошли,',
  'и без человека не решить, виноват код, гейт или сама задача. Очередь идёт дальше,',
  'а разбираться с этим списком нужно отдельно — он не рассосётся сам.',
  '',
];
const prev = fs.existsSync(STORE)
  ? fs.readFileSync(STORE, 'utf8').split(/\r?\n/).filter(l => l.startsWith('## ')
    || (l.trim() && !l.startsWith('#') && !l.startsWith('Пишет') && !l.startsWith('и без')
      && !l.startsWith('а разбираться')))
  : [];

const entry = ['## ' + id + ' — отложена ' + when, '', why, ''];
fs.writeFileSync(STORE, head.concat(prev, entry).join(NL));

console.log(id + ' отложена, очередь пойдёт дальше.');
console.log('');
console.log('Скажи человеку ровно это:');
console.log('');
console.log('  Задача ' + id + ' застряла и отложена, я взял следующую.');
console.log('  Причина: ' + why);
console.log('  Она в .planning/BLOCKED.md и сама не решится — с ней надо разобраться');
console.log('  отдельно: либо поправить текст задачи, либо признать гейт неправым.');
console.log('');
console.log('Дальше выполни: node tools/next-task.mjs');
