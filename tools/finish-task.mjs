// Закрывает задачу: ставит done в .planning/BACKLOG.md, коммитит работу и печатает
// промт следующей задачи.
//
//   node tools/finish-task.mjs N01
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const id = (process.argv[2] || '').toUpperCase();
if (!/^[NR]\d+$/.test(id)) {
  console.error('нужен номер задачи или правки, например: node tools/finish-task.mjs N01');
  process.exit(1);
}

function run(cmd) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') || e.message };
  }
}

function refuse(what, out) {
  console.error('');
  console.error('#'.repeat(78));
  console.error('ЗАДАЧА НЕ ЗАКРЫТА: ' + what);
  console.error('#'.repeat(78));
  const NL = String.fromCharCode(10);
  console.error(out.trim().split(NL).slice(-25).join(NL));
  console.error('');
  console.error('Задача осталась todo, коммита нет. Исправь причину и запусти finish-task снова.');
  console.error('Если не получается три раза — отложи: node tools/blocked.mjs ' + id + ' "почему"');
  process.exit(1);
}

const pkg = fs.existsSync('package.json') ? JSON.parse(fs.readFileSync('package.json', 'utf8')) : {};
if (pkg.scripts && pkg.scripts.test) {
  const r = run('npm test');
  if (!r.ok) refuse('падают тесты (npm test)', r.out);
  console.log('тесты прошли');
}

if (fs.existsSync('atlas.html') && fs.existsSync('src/core/atlas.js')) {
  const r = run('node tools/atlas-check.mjs');
  if (!r.ok) refuse('атлас собран неверно', r.out);
  console.log('атлас в порядке');
}

// node --check у геометрии поля проверяет только синтаксис, а browser-check её не видит:
// до N11 модуль ниоткуда не импортируется. Поэтому отдельный прогон с заглушкой three.
if (fs.existsSync('src/world/fieldGeometry.js')) {
  const r = run('node tools/geometry-check.mjs');
  if (!r.ok) refuse('геометрия глифового поля не работает', r.out);
  console.log('геометрия поля в порядке');
}

// У N10 проверка была `node --check`: шейдер, который компилируется и рисует пустоту,
// проходил её молча. Ключевой замер — пиксели спрайта, а не синтаксис.
if (fs.existsSync('src/world/fieldMaterial.js')) {
  const r = run('node tools/material-check.mjs');
  if (!r.ok) refuse('шейдер глифового поля не рисует глифы', r.out);
  console.log('шейдер поля в порядке');
}

if (fs.existsSync('src/world/layouts')) {
  const r = run('node tools/layout-check.mjs');
  if (!r.ok) refuse('раскладки не проходят проверку', r.out);
  console.log('раскладки в порядке');
}

// У N17 проверкой был только `node --check`: портал, собранный одинаково во всех мирах
// и с рамкой из двух сторон вместо четырёх, проходил её молча. Ключевое здесь —
// зависимость от сида и замкнутость рамки, а не синтаксис.
if (fs.existsSync('src/world/portal.js')) {
  const r = run('node tools/portal-check.mjs');
  if (!r.ok) refuse('портал выхода не проходит проверку', r.out);
  console.log('портал в порядке');
}

// Детерминизм по сиду (правило 7) и читаемость глубины — признак 2 в REFERENCE.md.
if (fs.existsSync('src/world/world.js')) {
  const r = run('node tools/world-check.mjs');
  if (!r.ok) refuse('мир на экране не проходит проверку', r.out);
  console.log('мир в порядке: сид детерминирован, глубина читается');
}

// Проверкой N25 был счёт ключей MOODS. Его проходит модуль, у которого единственная
// функция падает на первом вызове: так и приехала первая версия палитр.
if (fs.existsSync('src/art/palettes.js')) {
  const r = run('node tools/palette-check.mjs');
  if (!r.ok) refuse('палитры настроений не проходят проверку', r.out);
  console.log('палитры в порядке');
}

// Признак 8 из REFERENCE.md: настроения различимы. Проверкой N26 были `node --check` и
// world-check — обе проходит мир, в котором палитра посчитана и выброшена: цвет живёт
// в uniform-ах, а world-check сравнивает атрибуты геометрии. Маркер двойной: обычно это
// «world.js уже зовёт resolvePalette», но на самой N26 гейт обязателен независимо от кода,
// иначе задачу можно закрыть, не подключив палитру ни к чему.
if (fs.existsSync('src/art/palettes.js') && fs.existsSync('src/world/world.js') &&
    (/resolvePalette/.test(fs.readFileSync('src/world/world.js', 'utf8')) || id === 'N26')) {
  const r = run('node tools/mood-check.mjs');
  if (!r.ok) refuse('палитра настроения не доходит до сцены', r.out);
  console.log('палитра в сцене: настроения различимы на кадре');
}

