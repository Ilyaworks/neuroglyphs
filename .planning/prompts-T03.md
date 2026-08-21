# Ready-to-paste prompts for T03 (small steps, weak local model)

Rules: one prompt = one Cline task (New Task each time). Run them in order.
Do not merge two prompts into one session.

---

## P0 — fix the shadowed buildGlyphField in main.js (do this FIRST)

Project: C:\neuroglyphs

`src/main.js` has uncommitted work from a previous session (+394/-193 lines) and it is
currently broken at runtime. Facts, already verified — do not re-derive them:

- `function buildGlyphField(count, radius, atlas, opts = {})` is declared at line 99
  and returns `{ points, mat, count }`. This is the OLD version.
- `function buildGlyphField(atlas, opts = {})` is declared at line 308 and returns
  `{ points, mat, count, shapeKey }`. This is the NEW seed-driven version: the shape
  comes from `SHAPE_KEYS` / `SHAPES` / `pickShapeParams`, and its options are
  `count, sizeBase, scaleMin, scaleMax, driftAmp, driftSpeed, twinkleBase, twinkleAmp, twinkleSpeed`.
  It has NO `radius` option.
- Two function declarations with the same name in one module: the LATER one wins.
  So line 308 shadows line 99 and every call actually hits the new version.
- Both call sites still use the OLD signature:
  line ~498 `field = buildGlyphField(FIELD_COUNT, 80, atlas);`
  line ~507 `stars = buildGlyphField(STAR_COUNT, 250, atlas, { sizeBase: 18, ... });`
  So `atlas` currently receives the number 600000 and the page fails at boot.

Task:
1. Read ONLY `src/main.js`. Do not read other files.
2. Delete the OLD declaration (line 99, the one taking `count, radius, atlas`). Keep the
   seed-driven one at line 308.
3. Update both call sites to the new signature: pass the atlas first and move `count`
   into the options object. Keep every other option value exactly as it is now.
4. The old `radius` arguments (80 and 250) have no equivalent in the new version. Do NOT
   invent a new option and do NOT change the new function's body. Drop them and say so in
   your report.
5. Do not touch anything else in the file: not the camera, controls, resize handler,
   render loop, `buildContextRing`, `buildNeuralCore`, or the header comment.

Verification — read this carefully:
- `npm test` does NOT cover `src/main.js` (it only tests `src/core/`), so a passing test
  run proves nothing here. Run it anyway to confirm you broke nothing: it must still
  print DETERMINISM_OK and SEED_OK.
- The real check: run `npm run dev`, open the printed URL, and confirm that the page does
  NOT show an `ERROR: ...` banner (that banner comes from the `fail()` function) and that
  the browser console is clean. Report exactly what you saw.
- If the page still errors, report the error text and STOP. Do not start guessing fixes
  in other files.

Then commit exactly this file:
`git add src/main.js && git commit -m "T02: keep seed-driven buildGlyphField, fix shadowed duplicate and its call sites"`

Constraints: do NOT start T03. Do NOT touch STATE.md or BACKLOG.md. One tool call per
message. STOP after the commit and report what you deleted, how you rewrote the two calls,
and what the page looked like.

---

## P1 — src/world/structures.js (новый файл, без интеграции)

Проект: C:\neuroglyphs
Задача: T03, шаг 1 из 4. Прочитай `.planning/tasks/T03-world-gen.md` ТОЛЬКО ради таблицы
типов структур. Весь репозиторий читать не нужно.

Создай ОДИН новый файл: `src/world/structures.js`.

Чистую математику отдели от Three.js, иначе тесты не смогут работать в Node:

- Экспортируй 8 ЧИСТЫХ функций раскладки, без импорта three и без DOM:
  `layoutFractalCorridors`, `layoutNonEuclidean`, `layoutCrystalline`,
  `layoutOrganic`, `layoutGeometric`, `layoutAlmostReal`, `layoutVoid`,
  `layoutCrossedWorlds`.
  Подпись: `(rng, params) -> { positions: Float32Array, scales: Float32Array, count: number }`,
  где `positions` — тройки xyz. `rng` — это функция, которую возвращает `decodeSeed`.
- Три из них реализуй по-настоящему: `layoutFractalCorridors`, `layoutCrystalline`,
  `layoutVoid`. Остальные пять — простые детерминированные вариации, заглушки допустимы.
