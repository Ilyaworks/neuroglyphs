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

// h2(n) -> [-1, 1)
function h2(n) {
  return h(n) * 2 - 1;
}

const TAU = Math.PI * 2;

// ---- пять переделанных форм ----

const tetraWire = (i, p, out) => {
  // Тетраэдр: каркас из 4 вершин и 6 рёбер, утолщённый и заполненный объёмом.
  const V = [
    [1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1],
  ];
  const E = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
  const e = i % 6;
  const t = Math.floor(i / 6) / Math.max(1, Math.floor(2000 / 6));
  const A = V[E[e][0]], B = V[E[e][1]];
  const s = p.radius * 0.6;
  const inset = 0.4 + 0.6 * h(i + 201);
  out[0] = (A[0] + (B[0] - A[0]) * t) * s * inset + h2(i + 202) * p.radius * 0.4;
  out[1] = (A[1] + (B[1] - A[1]) * t) * s * p.flatten * inset + h2(i + 203) * p.radius * 0.4;
  out[2] = (A[2] + (B[2] - A[2]) * t) * s * inset + h2(i + 204) * p.radius * 0.4;
};

const cubeLattice = (i, p, out) => {
  // Куб-решётка: точки в узлах куба, разбросанные по объёму ячеек.
  const n = 4;
  const idx = i % (n * n * n);
  const x = idx % n, y = Math.floor(idx / n) % n, z = Math.floor(idx / (n * n)) % n;
  const s = p.radius * 0.8 / n;
  out[0] = (x - (n - 1) / 2) * s * 2 + h2(i + 211) * s * 1.6;
  out[1] = (y - (n - 1) / 2) * s * 2 * p.flatten + h2(i + 212) * s * 1.6;
  out[2] = (z - (n - 1) / 2) * s * 2 + h2(i + 213) * s * 1.6;
};

const octaFrame = (i, p, out) => {
  // Октаэдр: каркас из 6 вершин и 12 рёбер, утолщённый и заполненный.
  const V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const E = [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5]];
  const e = i % 12;
  const t = Math.floor(i / 12) / Math.max(1, Math.floor(2000 / 12));
  const A = V[E[e][0]], B = V[E[e][1]];
  const s = p.radius * 0.7;
  const inset = 0.4 + 0.6 * h(i + 231);
  out[0] = (A[0] + (B[0] - A[0]) * t) * s * inset + h2(i + 232) * p.radius * 0.15;
  out[1] = (A[1] + (B[1] - A[1]) * t) * s * p.flatten * inset + h2(i + 233) * p.radius * 0.15;
  out[2] = (A[2] + (B[2] - A[2]) * t) * s * inset + h2(i + 234) * p.radius * 0.15;
};

const icoLattice = (i, p, out) => {
  // Икосаэдр: каркас из 12 вершин и 30 рёбер, утолщённый и заполненный.
  const t = (1 + Math.sqrt(5)) / 2;
  const raw = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const s0 = 1 / Math.sqrt(1 + t * t);
  const V = raw.map(v => [v[0] * s0, v[1] * s0, v[2] * s0]);
  const E = (() => {
    const d = 2 / Math.sqrt(1 + t * t);
    const edges = [];
    for (let a = 0; a < 12; a++) {
      for (let b = a + 1; b < 12; b++) {
        const dx = V[a][0] - V[b][0];
        const dy = V[a][1] - V[b][1];
        const dz = V[a][2] - V[b][2];
        if (Math.abs(Math.sqrt(dx * dx + dy * dy + dz * dz) - d) < 1e-6) edges.push([a, b]);
      }
    }
    return edges;
  })();
  const e = i % 30;
  const tt = Math.floor(i / 30) / Math.max(1, Math.floor(2000 / 30));
  const A = V[E[e][0]], B = V[E[e][1]];
  const s = p.radius * 0.7;
  const inset = 0.4 + 0.6 * h(i + 251);
  out[0] = (A[0] + (B[0] - A[0]) * tt) * s * inset + h2(i + 252) * p.radius * 0.15;
  out[1] = (A[1] + (B[1] - A[1]) * tt) * s * p.flatten * inset + h2(i + 253) * p.radius * 0.15;
  out[2] = (A[2] + (B[2] - A[2]) * tt) * s * inset + h2(i + 254) * p.radius * 0.15;
};

const logSpiral = (i, p, out) => {
  // Логарифмическая спираль: рукав, расширяющийся от центра, по нескольким слоям.
  const t = i / 6000;
  const r = p.radius * Math.pow(t, 0.7);
  const a = t * TAU * p.turns * p.arms * 0.5 + p.twist + (h(i + 281) - 0.5) * 0.6;
  out[0] = r * Math.cos(a) + h2(i + 282) * p.radius * 0.12;
  out[1] = h2(i + 283) * p.radius * 0.12;
  out[2] = r * Math.sin(a) * p.flatten + h2(i + 284) * p.radius * 0.12;
};

// ---- четыре новые формы: семейство «ядро + кольцо» ----
// Плотное светило-ядро с лучами в центре, вокруг — отдельное кольцо,
// между ними провал. Дископодобные, чтобы набрать объём.

