// Печатает промт следующей незакрытой задачи из .planning/ISSUES.md.
//
//   node tools/next-task.mjs          следующая задача со статусом todo
//   node tools/next-task.mjs N07      конкретная задача
//
// Статус берётся из .planning/BACKLOG.md. Дополнительная защита: если все файлы,
// которые задача должна создать, уже существуют, задача считается сделанной даже
// когда её забыли отметить.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const NL_SPLIT = new RegExp(String.fromCharCode(13) + "?" + String.fromCharCode(10));

const issues = fs.readFileSync('.planning/ISSUES.md', 'utf8').split(/\r?\n/);
const backlog = fs.readFileSync('.planning/BACKLOG.md', 'utf8');

const head = (() => {
  const a = issues.findIndex(l => l.startsWith('## Правила для исполнителя'));
  const b = issues.findIndex(l => l.startsWith('# Дорожная карта'));
  return issues.slice(a + 1, b).join('\n').trim();
})();

const tasks = [];
let epic = null, cur = null;
for (const line of issues) {
  const e = line.match(/^# (D\d) — (.+)$/);
  if (e) { epic = e[1]; continue; }
  const t = line.match(/^## ([NR]\d+) — (.+)$/);
  if (t) {
    if (cur) tasks.push(cur);
    // Правки по ревью лежат вне разделов демо-точек, поэтому epic у них нет.
    const isFix = t[1][0] === 'R';
    cur = { id: t[1], title: t[2], epic: isFix ? null : epic, fix: isFix, lines: [] };
    continue;
  }
  if (cur && line !== '---') cur.lines.push(line);
}
if (cur) tasks.push(cur);

function section(t, name) {
  const i = t.lines.findIndex(l => l.startsWith('**' + name + ':**'));
  if (i < 0) return '';
  const out = [t.lines[i].replace('**' + name + ':**', '').trim()];
  for (let j = i + 1; j < t.lines.length; j++) {
    const l = t.lines[j];
    if (!l.trim() || /^\*\*[А-Яа-яA-Za-z ]+:\*\*/.test(l)) break;
    out.push(l.trim());
  }
  return out.join(' ').trim();
}

function created(t) {
  const f = section(t, 'Файлы');
  const i = f.indexOf('создать');
  if (i < 0) return [];
  // Хвост режется на первом же слове «правка», а не только на «, правка»: N21 писала
  // «создать `...DEMO-D1.md`, при необходимости правка `src/player/flycam.js`», и живой
  // путь к существующему файлу попадал в список «созданных».
  const tail = f.slice(i).split(/правка/)[0];
  return [...tail.matchAll(/`([^`]+)`/g)].map(m => m[1])
    .filter(p => /\.(mjs|js|html|json|md)$/.test(p));
}

function substantial(p) {
  if (!fs.existsSync(p)) return false;
  if (!/[.](mjs|js)$/.test(p)) return true;
  const src = fs.readFileSync(p, 'utf8');
  const lines = src.split(NL_SPLIT).filter(l => l.trim()).length;
  return lines >= 15 && /export|function|class/.test(src);
}

function status(t) {
  for (const line of backlog.split(NL_SPLIT)) {
    const cells = line.split('|').map(x => x.trim());
    if (cells[1] === t.id) return cells[3] || null;
  }
  return null;
}

function done(t) {
  if (new RegExp('\\|\\s*' + t.id + '\\s*\\|[^|]*\\|\\s*done\\s*\\|').test(backlog)) return true;
  // Правка по ревью ничего не создаёт, поэтому эвристика «файл на месте» к ней
  // неприменима: судим только по статусу в BACKLOG. Статус later — принято, но
  // привязано к поздней демо-точке, сейчас не выдавать.
  if (t.fix) return status(t) !== 'todo';
  // BACKLOG — источник правды: его пишет finish-task, и только после гейтов. Эвристика
  // «файл на месте» остаётся лишь для задач, которых в BACKLOG нет вовсе. Дважды она
  // закрывала задачу молча: N02 засчиталась по файлу-заглушке, N21 — по живому пути,
  // попавшему в список создаваемых. Тихий пропуск задачи хуже лишнего прогона.
  const st = status(t);
  if (st) return st !== 'todo';
  const files = created(t);
  const guess = files.length > 0 && files.every(substantial);
  if (guess) {
    console.log('внимание: ' + t.id + ' считается сделанной по наличию файлов (' +
      files.join(', ') + '), строки в BACKLOG для неё нет');
  }
  return guess;
}

const skipChecks = process.argv.includes('--skip-checks');

function tryRun(cmd) {
  try {
    return { ok: true, out: execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || '') || e.message };
  }
}

function healthCheck() {
  const NL = String.fromCharCode(10);
  const pkg = fs.existsSync('package.json') ? JSON.parse(fs.readFileSync('package.json', 'utf8')) : {};
  const checks = [];
  if (pkg.scripts && pkg.scripts.test) checks.push(['npm test', 'npm test']);
  if (fs.existsSync('src/world/fieldGeometry.js')) {
    checks.push(['геометрия глифового поля', 'node tools/geometry-check.mjs']);
  }
  if (fs.existsSync('src/world/fieldMaterial.js')) {
    checks.push(['шейдер глифового поля', 'node tools/material-check.mjs']);
  }
  if (fs.existsSync('src/world/layouts')) {
    checks.push(['раскладки', 'node tools/layout-check.mjs']);
  }
  if (fs.existsSync('src/world/portal.js')) {
    checks.push(['портал выхода', 'node tools/portal-check.mjs']);
  }
  if (fs.existsSync('src/world/world.js')) {
    checks.push(['мир на экране', 'node tools/world-check.mjs']);
  }
  if (fs.existsSync('src/art/palettes.js')) {
    checks.push(['палитры настроений', 'node tools/palette-check.mjs']);
  }
  if (fs.existsSync('src/render/shaders.js')) {
    checks.push(['дисторсии', 'node tools/shaders-check.mjs']);
  }
  // Тот же порядок, что у post-check: гейт палитры в сцене входит в предстартовую проверку
  // только после того, как world.js начал звать resolvePalette. До N26 он остановил бы
  // саму задачу, которая его и закрывает.
  if (fs.existsSync('src/art/palettes.js') && fs.existsSync('src/world/world.js') &&
      /resolvePalette/.test(fs.readFileSync('src/world/world.js', 'utf8'))) {
    checks.push(['палитра в сцене', 'node tools/mood-check.mjs']);
  }
  // Предстартовая проверка стережёт от регресса, а не требует несделанного: до N24
  // в post.js нет ни одного ShaderPass, и включённый гейт остановил бы саму задачу,
  // которая его и закрывает.
  if (fs.existsSync('src/render/post.js') &&
      /ShaderPass/.test(fs.readFileSync('src/render/post.js', 'utf8'))) {
    checks.push(['связка постобработки', 'node tools/post-check.mjs']);
  }
  if (fs.existsSync('src/world/shapeCatalog.js')) {
    checks.push(['каталог не правили руками', 'node tools/catalog-untouched.mjs']);
  }
  if (fs.existsSync('src/world/shapeCatalog.js') && fs.existsSync('tools/shape-check.mjs')) {
    checks.push(['каталог форм', 'node tools/shape-check.mjs']);
  }
  if (fs.existsSync('src/world/shapeIllusions.js')) {
    checks.push(['новые формы', 'node tools/illusion-check.mjs']);
  }
  if (fs.existsSync('src/world/shapeField.js')) {
    checks.push(['слой форм', 'node tools/shapefield-check.mjs']);
  }
  if (fs.existsSync('src/render/floor.js')) {
    checks.push(['отражающий пол', 'node tools/floor-check.mjs']);
  }
  if (fs.existsSync('src/world/textField.js')) {
    checks.push(['поле надписей', 'node tools/textfield-check.mjs']);
  }
  if (fs.existsSync('src/world/world.js') &&
      /buildImpossible/.test(fs.readFileSync('src/world/world.js', 'utf8'))) {
    checks.push(['фигура в мире', 'node tools/figure-check.mjs']);
  }
  if (fs.existsSync('src/atmosphere/impossible.js')) {
    checks.push(['невозможные фигуры', 'node tools/impossible-check.mjs']);
  }
  if (fs.existsSync('src/player/flycam.js')) {
    checks.push(['полёт камеры', 'node tools/flycam-check.mjs']);
  }
  if (fs.existsSync('src/player/freeze.js')) {
    checks.push(['осмотр со стороны', 'node tools/freeze-check.mjs']);
  }
  if (fs.existsSync('.planning/DEMO-D1.md')) {
    checks.push(['собранная демонстрация', 'node tools/demo-check.mjs']);
  }
  if (fs.existsSync('server.mjs') && fs.existsSync('index.html')) {
    checks.push(['страница в браузере', 'node tools/browser-check.mjs --name health --wait 4']);
  }
  for (const [label, cmd] of checks) {
    const r = tryRun(cmd);
    if (!r.ok) {
      console.log('#'.repeat(78));
      console.log('НЕ НАЧИНАЙ НОВУЮ ЗАДАЧУ: проект сломан ещё до неё');
      console.log('#'.repeat(78));
      console.log('Провалилась проверка: ' + label);
      console.log('');
      console.log(r.out.trim().split(NL).slice(-20).join(NL));
      console.log('');
      console.log('Это значит, что поломку принесла одна из предыдущих задач.');
      console.log('Человеку: покажи этот вывод Клоду. Быстрый откат последней задачи —');
      console.log('  node tools/undo-task.mjs <ID последней закрытой задачи>');
      console.log('Модели: ничего не делай, напечатай STOP.');
      process.exit(2);
    }
    console.log('проверка перед стартом: ' + label + ' — в порядке');
  }
}

const want = process.argv.find(a => /^[NnRr]\d+$/.test(a));
const pendingFix = tasks.find(t => t.fix && !done(t));
const task = want
  ? tasks.find(t => t.id === want.toUpperCase())
  : pendingFix || tasks.find(t => t.epic && !done(t));

if (!task) {
  console.log(want ? 'задача ' + want + ' не найдена' : 'все задачи закрыты');
  process.exit(0);
}

// Предстартовая проверка после выбора задачи: если выдана правка по ревью, проект
// сломан осознанно и именно она это и лечит — иначе модель не закроет ни одной задачи
// и полезет править чужие файлы, чтобы пройти воротa на выходе.
if (!skipChecks && !task.fix) healthCheck();

const skipped = tasks.filter(t => t.epic && done(t)).length;
const total = tasks.filter(t => t.epic).length;

console.log('='.repeat(78));
console.log('ПРОМТ ДЛЯ НОВОЙ СЕССИИ — скопируй всё, что ниже разделителя');
console.log('прогресс: ' + skipped + ' из ' + total + ' задач закрыто, сейчас ' + task.id +
  (task.fix ? ' (правка по ревью — идёт вперёд плана)' : ' (демо-точка ' + task.epic + ')'));
console.log('='.repeat(78));
console.log('');
console.log('Проект: C:\\neuroglyphs');
console.log((task.fix ? 'Правка по ревью ' : 'Задача ') + task.id + ' — ' + task.title);
if (task.fix) {
  console.log('');
  console.log('Это правка, которую выдал проверяющий: он нашёл дефект в уже закрытой');
  console.log('задаче. Пока она не закрыта, следующую задачу N брать нельзя. Новых файлов');
  console.log('не создавать — правь ровно те, что перечислены ниже.');
}
console.log('');
console.log('Не составляй план. Первым действием создавай или правь файл.');
console.log('');
console.log(task.lines.join('\n').trim());
console.log('');
// Если человек уже смотрел на картинку и не принял — причина обязана приехать вместе
// с задачей, иначе модель начнёт со второй попытки то же самое.
try {
  const last = execSync('node tools/verdict.mjs ' + task.id + ' --last',
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (last) { console.log(last); console.log(''); }
} catch {}
console.log('## Правила');
console.log('');
console.log(head);
console.log('');
console.log('## Как закончить сессию');
console.log('');
console.log('1. Выполни команду проверки из этой задачи. Она должна дать указанный результат.');
console.log('   Не проходит — исправь файл и запусти снова, но не больше трёх попыток.');
console.log('2. Если после трёх попыток проверка так и не прошла — НЕ вызывай finish-task.');
console.log('   Напечатай ровно это и остановись:');
console.log('      ПРОВАЛ ' + task.id + '. Скопируй этот вывод Клоду, новую сессию не начинай.');
console.log('   Ниже приложи точный текст ошибки и список того, что уже создал.');
console.log('3. Если проверка прошла, выполни ровно это:');
console.log('      node tools/finish-task.mjs ' + task.id);
console.log('   Он сам отметит задачу, сделает коммит и напечатает инструкцию для человека.');
console.log('4. Напечатай STOP и короткий отчёт: какие файлы создал, что вывела проверка.');
console.log('');
console.log('Запрещено: менять пороги в тестах и инструментах, трогать файлы вне списка,');
console.log('начинать следующую задачу, править .planning/ISSUES.md и .planning/BACKLOG.md руками.');
