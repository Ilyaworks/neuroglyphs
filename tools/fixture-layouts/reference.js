// ЭТАЛОН ДЛЯ ПРОВЕРКИ ИНСТРУМЕНТА, НЕ ИГРОВОЙ КОД.
//
// tools/layout-check.mjs требует, чтобы раскладка умела выдать примерно столько точек,
// сколько попросили в params.target. Инструмент, который не проходит ни на чём, ничего
// не проверяет — вот раскладка, на которой он обязан быть зелёным.
//
// Из src/ не импортируется и импортироваться не должна.
export function layoutReferenceGrid(rng, params = {}) {
  const target = params.target ?? 20000;
  // extent — радиус заполняемого объёма, то есть максимальное удаление точки от центра.
  // Сторона куба вдвое больше. Договорённость общая для всех раскладок.
  const extent = params.extent ?? 400;
  const occupancy = params.occupancy ?? 0.22;
  // Сколько ячеек нужно, чтобы при данной занятости выйти на target.
  const grid = Math.max(4, Math.round(Math.cbrt(target / occupancy)) - 1);
  const spacing = (extent * 2) / grid;
  const xs = [];
  for (let x = 0; x <= grid; x++) {
    for (let y = 0; y <= grid; y++) {
      for (let z = 0; z <= grid; z++) {
        if (rng() < occupancy) {
          xs.push(
            (x - grid / 2) * spacing + (rng() * 2 - 1) * spacing * 0.08,
            (y - grid / 2) * spacing + (rng() * 2 - 1) * spacing * 0.08,
            (z - grid / 2) * spacing + (rng() * 2 - 1) * spacing * 0.08,
            2 + rng() * 2,
          );
        }
      }
    }
  }
  const count = xs.length / 4;
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = xs[i * 4];
    positions[i * 3 + 1] = xs[i * 4 + 1];
    positions[i * 3 + 2] = xs[i * 4 + 2];
    scales[i] = xs[i * 4 + 3];
  }
  return { positions, scales, count };
}
