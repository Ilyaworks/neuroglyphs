// Каталог форм не правится внутри задачи: сверка с последним коммитом.
//
//   node tools/catalog-untouched.mjs
//   node tools/catalog-untouched.mjs --task N29
//
// Зачем: формы в каталоге отобраны замером, и своя версия формы с тем же именем молча
// вытесняет замеренную — каталог собирается как { ...BASE_SHAPES, ...PATCH }. На N27 в
// shapePatch.js дописали 51 форму, среди них заново определили juliaCloud, nebulaPillars,
// kleinBottle, mobiusStrip, mandelShell, centerTorus, и одиннадцать форм перестали
// проходить барьер объёма. Одного текста «каталог руками не править» не хватило.
//
// Сверка идёт с HEAD, а не с фиксированным коммитом истории: каталог законно меняется
// правками по ревью (например, когда из него убирают объекты прежней концепции), и после
// такой правки новый коммит становится новой нормой. Задача, которой каталог править
// РАЗРЕШЕНО, узнаётся по строке «Файлы:» её текста, взятого из HEAD, — то есть по контракту,
// подписанному до начала работы, а не по тому, что лежит на диске.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const TASK = (arg('task', '') || '').toUpperCase();

const GUARDED = [
  'src/world/shapeCatalog.js',
  'src/world/shapePatch.js',
];

const norm = (t) => t.split(String.fromCharCode(13)).join('');
const fromHead = (file) => {
  try {
    return execSync('git show HEAD:' + file, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch {
    return null;
  }
};

// Разрешена ли этой задаче правка каталога — по её тексту из HEAD.
const allowedByTask = (() => {
  if (!TASK) return false;
  const issues = fromHead('.planning/ISSUES.md');
  if (!issues) return false;
  const from = issues.indexOf('## ' + TASK + ' — ');
  if (from < 0) return false;
  const rest = issues.slice(from);
  const to = rest.indexOf(String.fromCharCode(10) + '## ');
  const body = to < 0 ? rest : rest.slice(0, to);
  const m = body.match(/\*\*Файлы:\*\*\s*(.+)/);
  if (!m) return false;
  const listed = [...m[1].matchAll(/`([^`]+)`/g)].map(x => x[1]);
  return GUARDED.some(g => listed.includes(g));
})();

if (allowedByTask) {
  console.log('задаче ' + TASK + ' правка каталога разрешена её текстом — сверка пропущена');
  console.log('CATALOG_UNTOUCHED_OK');
  process.exit(0);
}

const problems = [];
let checked = 0;

for (const file of GUARDED) {
  if (!fs.existsSync(file)) continue;
  const want = fromHead(file);
  if (want === null) {
    console.log(file + ': в HEAD такого файла нет, сверять не с чем');
    continue;
  }
  checked++;
  const got = fs.readFileSync(file, 'utf8');
  if (norm(got) === norm(want)) {
    console.log(file + ': совпадает с HEAD');
    continue;
  }
  const a = norm(want).split(String.fromCharCode(10)).length;
  const b = norm(got).split(String.fromCharCode(10)).length;
  problems.push(file + ': отличается от HEAD (строк было ' + a + ', стало ' + b + '). ' +
    'Верни как есть: git checkout HEAD -- ' + file);
}

if (!checked) {
  console.log('каталога форм ещё нет, сверять нечего');
  console.log('CATALOG_UNTOUCHED_OK');
  process.exit(0);
}

if (problems.length) {
  console.error('');
  console.error('Каталог форм правили внутри задачи, которой это не разрешено. Формы в нём');
  console.error('отобраны замером, и своя версия формы с тем же именем молча вытесняет');
  console.error('замеренную: каталог собирается как { ...BASE_SHAPES, ...PATCH }.');
  console.error('');
  for (const p of problems) console.error('  x ' + p);
  console.error('');
  console.error('CATALOG_TOUCHED');
  process.exit(1);
}

console.log('CATALOG_UNTOUCHED_OK');
