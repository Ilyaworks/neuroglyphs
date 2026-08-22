// Каталог форм обязан совпадать с историей побайтово.
//
//   node tools/catalog-untouched.mjs
//
// Зачем: в N27 сказано «каталог руками не править: формы отобраны и замерены», и это
// единственная защита от того, чтобы набор поплыл. Одного текста не хватило. На N27 модель,
// работавшая по старой версии задачи, переписала `shapePatch.js` с 13 форм на 64: дописала
// 51 форму руками и среди них заново определила имена, которые уже были в каталоге —
// juliaCloud, nebulaPillars, kleinBottle, mobiusStrip, mandelShell, centerTorus и другие.
// Каталог собирается как { ...BASE_SHAPES, ...PATCH }, поэтому её версии молча вытеснили
// замеренные, и одиннадцать форм перестали проходить барьер объёма.
//
// Замеренная норма восстановленного каталога: 44 формы, «не проходят проверку: 0».
// Новые формы добавляются отдельным файлом в N63, а не правкой этих двух.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const SOURCE = '3bbd249';
const GUARDED = [
  'src/world/shapeCatalog.js',
  'src/world/shapePatch.js',
  'src/world/legacyShapes.js',
  'src/world/allShapes.js',
];

const norm = (t) => t.split(String.fromCharCode(13)).join('');
const problems = [];
let checked = 0;

for (const file of GUARDED) {
  if (!fs.existsSync(file)) continue;
  let want;
  try {
    want = execSync('git show ' + SOURCE + ':' + file, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch {
    console.log(file + ': в истории ' + SOURCE + ' такого файла нет, сверять не с чем');
    continue;
  }
  checked++;
  const got = fs.readFileSync(file, 'utf8');
  if (norm(got) === norm(want)) {
    console.log(file + ': совпадает с ' + SOURCE);
    continue;
  }
  const a = norm(want).split(String.fromCharCode(10)).length;
  const b = norm(got).split(String.fromCharCode(10)).length;
  problems.push(file + ': отличается от ' + SOURCE + ' (строк было ' + a + ', стало ' + b + '). ' +
    'Верни как есть: git show ' + SOURCE + ':' + file + ' > ' + file);
}

if (!checked) {
  console.log('каталога форм ещё нет, сверять нечего');
  console.log('CATALOG_UNTOUCHED_OK');
  process.exit(0);
}

if (problems.length) {
  console.error('');
  console.error('Каталог форм правили руками. Формы в нём отобраны замером, и своя версия');
  console.error('формы с тем же именем молча вытесняет замеренную: каталог собирается как');
  console.error('{ ...BASE_SHAPES, ...PATCH }. Новые формы — отдельным файлом в задаче N63.');
  console.error('');
  for (const p of problems) console.error('  x ' + p);
  console.error('');
  console.error('CATALOG_TOUCHED');
  process.exit(1);
}

console.log('CATALOG_UNTOUCHED_OK');