- Дополнительно экспортируй `LAYOUTS` — массив из 8 функций в порядке ID из таблицы
  (0 — фрактальные коридоры, ..., 7 — скрещённые миры).

Жёсткие требования:
- Никакого `Math.random()`, только переданный `rng`.
- Не импортируй three, не импортируй ничего из `src/core/`, не трогай другие файлы.
- Один и тот же rng обязан давать побайтово одинаковые Float32Array.

Проверка: `node -e "import('./src/world/structures.js').then(m=>console.log(Object.keys(m).length))"`
должно напечатать 9. После этого STOP и перечисли, что именно экспортировал.

---

## P2 — src/world/generator.js (новый файл, без интеграции)

Проект: C:\neuroglyphs
Задача: T03, шаг 2 из 4. Перед тем как писать, прочитай ТОЛЬКО `src/world/structures.js`,
`src/core/seed.js` и `src/core/glyphTexture.js`. Больше ничего.

Создай ОДИН новый файл: `src/world/generator.js`. Он экспортирует ровно три функции:

```js
export function generateWorld(decodedSeed, scene) // -> WorldGroup (THREE.Group)
export function disposeWorld(worldGroup)          // -> void
export function getExitPosition(worldGroup)       // -> THREE.Vector3
```

`generateWorld` обязана:
- выбрать раскладку через `LAYOUTS[decodedSeed.structure]` из `./structures.js`;
- собрать ОДИН объект `THREE.Points` из полученных Float32Array, используя атлас
  из `buildGlyphAtlas()` (импорт из `../core/glyphTexture.js`);
- добавить поле частиц, количество которых берётся из `decodedSeed.density`;
- задать `scene.fog` по `decodedSeed.palette`;
- добавить ровно ОДИН прямоугольный портал выхода (4 глифовых перекладины) и записать
  его позицию в группу как `group.userData.exitPosition`;
- вернуть группу и не добавлять в `scene` ничего, кроме этой группы.

`disposeWorld` обязана освобождать созданные ею геометрии и материалы.

Жёсткие требования: никакого `Math.random()`; не менять `src/main.js` и любые другие
существующие файлы; импорты разрешены только из `three`, `./structures.js`,
`../core/glyphTexture.js`, `../core/glyphs.js`.

Проверка: `node --check src/world/generator.js`. Затем STOP и перечисли экспорты файла.

---

## P3 — test/world.test.mjs

Проект: C:\neuroglyphs
Задача: T03, шаг 3 из 4. Прочитай ТОЛЬКО `src/world/structures.js`, `test/seed.test.mjs`
(ради стиля существующих тестов) и `package.json`.

Создай `test/world.test.mjs` в том же стиле, что уже есть: обычный node, без тестового
фреймворка, `process.exit(1)` при провале, в конце печатает `WORLD_OK`.

Импортировать можно ТОЛЬКО `src/world/structures.js` и `src/core/seed.js` — никогда
`three`, потому что в Node нет import map. Проверки:
1. Один и тот же сид даёт идентичные `positions` (сравнить поэлементно) для всех 8 раскладок.
2. Разные сиды дают разные `positions` для трёх по-настоящему реализованных раскладок.
3. Все 8 раскладок возвращают `count > 0` и `positions.length === count * 3`.
4. Ни в одной раскладке нет NaN.

Затем добавь файл в скрипт `test` в `package.json`, после двух существующих, и запусти
`npm test`. Должны пройти все три: DETERMINISM_OK, SEED_OK, WORLD_OK.

Ничего под `src/` не менять. Если тест падает из-за неверной раскладки — сообщи о падении
и STOP, не «исправляй» это ослаблением теста.

---

## P4 — интеграция в main.js + бухгалтерия

Проект: C:\neuroglyphs
Задача: T03, шаг 4 из 4. Прочитай ТОЛЬКО `src/main.js` и `src/world/generator.js`.