const stellarCorona = (i, p, out) => {
  // Протуберанцы: плотное ядро-звезда с лучами короны, вокруг — отдельное кольцо.
  const u = h(i);
  if (u < 0.4) {
    const ang = h(i + 301) * TAU;
    const lobe = 0.7 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(p.arms * ang + p.twist), 1.5);
    const rr = p.radius * 0.28 * Math.pow(h(i + 302), 1 / 3) * lobe;
    out[0] = rr * Math.cos(ang) + h2(i + 303) * p.tubeR * 0.1;
    out[1] = rr * Math.sin(ang) * 0.18 + h2(i + 304) * p.tubeR * 0.1;
    out[2] = (h(i + 305) - 0.5) * p.tubeR * 1.2;
  } else {
    const ang = h(i + 311) * TAU;
    const R = p.radius * (0.62 + 0.36 * h(i + 312));
    out[0] = R * Math.cos(ang) + h2(i + 313) * p.tubeR * 0.05;
    out[1] = R * Math.sin(ang) * 0.18 + h2(i + 314) * p.tubeR * 0.05;
    out[2] = (h(i + 315) - 0.5) * p.tubeR * 2.0;
  }
};

const accretionHalo = (i, p, out) => {
  // Аккреционный диск: ядро с лучами, провал, затем широкий диск-кольцо.
  const u = h(i);
  if (u < 0.4) {
    const ang = h(i + 321) * TAU;
    const lobe = 0.7 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(p.arms * ang + p.twist + 1), 1.5);
    const rr = p.radius * 0.28 * Math.pow(h(i + 322), 1 / 3) * lobe;
    out[0] = rr * Math.cos(ang) + h2(i + 323) * p.tubeR * 0.1;
    out[1] = rr * Math.sin(ang) * 0.18 + h2(i + 324) * p.tubeR * 0.1;
    out[2] = (h(i + 325) - 0.5) * p.tubeR * 1.2;
  } else {
    const ang = h(i + 331) * TAU;
    const R = p.radius * (0.62 + 0.36 * h(i + 332));
    out[0] = R * Math.cos(ang) + h2(i + 333) * p.tubeR * 0.05;
    out[1] = R * Math.sin(ang) * 0.18 + h2(i + 334) * p.tubeR * 0.05;
    out[2] = (h(i + 335) - 0.5) * p.tubeR * 2.0;
  }
};

const ringedStar = (i, p, out) => {
  // Кольца Сатурна: ядро-звезда с лучами, явная щель, кольцо с разрывом.
  const u = h(i);
  if (u < 0.45) {
    const ang = h(i + 341) * TAU;
    const lobe = 0.7 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(p.arms * ang + p.twist + 2), 1.5);
    const rr = p.radius * 0.3 * Math.pow(h(i + 342), 1 / 3) * lobe;
    out[0] = rr * Math.cos(ang) + h2(i + 343) * p.tubeR * 0.1;
    out[1] = rr * Math.sin(ang) * 0.18 + h2(i + 344) * p.tubeR * 0.1;
    out[2] = (h(i + 345) - 0.5) * p.tubeR * 1.6;
  } else {
    const ang = h(i + 351) * TAU;
    const R = p.radius * (0.62 + 0.36 * h(i + 352));
    out[0] = R * Math.cos(ang) + h2(i + 353) * p.tubeR * 0.05;
    out[1] = R * Math.sin(ang) * 0.18 + h2(i + 354) * p.tubeR * 0.05;
    out[2] = (h(i + 355) - 0.5) * p.tubeR * 2.4;
  }
};

const globularBloom = (i, p, out) => {
  // Шаровое скопление: плотное ядро с лучами, разреженный переход, внешняя оболочка.
  const u = h(i);
  if (u < 0.4) {
    const ang = h(i + 361) * TAU;
    const lobe = 0.7 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(p.arms * ang + p.twist + 3), 1.5);
    const rr = p.radius * 0.28 * Math.pow(h(i + 362), 1 / 3) * lobe;
    out[0] = rr * Math.cos(ang) + h2(i + 363) * p.tubeR * 0.1;
    out[1] = rr * Math.sin(ang) * 0.18 + h2(i + 364) * p.tubeR * 0.1;
    out[2] = (h(i + 365) - 0.5) * p.tubeR * 1.2;
  } else {
    const ang = h(i + 371) * TAU;
    const R = p.radius * (0.62 + 0.36 * h(i + 372));
    out[0] = R * Math.cos(ang) + h2(i + 373) * p.tubeR * 0.05;
    out[1] = R * Math.sin(ang) * 0.18 + h2(i + 374) * p.tubeR * 0.05;
    out[2] = (h(i + 375) - 0.5) * p.tubeR * 2.0;
  }
};

export const PATCH = {
  tetraWire,
  cubeLattice,
  octaFrame,
  icoLattice,
  logSpiral,
  stellarCorona,
  accretionHalo,
  ringedStar,
  globularBloom,
};
