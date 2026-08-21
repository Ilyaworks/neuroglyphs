// Единая сводка состояния проекта: факты с диска, а не пересказ документов.
// Запуск: node tools/project-status.mjs
//
// Зачем: у любой сессии (человек, Claude, локальная модель) должен быть один
// способ узнать, что в проекте реально есть, не читая тысячи строк кода.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const line = (k, v) => console.log(k.padEnd(26) + ': ' + v);
const exists = p => fs.existsSync(p);
const sh = c => { try { return execSync(c, { encoding: 'utf8' }).trim(); } catch { return '?'; } };

console.log('=== NEUROGLYPHS: состояние ===');
line('коммит', sh('git log --oneline -1'));
const dirty = sh('git status --short');
line('незакоммичено', dirty ? dirty.split('\n').length + ' файлов' : 'нет, дерево чистое');
line('ветка', sh('git branch --show-current'));

console.log('\n--- формы ---');
const all = await import('../src/world/allShapes.js');
const cat = await import('../src/world/shapeCatalog.js');
const legacy = await import('../src/world/legacyShapes.js');
const field = await import('../src/world/fieldShapes.js');
line('всего форм', all.ALL_SHAPE_KEYS.length);
line('  из них старых', Object.keys(legacy.LEGACY_SHAPES).length);
line('  из них новых', cat.SHAPE_KEYS.length);
line('в мире после отбора', field.FIELD_SHAPE_KEYS.length);
line('отсеяно', all.ALL_SHAPE_KEYS.length - field.FIELD_SHAPE_KEYS.length + ' (нити, оболочки, дубли)');
line('проверка нового каталога', sh('node tools/shape-check.mjs > NUL 2>&1 && echo зелёная || echo ЕСТЬ ОТКАЗЫ'));

console.log('\n--- задачи T03 (генератор мира) ---');
for (const f of ['src/world/structures.js', 'src/world/generator.js', 'test/world.test.mjs']) {
  line(f, exists(f) ? 'есть' : 'НЕТ');
}

console.log('\n--- сцена ---');
const main = fs.readFileSync('src/main.js', 'utf8');
line('строк в main.js', main.split('\n').length);
line('каталог подключён', main.includes('shapeCatalog.js') ? 'да' : 'НЕТ, старый инлайновый список');
line('механика токенов v1', /CONTEXT_MAX|s-tokens/.test(main) ? 'ЕЩЁ ЖИВА' : 'удалена');
line('ядро и кольцо', main.includes('buildNeuralCore') && main.includes('buildContextRing') ? 'на месте' : 'ОТСУТСТВУЮТ');

console.log('\n--- бэклог ---');
const backlog = fs.readFileSync('.planning/BACKLOG.md', 'utf8');
for (const m of backlog.matchAll(/^\|\s*(T\d\d)\s*\|([^|]+)\|\s*(\w+)\s*\|/gm)) {
  console.log('  ' + m[1] + '  ' + m[3].padEnd(6) + m[2].trim().slice(0, 46));
}

console.log('\n--- страницы (нужен запущенный npm run dev) ---');
console.log('  http://localhost:5173/                       мир');
console.log('  http://localhost:5173/seeds.html             по одному сиду на каждую форму мира');
console.log('  http://localhost:5173/src/world/preview.html все формы каталога');