1. В `src/main.js` замени построение статического глифового поля вызовом
   `generateWorld(seed, scene)` из `./world/generator.js`. Камеру, controls, обработчик
   resize и цикл анимации оставь как есть.
   **Ядро и кольцо не удалять.** `buildNeuralCore` (плотный шар глифов в центре) и
   `buildContextRing` (кольцо из 6400 глифов, вращается в обратную сторону) — это
   художественный элемент, который заказчику нравится: звезда в середине и кольцо вокруг.
   Убрать только смысловую обвязку старой концепции: накопление `tokens` в цикле анимации,
   строки TOKENS и CONTEXT в HUD (`index.html`), полосу заполнения и «сбор токенов» по
   пробелу. Сами функции оставить; `buildContextRing` можно переименовать в `buildOrbitRing`.
   Из комментария-шапки файла убрать упоминания токенов, контекстного окна и inference.
2. Запусти `npm test` — должны напечататься DETERMINISM_OK, SEED_OK, WORLD_OK.
3. Запусти `npm run dev`, открой http://localhost:5173/?seed=abc123 и убедись, что в
   консоли браузера нет ошибок, а на странице нет баннера `ERROR:`. Опиши, что увидел.
4. Бухгалтерия, в этом порядке: отметь T03 как done в `.planning/tasks/T03-world-gen.md`
   и в `.planning/BACKLOG.md`; добавь строку в журнал сессий и обнови «Current Task»
   в `.planning/STATE.md` (следующая — T04).
5. Коммит: `git add -A && git commit -m "T03: add world generator with 8 structure layouts, exit portal and determinism tests"`

После коммита STOP. T04 не начинать.

---

## S1 — каталог разнообразных форм (новый файл)

Проект: C:\neuroglyphs

Сейчас архетипы формы глифового поля лежат прямо в `src/main.js` в объекте `SHAPES`:
169 функций, из них 88 — вариации тора (`torusWave2…10`, `torusRipple2…9`,
`torusSpiral2…10`, `torusFlower`, `torusCrown`, `torusLattice`, `torusRing`,
`torusBraid`, `torusPulse`). Побайтово они разные, но глазами почти неотличимы.
Нужен компактный каталог, где каждая форма визуально своя.

**НЕ читай `src/main.js`** — он на 2072 строки и не влезет в контекст. Всё, что нужно
знать о старом коде, изложено ниже. Интеграцию в `main.js` сделает человек после тебя.
Это не то же самое, что `src/world/structures.js` из T03: там 8 типов структуры мира,
а здесь — архетипы облака точек для глифового поля.

Создай ОДИН новый файл: `src/world/shapeCatalog.js`.

### Контракт

```js
// каждая форма: (i, p, out) -> записывает out[0], out[1], out[2]
export const SHAPES = { имяФормы(i, p, out) { ... }, ... };
export const SHAPE_KEYS = Object.keys(SHAPES);
```

- `i` — индекс точки, целое от 0 до count-1.
- `p` — параметры, ровно эти 16 полей и никаких других:
  `radius, flatten, distPow, tubeR, arms, twist, spread, thickness, strands, turns,
  clusterCount, clusterRadius, freq, amp, knotP, knotQ`.
- `out` — массив из 3 чисел, куда пишутся x, y, z.

### Жёсткие требования

1. **Никакого `Math.random()` и никакого внешнего `rng`.** Формы должны быть чистыми
   функциями от `(i, p)`. Если форме нужен разброс — выведи его из `i` через локальную
   хеш-функцию в этом же файле, например:
   ```js
   function h(n) { let x = (n ^ 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0; return ((x ^ (x >>> 13)) >>> 0) / 4294967296; }
   ```
2. Никаких импортов вообще. Ни `three`, ни `src/core/`. Только `Math` и функции этого файла.
3. Никаких NaN и Infinity ни при каком `i` от 0 до 2000.
4. **Ровно 32 формы: 8 семейств по 4 формы.** Семейства и обязательный состав:
   - `фракталы и хаос` — мандельброт/жюлиа-подобные оболочки, аттракторы Лоренца и Рёсслера;
   - `спирали и винты` — логарифмическая спираль, двойной винт, галактика с рукавами, вихрь;
   - `многогранники` — тетраэдр, октаэдр, икосаэдр, геодезическая сфера;
   - `космос` — туманность, чёрная дыра с диском, комета с хвостом, пульсар;
   - `рельеф` — горный хребет, каньон, дюны, кристаллические выступы;
   - `архитектура` — колоннада, купол, арочный мост, ступенчатая башня;
   - `поверхности` — гиперболический параболоид, лента Мёбиуса, бутылка Клейна, волновая мембрана;
   - `решётки` — куб-решётка с пустотами, гексагональная сетка, вороной-подобные ячейки, слоистые пластины.