// Проверка N24 — `node --check` плюс приёмка глазами. Между ними проходит setFisheye,
// который пишет в общий шаблон шейдера вместо uniform-ов своего прохода: эффекта нет,
// синтаксис безупречен, а глазами это выглядит как «дисторсия слабовата».
if (fs.existsSync('src/render/post.js')) {
  const r = run('node tools/post-check.mjs');
  if (!r.ok) refuse('связка постобработки не проходит проверку', r.out);
  console.log('постобработка в порядке');
}

// «Каталог руками не править» было только текстом задачи, и этого не хватило: на N27 в
// shapePatch.js дописали 51 форму, среди них заново определили имена из каталога, и они
// молча вытеснили замеренные версии. Теперь это сверка с историей побайтово.
if (fs.existsSync('src/world/shapeCatalog.js')) {
  const r = run('node tools/catalog-untouched.mjs --task ' + id);
  if (!r.ok) refuse('каталог форм правили руками', r.out);
  console.log('каталог форм совпадает с историей');
}

// Каталог форм приезжает из истории, и shape-check мерит именно его: заполненность объёма,
// ядро, кольцо, концентрацию. Руками каталог править нельзя, поэтому гейт тут сторожит
// не задачу, а сохранность 64 отобранных форм.
if (fs.existsSync('src/world/shapeCatalog.js') && fs.existsSync('tools/shape-check.mjs')) {
  const r = run('node tools/shape-check.mjs');
  if (!r.ok) refuse('каталог форм не проходит проверку', r.out);
  console.log('каталог форм в порядке');
}

// Невозможные фигуры — единственное в проекте, что нельзя принять глазами: разница между
// треугольником Пенроуза и кривой рамкой это один-два пикселя в проекции. Гейт проецирует
// швы из точки привязки сам.
// Фигура в мире: гейт модуля зелен и на фигуре размером в точку — он мерит модуль, а не
// сцену. figure-check проецирует швы из настоящей камеры и мерит экранный размер.
if (fs.existsSync('src/world/world.js') &&
    /buildImpossible/.test(fs.readFileSync('src/world/world.js', 'utf8'))) {
  const r = run('node tools/figure-check.mjs');
  if (!r.ok) refuse('невозможная фигура в мире не проходит проверку', r.out);
  console.log('фигура в мире в порядке: видна от входа, швы сходятся из настоящей камеры');
}

if (fs.existsSync('src/atmosphere/impossible.js')) {
  const r = run('node tools/impossible-check.mjs');
  if (!r.ok) refuse('невозможные фигуры не проходят проверку', r.out);
  console.log('невозможные фигуры в порядке: швы сходятся из точки привязки и ломаются при отходе');
}

// А это гейт самого тонкого слоя: shape-check про shapeField.js не знает ничего, и без
// отдельной проверки слой закрылся бы ровно так, как закрывалась неработающая N09 —
// модуль, который до поздней задачи никто не импортирует.
// Набор новых форм: shape-check мерит только каталог, про новый файл он не знает.
if (fs.existsSync('src/world/shapeIllusions.js')) {
  const r = run('node tools/illusion-check.mjs');
  if (!r.ok) refuse('новый набор форм не проходит проверку', r.out);
  console.log('новые формы в порядке: провалы, пустые середины, без близнецов');
}

if (fs.existsSync('src/world/shapeField.js')) {
  const r = run('node tools/shapefield-check.mjs');
  if (!r.ok) refuse('слой форм не проходит проверку', r.out);
  console.log('слой форм в порядке: формы разные, число точек и габарит доходят до формы');
}

// У N29 проверкой стоял только `node --check` — тот самый класс, которым закрылась
// неработающая N09. Пол вдобавок легко сдать так, что он есть в данных и не виден:
// копия вместо отражения, затухание резкой границей, тусклость через размер точки.
if (fs.existsSync('src/render/floor.js')) {
  const r = run('node tools/floor-check.mjs');
  if (!r.ok) refuse('отражающий пол не проходит проверку', r.out);
  console.log('отражающий пол в порядке: зеркало от линии пола, затухание, сетка по габариту');
}

