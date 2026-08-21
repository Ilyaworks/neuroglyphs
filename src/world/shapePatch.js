// Заплатка каталога форм.
//
// Всё, что экспортируется отсюда в PATCH, ПОДМЕНЯЕТ одноимённую форму в
// shapeCatalog.js, а новые имена просто добавляются к каталогу. Так переделка форм
// не требует правок в большом файле: этот файл можно перезаписывать целиком.
//
// Требования к каждой форме:
//   - чистая функция (i, p, out): пишет out[0], out[1], out[2];
//   - никакого Math.random() и никаких импортов — только Math и функции этого файла;
//   - разброс только через локальный хеш h(i);
//   - никаких NaN и Infinity;
//   - из параметров только поля p, что уже используются в проекте:
//     radius, flatten, distPow, tubeR, arms, twist, spread, thickness, strands,
//     turns, clusterCount, clusterRadius, freq, amp, knotP, knotQ.
//
// Проверка: node tools/shape-check.mjs

// Детерминированный разброс: h(n) -> [0, 1)
export function h(n) {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0;
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}

export const PATCH = {};