5. **Тор допустим ровно ОДИН раз**, и только если он реально нужен как представитель
   семейства. Никаких `torusWave2`, `torusRipple3` и прочих нумерованных вариаций.
6. Каждую форму снабди коротким комментарием на русском: одна строка, что видно глазом.
7. Формы должны заметно использовать `p` — иначе все миры с разными сидами будут
   выглядеть одинаково. Как минимум `radius` и ещё один параметр в каждой форме.

### Проверка

Запусти это и приведи вывод целиком:

```
node -e "import('./src/world/shapeCatalog.js').then(m=>{const p={radius:60,flatten:0.8,distPow:0.8,tubeR:10,arms:4,twist:4,spread:0.6,thickness:8,strands:3,turns:4,clusterCount:6,clusterRadius:12,freq:0.3,amp:8,knotP:3,knotQ:4};const o=[0,0,0];let bad=[];for(const k of m.SHAPE_KEYS){for(let i=0;i<2000;i++){o[0]=o[1]=o[2]=0;try{m.SHAPES[k](i,p,o)}catch(e){bad.push(k+':'+e.message);break}if(!o.every(Number.isFinite)){bad.push(k+':NaN at '+i);break}}}console.log('форм:',m.SHAPE_KEYS.length,'битых:',bad.length,bad.slice(0,5))})"
```

Должно напечатать `форм: 32 битых: 0 []`. Если нет — исправляй, пока не станет так.

`main.js` не трогать. `package.json` не трогать. Других файлов не создавать.
После успешной проверки STOP и перечисли 32 имени по семействам.

---

## S2 — тест разнообразия форм

Проект: C:\neuroglyphs

Каталог `src/world/shapeCatalog.js` готов. Теперь нужен тест, который доказывает, что
формы действительно разные, а не переписанные друг из друга.

Прочитай ТОЛЬКО `src/world/shapeCatalog.js` и `test/seed.test.mjs` (ради стиля тестов).

Создай `test/shapes.test.mjs` — обычный node, без фреймворков, без импорта `three`.

### Как считать отпечаток формы

Для каждой формы прогони `i` от 0 до 4000 с фиксированными параметрами
`{radius:60, flatten:0.8, distPow:0.8, tubeR:10, arms:4, twist:4, spread:0.6, thickness:8,
strands:3, turns:4, clusterCount:6, clusterRadius:12, freq:0.3, amp:8, knotP:3, knotQ:4}`
и построй три гистограммы, каждая нормированная так, чтобы сумма долей равнялась 1:

1. расстояние от центра `sqrt(x²+y²+z²)`, поделённое на максимум по этой форме — 20 корзин от 0 до 1;
2. угол `Math.atan2(y, x)` — 16 корзин от -π до π;
3. `z`, приведённое к диапазону 0…1 по минимуму и максимуму этой формы — 16 корзин.

Отпечаток — массив из 52 долей.

### Проверки

1. Расстояние между отпечатками двух форм — сумма модулей разностей по всем 52 корзинам
   (L1). Для КАЖДОЙ пары форм расстояние должно быть больше **0.35**.
2. Ни одна форма не даёт NaN, Infinity или все точки в одной позиции
   (максимальное расстояние от центра больше 1).
3. В конце печатай `SHAPES_OK`, а при провале — `process.exit(1)`.
4. Вне зависимости от результата печатай пять САМЫХ ПОХОЖИХ пар с их расстояниями,
   в формате `имя1 ~ имя2 = 0.28`. Это нужно человеку для оценки, а не тесту.

Добавь тест в скрипт `test` в `package.json`, после существующих. Запусти `npm test`.

Если какая-то пара не проходит порог 0.35 — **не ослабляй порог и не удаляй проверку**.
Сообщи, какие пары слишком похожи, и STOP: переделывать формы будем отдельной задачей.

---

## S3 — убрать «нити в пустоте» и добавить семейство «ядро + кольцо»

Проект: C:\neuroglyphs

В каталоге `src/world/shapeCatalog.js` 40 форм. Проверка `node tools/shape-check.mjs`
показывает 9 негодных. Инструмент считает по облаку из 6000 точек:

- **заполн** — доля занятых ячеек в сетке 16×16×16 по габаритам облака. Ниже 0.12 — это
  не форма, а нить или проволочный каркас: глифы летят тонкой струйкой, вокруг пустота.
