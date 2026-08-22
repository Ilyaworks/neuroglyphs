// Аудит того, что модель сделала в задаче: сверяет изменённые файлы со списком из
// задачи и ищет признаки халтуры. Вызывается из finish-task.mjs перед коммитом.
//
//   node tools/audit-task.mjs N05          проверить подготовленные изменения
//
// Код выхода 1 — нарушен инвариант, задачу закрывать нельзя.
// Код выхода 0 — чисто или только предупреждения (они пишутся в .planning/review/).
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const NL = String.fromCharCode(10);
const id = (process.argv[2] || '').toUpperCase();
const issues = fs.readFileSync('.planning/ISSUES.md', 'utf8');

const body = (() => {
  const from = issues.indexOf('## ' + id + ' — ');
  if (from < 0) return '';
  const rest = issues.slice(from);
  const to = rest.indexOf(NL + '## ');
  return to < 0 ? rest : rest.slice(0, to);
})();

const allowed = (() => {
  const m = body.match(/\*\*Файлы:\*\*\s*(.+)/);
  if (!m) return [];
  return [...m[1].matchAll(/`([^`]+)`/g)].map(x => x[1]);
})();

const changed = execSync('git diff --cached --name-only', { encoding: 'utf8' })
  .split(/\r?\n/).filter(Boolean);

const blockers = [];
const warnings = [];

const ALWAYS_OK = [
  '.planning/BACKLOG.md', '.planning/review/', '.planning/shots/', 'package.json',
  'package-lock.json',
];

for (const f of changed) {
  if (ALWAYS_OK.some(p => f.startsWith(p))) continue;
  if (allowed.some(a => f === a || f.endsWith('/' + a))) continue;
  if (/^(test|tools)\//.test(f)) {
    blockers.push('менялся ' + f + ' — задача этого не разрешала. Правка тестов и ' +
      'инструментов вне задачи запрещена: так ослабляют проверки.');
  } else {
    warnings.push('файл вне списка задачи: ' + f);
  }
}

for (const f of changed) {
  if (!/\.(mjs|js)$/.test(f) || !fs.existsSync(f)) continue;
  if (f.startsWith('tools/')) continue;
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split(/\r?\n/).length;

  const codeSrc = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/Math\.random\s*\(/.test(codeSrc)) {
    blockers.push(f + ': найден Math.random() — нарушен инвариант 1, генерация должна ' +
      'быть детерминированной');
  }
  for (const mark of ['TODO', 'FIXME', 'заглушка', 'not implemented', 'stub']) {
    if (src.includes(mark)) warnings.push(f + ': осталась метка "' + mark + '"');
  }
  if (/^src\//.test(f) && lines < 25 && !/index\.js$/.test(f)) {
    warnings.push(f + ': всего ' + lines + ' строк — похоже на пустышку');
  }
  const counts = [...src.matchAll(/count\s*[:=]\s*(\d+)/g)].map(m => Number(m[1]));
  const small = counts.filter(n => n > 0 && n < 400);
  if (small.length) {
    warnings.push(f + ': подозрительно малое count = ' + small.join(', ') +
      ' — заглушка вместо настоящей раскладки?');
  }
  const bodies = [...src.matchAll(/export function (\w+)[^{]*\{([\s\S]*?)\n\}/g)]
    .map(m => [m[1], m[2].replace(/\s+/g, ' ').trim()]);
  const seen = new Map();
  for (const [name, text] of bodies) {
    if (text.length < 60) continue;
    if (seen.has(text)) warnings.push(f + ': ' + name + ' и ' + seen.get(text) +
      ' имеют одинаковое тело — копипаст вместо разных форм');
    else seen.set(text, name);
  }
}

fs.mkdirSync('.planning/review', { recursive: true });
const report = ['# ' + id, '', 'изменённые файлы: ' + (changed.join(', ') || 'нет'), ''];
if (blockers.length) report.push('## нарушения', ...blockers.map(w => '- ' + w), '');
if (warnings.length) report.push('## предупреждения', ...warnings.map(w => '- ' + w), '');
if (!blockers.length && !warnings.length) report.push('чисто');
fs.writeFileSync('.planning/review/' + id + '.md', report.join(NL) + NL);

for (const w of warnings) console.log('  предупреждение: ' + w);
for (const b of blockers) console.error('  НАРУШЕНИЕ: ' + b);
if (blockers.length) process.exit(1);
console.log('аудит пройден' + (warnings.length ? ', предупреждений: ' + warnings.length : ''));
