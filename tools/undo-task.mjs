// Откат задачи: отменяет её коммит и возвращает статус в todo.
//
//   node tools/undo-task.mjs N05
//
// Использует git revert, поэтому история не переписывается и ничего не теряется.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const id = (process.argv[2] || '').toUpperCase();
if (!/^N\d+$/.test(id)) {
  console.error('нужен номер задачи, например: node tools/undo-task.mjs N05');
  process.exit(1);
}

let sha = '';
try {
  sha = execSync('git log --format=%H%x09%s -n 200', { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
    .map(l => l.split('\t'))
    .find(([, subject]) => subject.startsWith(id + ':'))?.[0] || '';
} catch (e) {
  console.error('git недоступен: ' + e.message);
  process.exit(1);
}

if (!sha) {
  console.error('коммита с сообщением "' + id + ': ..." не нашлось в последних 200 коммитах');
  process.exit(1);
}

const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
if (dirty) {
  console.error('в дереве есть незакоммиченные изменения — сначала разберись с ними:');
  console.error(dirty.split(/\r?\n/).slice(0, 10).join(String.fromCharCode(10)));
  process.exit(1);
}

try {
  execSync('git revert --no-edit ' + sha, { stdio: 'pipe' });
  console.log('коммит ' + sha.slice(0, 8) + ' отменён');
} catch (e) {
  console.error('revert не удался (вероятно конфликт): ' + String(e.message).split(/\r?\n/)[0]);
  console.error('разрули вручную: git revert --abort, затем скажи Клоду');
  process.exit(1);
}

const path = '.planning/BACKLOG.md';
const before = fs.readFileSync(path, 'utf8');
const row = new RegExp('(\|\s*' + id + '\s*\|[^|]*\|\s*)done(\s*\|)');
if (row.test(before)) {
  fs.writeFileSync(path, before.replace(row, '$1todo$2'));
  execSync('git add ' + path + ' && git commit -m "backlog: reopen ' + id + '"', { stdio: 'pipe' });
  console.log(id + ' снова todo');
} else {
  console.log(id + ' и так не была отмечена done');
}

console.log('');
console.log('Задача открыта заново. Начинай новую сессию обычной строкой:');
console.log('  Первым действием выполни: node tools/next-task.mjs');
