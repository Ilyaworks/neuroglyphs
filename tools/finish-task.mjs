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

// Счётчик отказов по задаче. Лежит в файле, а не в голове модели: правило «три
// попытки» держалось на её самодисциплине и не сработало ни разу — на N31 сессия
// ушла в круг, напечатала «I'm stuck» и продолжила по тому же кругу. Теперь третий
// отказ откладывает задачу механически.
const ATTEMPTS = '.planning/.attempts.json';
const MAX_ATTEMPTS = 3;

function readAttempts() {
  try { return JSON.parse(fs.readFileSync(ATTEMPTS, 'utf8')); } catch { return {}; }
}
function writeAttempts(a) {
  try { fs.writeFileSync(ATTEMPTS, JSON.stringify(a, null, 1)); } catch {}
}

function refuse(what, out) {
  const NL = String.fromCharCode(10);
  const tail = out.trim().split(NL).slice(-25).join(NL);

  const all = readAttempts();
  const n = (all[id] || 0) + 1;
  all[id] = n;
  writeAttempts(all);

  console.error('');
  console.error('#'.repeat(78));
  console.error('ЗАДАЧА НЕ ЗАКРЫТА (отказ ' + n + ' из ' + MAX_ATTEMPTS + '): ' + what);
  console.error('#'.repeat(78));
  console.error(tail);
  console.error('');

  if (n >= MAX_ATTEMPTS) {
    // Третий отказ — задача откладывается сама. Причину берём из вывода гейта: это
    // самое фактичное, что есть, и не зависит от того, как модель себя чувствует.
    const why = what + ' (после ' + n + ' попыток; последний вывод гейта: '
      + tail.split(NL).filter(l => l.trim()).slice(-3).join(' / ').slice(0, 400) + ')';
    console.error('Это ' + n + '-й отказ по ' + id + '. Задача откладывается автоматически —');
    console.error('дальше крутиться нельзя, это уже съело одну сессию целиком.');
    console.error('');
    const r = run('node tools/blocked.mjs ' + id + ' "' + why.replace(/"/g, "'") + '"');
    console.error(r.out.trim());
    console.error('');
    console.error('Счётчик попыток сброшен. НЕ пытайся закрыть ' + id + ' снова:');
    console.error('напечатай человеку то, что велел blocked, и выполни next-task.');
    all[id] = 0;
    writeAttempts(all);
    process.exit(1);
  }

  console.error('Задача осталась todo, коммита нет. Исправь причину и запусти finish-task снова.');
  console.error('Осталось попыток: ' + (MAX_ATTEMPTS - n) + '. На третьей задача');
  console.error('отложится сама, и это нормально — крутиться в круге хуже.');
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

// Причудливые формы. Место, где проект дважды обжигался: R25 закрылась с семью
// одинаковыми формами на листе, R26 — с восемью, различавшимися только углом. Гейт
// мерит два свойства: форма читается ОДНИМ предметом и ни одна пара не близнецы.
// Самопроверка: node tools/strange-check.mjs --self
if (fs.existsSync('src/world/shapeStrange.js')) {
  const r = run('node tools/strange-check.mjs');
  if (!r.ok) refuse('причудливые формы не проходят проверку', r.out);
  console.log('причудливые формы в порядке: каждая цельная, близнецов нет');
}

// Локации. Один гейт на восемь видов; у каждого своё свойство, без которого локация
// не она — замкнутость зала, навершия башен, убывание арок, соосность колец.
// Самопроверка: node tools/location-check.mjs --self
if (fs.existsSync('src/world/locations')) {
  const r = run('node tools/location-check.mjs');
  if (!r.ok) refuse('локации не проходят проверку', r.out);
  console.log('локации в порядке: стоят на полу, проход свободен, вариации от сида');
}

// Членение мира на зоны: одна локация выходит из другой. Гейт мерит распределение
// по 400 сидам — иначе «одиночных миров должно быть меньше» остаётся пожеланием,
// которое никто не проверит. Самопроверка: node tools/zones-check.mjs --self
if (fs.existsSync('src/world/zones.js')) {
  const r = run('node tools/zones-check.mjs');
  if (!r.ok) refuse('членение мира на зоны не проходит проверку', r.out);
  console.log('зоны в порядке: не налезают, стыки на месте, распределение по сидам держится');
}

// Осязаемость. Провалиться тут можно тремя способами, и два хуже отсутствия
// столкновений: камера колом у стены и угол-ловушка. Самопроверка:
// node tools/collide-check.mjs --self
if (fs.existsSync('src/player/collide.js')) {
  const r = run('node tools/collide-check.mjs');
  if (!r.ok) refuse('осязаемость не проходит проверку', r.out);
  console.log('осязаемость в порядке: стена держит, вдоль скользит, из угла есть выход');
}

// Зал со сферой — срез по кадру референса. Гейт мерит геометрию: замкнутость,
// зеркальность аркад, сферу на оси и на виду, шахматный пол, свободный неф.
// Самопроверка: node tools/hall-check.mjs --self
if (fs.existsSync('src/world/halls.js')) {
  const r = run('node tools/hall-check.mjs');
  if (!r.ok) refuse('зал не проходит проверку', r.out);
  console.log('зал в порядке: замкнут, симметричен, сфера на оси и на виду');
}

// Грамматика сборки: как элементы складываются в постройку. Проверка «правило вернуло
// семь мест» её не стережёт — её проходит расстановка, разбросавшая копии по всему миру.
// Самопроверка: node tools/grammar-check.mjs --self
if (fs.existsSync('src/world/grammar.js')) {
  const r = run('node tools/grammar-check.mjs');
  if (!r.ok) refuse('грамматика сборки не проходит проверку', r.out);
  console.log('грамматика в порядке: постройка читается одной, правила различимы');
}

// Язык мира: стилистика, которой подчиняется весь город. Проверка вида «модуль есть»
// его не стережёт: её проходит модуль, который берёт все восемь форм и все пять групп
// глифов, то есть не ограничивает ничего, и миры на нём выйдут одинаковой кашей.
// Самопроверка: node tools/language-check.mjs --self
if (fs.existsSync('src/world/language.js')) {
  const r = run('node tools/language-check.mjs');
  if (!r.ok) refuse('язык мира не проходит проверку', r.out);
  console.log('язык мира в порядке: ограничивает, разный по сидам, вариации при своих формах');
}

// Признак 27: символы лежат НА поверхностях. Проверка вида «модуль есть и экспортирует
// две функции» его не стережёт — её проходит модуль, который сыплет точки в объём,
// заливает знаки и делает все девять родов одинаковыми. Гейт мерит свойства результата
// и сам проверен на эталоне и шести порчах: node tools/surface-check.mjs --self
if (fs.existsSync('src/world/surface.js')) {
  const r = run('node tools/surface-check.mjs');
  if (!r.ok) refuse('поверхности не проходят проверку', r.out);
  console.log('поверхности в порядке: знаки на грани, обводки пустые, масштабы разные');
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

// Задача закрылась — счётчик отказов обнуляем, чтобы он не догонял следующую правку.
{
  const a = readAttempts();
  if (a[id]) { a[id] = 0; writeAttempts(a); }
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
if (fs.existsSync('.planning/shots/' + id.toLowerCase() + '.png')) {
  console.log('Скриншот этой сессии: .planning/shots/' + id.toLowerCase() + '.png');
  console.log('');
}
console.log('#'.repeat(78));

// Промт следующей сессии печатается здесь, а не по просьбе человека и не по памяти
// модели. Раньше он выходил только из session-health и только когда сессия распухла:
// человек говорил «принято», задача закрывалась — и промта не было, потому что
// напечатать его было нечему. Теперь закрытие задачи и есть конец сессии, и промт
// выходит вместе с ней. Текст берётся дословно из .planning/START.md: огрызок из
// двух строк уже приводил к сессии без заслонки приёмки глазами и без запрета на
// git reset.
{
  const START = '.planning/START.md';
  console.log('');
  console.log('#'.repeat(78));
  console.log('СЕССИЯ ЗАКОНЧЕНА: задача ' + id + ' закрыта.');
  console.log('Одна закрытая задача — одна сессия. Следующую задачу в этой сессии');
  console.log('не бери. Человек копирует всё, что ниже, в новую сессию целиком.');
  console.log('#'.repeat(78));
  console.log('');
  if (!fs.existsSync(START)) {
    console.log('промт лежит в ' + START + ', но файла нет — скажи об этом человеку');
  } else {
    const text = fs.readFileSync(START, 'utf8');
    const i = text.indexOf(String.fromCharCode(10) + '---' + String.fromCharCode(10));
    console.log((i < 0 ? text : text.slice(i + 5)).trim());
  }
  console.log('');
  console.log('#'.repeat(78));
}
