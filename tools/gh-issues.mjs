// Заливка задач из .planning/ISSUES.md в issues на GitHub.
//
// Сухой прогон (ничего не создаёт, печатает что создал бы):
//   node tools/gh-issues.mjs
// Настоящая заливка:
//   GITHUB_TOKEN=xxx node tools/gh-issues.mjs --push
// Только одна демо-точка:
//   GITHUB_TOKEN=xxx node tools/gh-issues.mjs --push --epic D1
//
// Токену нужен доступ на запись issues в репозитории.
import fs from 'node:fs';

const REPO = 'Ilyaworks/neuroglyphs';
const push = process.argv.includes('--push');
const epicArg = (() => {
  const i = process.argv.indexOf('--epic');
  return i > -1 ? process.argv[i + 1] : null;
})();

const src = fs.readFileSync('.planning/ISSUES.md', 'utf8').split(/\r?\n/);
const tasks = [];
let epic = null, cur = null;

for (const line of src) {
  const e = line.match(/^# (D\d) — (.+)$/);
  if (e) { epic = e[1]; continue; }
  const t = line.match(/^## (N\d+) — (.+)$/);
  if (t) {
    if (cur) tasks.push(cur);
    cur = { id: t[1], title: t[2], epic, body: [] };
    continue;
  }
  if (cur && !/^---$/.test(line)) cur.body.push(line);
}
if (cur) tasks.push(cur);

const rules = src.slice(
  src.findIndex(l => l.startsWith('## Правила для исполнителя')),
  src.findIndex(l => l.startsWith('# Дорожная карта')),
).join('\n').trim();

const picked = tasks.filter(t => t.epic && (!epicArg || t.epic === epicArg));
console.log('задач найдено: ' + tasks.length + ', к заливке: ' + picked.length);

function labels(t) {
  const found = new Set(['epic:' + t.epic]);
  const m = t.body.join('\n').match(/`(area:[a-z]+)`/g) || [];
  for (const x of m) found.add(x.replace(/`/g, ''));
  return [...found];
}

async function create(t) {
  const body = t.body.join('\n').trim() + '\n\n---\n\n' + rules;
  const res = await fetch('https://api.github.com/repos/' + REPO + '/issues', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: t.id + ' — ' + t.title, body, labels: labels(t) }),
  });
  if (!res.ok) throw new Error(t.id + ': ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const j = await res.json();
  console.log('создан #' + j.number + '  ' + t.id + ' — ' + t.title);
}

if (!push) {
  for (const t of picked) console.log('  ' + t.id + '  [' + labels(t).join(', ') + ']  ' + t.title);
  console.log('\nсухой прогон. для заливки: GITHUB_TOKEN=xxx node tools/gh-issues.mjs --push');
  process.exit(0);
}
if (!process.env.GITHUB_TOKEN) {
  console.error('нет GITHUB_TOKEN в окружении');
  process.exit(1);
}
for (const t of picked) {
  await create(t);
  await new Promise(r => setTimeout(r, 900));
}
console.log('готово: ' + picked.length);