// У N30 проверкой стоял подсчёт длины массива FORMULAS — ровно как у N12, где счёт
// экспортов пропустил раскладку на 260 точек вместо 23500.
if (fs.existsSync('src/world/textField.js')) {
  const r = run('node tools/textfield-check.mjs');
  if (!r.ok) refuse('поле надписей не проходит проверку', r.out);
  console.log('поле надписей в порядке: буквы растеризуются, пробелы пусты, строка не обрезана');
}

// Проверкой N23 был счёт имён экспортов: её проходит и шейдер с ошибкой в GLSL, и
// шейдер, который ничего не делает, и шейдер, который падает на первом кадре.
if (fs.existsSync('src/render/shaders.js')) {
  const r = run('node tools/shaders-check.mjs');
  if (!r.ok) refuse('дисторсии не проходят проверку', r.out);
  console.log('дисторсии в порядке');
}

// У N19 проверкой был только `node --check`, а модуль до поздней задачи никем не
// импортируется — то же сочетание, которым закрылась неработающей N09.
if (fs.existsSync('src/player/flycam.js')) {
  const r = run('node tools/flycam-check.mjs');
  if (!r.ok) refuse('полёт камеры не проходит проверку', r.out);
  console.log('полёт камеры в порядке');
}

// «Повторный Tab возвращает в то же положение» глазами не проверяется: разница
// в пол-градуса не видна, а демонстрация от неё разъезжается.
if (fs.existsSync('src/player/freeze.js')) {
  const r = run('node tools/freeze-check.mjs');
  if (!r.ok) refuse('осмотр со стороны не проходит проверку', r.out);
  console.log('осмотр со стороны в порядке');
}

// Полёт, осмотр, мир и портал по отдельности зелёные, а демонстрация живёт на их стыке:
// порядок вызовов в кадре и прыжок взгляда после выхода из осмотра не видны никому.
if (fs.existsSync('.planning/DEMO-D1.md')) {
  const r = run('node tools/demo-check.mjs');
  if (!r.ok) refuse('собранная демонстрация не проходит проверку', r.out);
  console.log('демонстрация в порядке: летит, осматривает, возвращается');
}

if (fs.existsSync('server.mjs') && fs.existsSync('index.html')) {
  const worldReady = fs.existsSync('src/world/world.js');
  const extra = worldReady ? ' --expect-content' : '';
  const r = run('node tools/browser-check.mjs --name ' + id.toLowerCase() + ' --wait 5' + extra);
  if (!r.ok) refuse('страница открывается с ошибками', r.out);
  console.log('страница чистая, скриншот: .planning/shots/' + id.toLowerCase() + '.png');
}