- **пик** — доля точек в самой населённой из 20 радиальных корзин. Выше 0.45 — всё
  сбилось в одну тонкую оболочку, внутри и снаружи ничего.

Не проходят (причина в скобках):

```
tetraWire      (нить, заполн 0.036)     colonnadeRing  (нить, заполн 0.026)
cubeLattice    (нить, заполн 0.042)     octaFrame      (нить, заполн 0.090)
ziggurat       (нить, заполн 0.093)     icoLattice     (нить, заполн 0.108)
domeShell      (одна оболочка, пик 0.864)
archBridge     (одна оболочка, пик 0.460)
logSpiral      (одна оболочка, пик 0.517)
```

Прочитай ТОЛЬКО `src/world/shapeCatalog.js`. `main.js` не читать и не трогать — он на
2000 строк. Другие файлы не создавать.

### Часть 1 — переделать эти 9 форм

Имена сохранить, идею формы сохранить, но набрать объём. Приёмы, которые работают:

- каркас превращать в **толстую оболочку**: точку смещать от идеальной линии или грани
  на случайную (через `h(i)`) величину до 10–20% от радиуса, а не сидеть точно на ней;
- у решёток и каркасов заполнять не только рёбра, но и **пространство между ними** —
  часть точек внутрь ячеек, часть на рёбра;
- у оболочек (`domeShell`, `archBridge`) раздать точки **по нескольким радиусам**:
  вложенные слои разной плотности вместо одной поверхности;
- у `logSpiral` растянуть радиальное распределение: витки должны идти от центра до края,
  а не толпиться на одном радиусе.

### Часть 2 — добавить 4 формы семейства «ядро + кольцо»

Это то, что нравится заказчику: **в середине плотное светило с лучами, вокруг него
отдельное кольцо**, между ними явный зазор. Вдохновение — звёзды: протуберанцы и лучи
короны, аккреционный диск вокруг светила, кольца Сатурна с щелью Кассини, шаровое
скопление с уплотнением к центру, двойная звезда с общей оболочкой.

Требования к каждой из четырёх:

- доля точек ближе 0.25 максимального радиуса (**центр**) — не меньше 0.15;
- доля точек дальше 0.60 максимального радиуса (**кольцо**) — не меньше 0.25;
- заполненность — не меньше 0.15;
- между ядром и кольцом заметный провал плотности, а не плавная размазня;
- лучи или протуберанцы у ядра: направленные сгущения, а не ровный шар.

Инструмент сам скажет, попала форма в семейство: она появится в строке
`семейство ядро+кольцо`.

### Общие требования (как и при создании файла)

Чистые функции `(i, p, out)`, никакого `Math.random()` и внешнего `rng`, разброс только
через локальный `h(n)`, никаких NaN и Infinity, из параметров — только те 16 полей `p`,
что уже используются в файле. Каждой новой форме — строка комментария на русском.

### Проверка

```
node tools/shape-check.mjs
```

Должно быть `не проходят проверку : 0`, а в строке `семейство ядро+кольцо` — четыре твоих
новых имени. Пороги в инструменте **не менять** и проверку не ослаблять: если форма не
вытягивает, переделывай форму. Если после трёх попыток одна конкретная форма не идёт —
сообщи, какая, и STOP.

После зелёной проверки STOP и перечисли: что изменил в девяти старых формах (одной
строкой на каждую) и как называются четыре новых.

---

## Заметка: документы уже приведены в порядок (20.08.2026)

Формулировок мёртвой концепции v1, которые раньше сбивали агентов с курса, больше нет.
`CLAUDE.md` удалён (рабочий агент — Qwen через Cline, он читает `.clinerules`), а
`AGENTS.md`, `README.md`, `agent-prime.xml` и `e2e-scenarios.yaml` описывают только v2.
Долговременные правила, инварианты и копилка повторяющихся ошибок лежат в `.clinerules`.
Если где-то ещё попадётся формулировка из v1 — удаляй её, а не реализуй.

Последний остаток v1 живёт в коде, а не в документах: `buildContextRing` в `src/main.js`
(кольцо «контекстных токенов» в HUD) и формулировки в шапке этого файла. P4 убирает и то,
и другое вместе с интеграцией генератора мира.