// Приёмка глазами: гейты её не заменяют, и удерживать её надо механизмом, а не текстом.
// R25 закрылась отчётом «все гейты прошли» при семи одинаковых формах на листе —
// картинка лежала на диске, но ничто не мешало закрыть задачу, не посмотрев на неё.
// Вердикт выносит человек командой tools/verdict.mjs и привязан к отпечатку картинки.
{
  const issues = fs.readFileSync('.planning/ISSUES.md', 'utf8').split(/\r?\n/);
  const s = issues.findIndex(l => new RegExp('^## ' + id + ' — ').test(l));
  if (s >= 0) {
    let e = issues.length;
    for (let i = s + 1; i < issues.length; i++) {
      if (/^## [NR]\d+ — /.test(issues[i])) { e = i; break; }
    }
    const body = issues.slice(s, e);
    if (body.some(l => /\*\*Приёмка глазами/.test(l))) {
      const v = run('node tools/verdict.mjs ' + id + ' --check');
      const shown = run('node tools/verdict.mjs ' + id);
      if (!/ВЕРДИКТ_ЕСТЬ/.test(v.out)) {
        refuse('нет вердикта приёмки глазами — задачу закрывает человек, а не гейты',
          'У этой задачи приёмка назначена глазами. Гейты её не заменяют: они мерят то,'
          + String.fromCharCode(10) + 'что умеют измерить, а решает картинка.'
          + String.fromCharCode(10) + String.fromCharCode(10)
          + 'Сделай так: пересними картинку, напечатай человеку блок ниже целиком и'
          + String.fromCharCode(10) + 'останови работу словом STOP. Сам вердикт не выноси и задачу не закрывай.'
          + String.fromCharCode(10) + String.fromCharCode(10) + shown.out);
      }
      console.log('вердикт приёмки глазами на месте');
    }
  }
}

const path = '.planning/BACKLOG.md';
const before = fs.readFileSync(path, 'utf8');
const row = new RegExp('(\\|\\s*' + id + '\\s*\\|[^|]*\\|\\s*)todo(\\s*\\|)');
if (!row.test(before)) {
  if (new RegExp('\\|\\s*' + id + '\\s*\\|[^|]*\\|\\s*done').test(before)) {
    console.log(id + ' уже отмечена как done');
  } else {
    console.error(id + ' не найдена в ' + path);
    process.exit(1);
  }
} else {
  fs.writeFileSync(path, before.replace(row, '$1done$2'));
  console.log(id + ' отмечена done');
}

const title = (() => {
  const m = fs.readFileSync('.planning/ISSUES.md', 'utf8').match(new RegExp('^## ' + id + ' — (.+)$', 'm'));
  return m ? m[1] : id;
})();

try {
  execSync('git add -A', { stdio: 'pipe' });
  const audit = run('node tools/audit-task.mjs ' + id);
  console.log(audit.out.trim());
  if (!audit.ok) {
    execSync('git reset', { stdio: 'pipe' });
    const NL2 = String.fromCharCode(10);
    const back = fs.readFileSync(path, 'utf8').split(NL2)
      .map(l => (l.includes('| ' + id + ' |') ? l.replace('| done |', '| todo |') : l))
      .join(String.fromCharCode(10));
    fs.writeFileSync(path, back);
    refuse('аудит нашёл нарушение инварианта', audit.out);
  }
  const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
  if (staged) {
    execSync('git commit -m "' + id + ': ' + title.replace(/"/g, '') + '"', { stdio: 'pipe' });
    console.log('коммит сделан, файлов: ' + staged.split('\n').length);
  } else {
    console.log('коммитить нечего');
  }
} catch (e) {
  console.log('коммит не удался: ' + String(e.message).split('\n')[0]);
}

const issues = fs.readFileSync('.planning/ISSUES.md', 'utf8');
const body = (() => {
  const from = issues.indexOf('## ' + id + ' — ');
  if (from < 0) return '';
  const rest = issues.slice(from);
  const to = rest.indexOf('\n## ');
  return to < 0 ? rest : rest.slice(0, to);
})();

const eyes = (() => {
  const m = body.match(/\*\*Приёмка глазами[^:]*:\*\*\s*([\s\S]*?)(?:\n\n|\n\*\*|$)/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
})();
const milestone = /Демо D\d готово/.test(body) ? (body.match(/Демо (D\d) готово/) || [])[1] : null;

const doneCount = fs.readFileSync(path, 'utf8').split(String.fromCharCode(10))
  .filter(l => /^\|\s*N\d+\s*\|/.test(l) && /\|\s*done\s*\|/.test(l)).length;
const reviewFile = '.planning/review/' + id + '.md';
const hasNotes = fs.existsSync(reviewFile) &&
  /## (нарушения|предупреждения)/.test(fs.readFileSync(reviewFile, 'utf8'));
const everyThird = doneCount % 3 === 0;
console.log('');
console.log('#'.repeat(78));
console.log('ЧТО ДЕЛАТЬ ЧЕЛОВЕКУ СЕЙЧАС');
console.log('#'.repeat(78));
if (milestone) {
  console.log('Закрыта демо-точка ' + milestone + ' — это точка сравнения с референсом.');
  console.log('Открой http://localhost:5173 (сервер: npm run dev) и посмотри сам.');
  console.log('Сверяться по списку признаков: .planning/REFERENCE.md');
} else if (eyes) {
  console.log('Задача с приёмкой глазами — её вердикт ты уже дал, иначе она бы не');
  console.log('закрылась. Смотреть заново не нужно.');
} else {
  console.log('Приёмка глазами тут не назначена — закрыли гейты. Делать нечего.');
}
if (hasNotes) {
  console.log('');
  console.log('Аудит оставил замечания по ' + id + ': .planning/review/' + id + '.md');
  console.log('Загляни туда, если что-то пойдёт не так дальше.');
}
console.log('');
console.log('Закрыто задач: ' + doneCount + '. Подробный отчёт, если нужен: node tools/report.mjs');
console.log('');
console.log('Строка для новой сессии (всегда одна и та же):');
console.log('');
console.log('  Первым действием выполни: node tools/next-task.mjs');
console.log('  Дальше делай ровно то, что он напечатал. Не составляй план.');
console.log('');
if (fs.existsSync('.planning/shots/' + id.toLowerCase() + '.png')) {
  console.log('Скриншот этой сессии: .planning/shots/' + id.toLowerCase() + '.png');
  console.log('');
}
console.log('Промт следующей задачи модель получит сама — копировать его не нужно.');
console.log('#'.repeat(78));
