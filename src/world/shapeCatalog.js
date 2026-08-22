// Каталог архетипов формы глифового поля.
// Чистые функции от (i, p, out), без импортов и Math.random().

// Локальный хеш для детерминированного разброса: h(n) -> [0, 1)
import { PATCH } from './shapePatch.js';

function h(n) {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0;
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}

// Граничный хеш: h2(n) -> [-1, 1)
function h2(n) {
  return h(n) * 2 - 1;
}

const TAU = Math.PI * 2;

// ---- вспомогательные ----

// Точка на торе: угол u по большому кругу, v по трубе.
function torusPoint(u, v, R, r, out) {
  const cu = Math.cos(u);
  out[0] = (R + r * Math.cos(v)) * cu;
  out[1] = r * Math.sin(v);
  out[2] = (R + r * Math.cos(v)) * Math.sin(u);
}

// Вершины и рёбра икосаэдра (единичная сфера), 12 вершин, 30 рёбер.
const ICO_V = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const s = 1 / Math.sqrt(1 + t * t);
  return raw.map(v => [v[0] * s, v[1] * s, v[2] * s]);
})();
const ICO_E = (() => {
  const d = 2 / Math.sqrt(1 + ((1 + Math.sqrt(5)) / 2) ** 2);
  const edges = [];
  for (let a = 0; a < 12; a++) {
    for (let b = a + 1; b < 12; b++) {
      const dx = ICO_V[a][0] - ICO_V[b][0];
      const dy = ICO_V[a][1] - ICO_V[b][1];
      const dz = ICO_V[a][2] - ICO_V[b][2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (Math.abs(dist - d) < 1e-6) edges.push([a, b]);
    }
  }
  return edges;
})();

// Скруглённая ступенька: непрерывная, похожа на ступени.
function step(x, width) {
  const s = Math.max(1e-6, width);
  return 0.5 * (Math.tanh(x / s) + 1);
}

// ---- фракталы и хаос ----

const mandelShell = (i, p, out) => {
  // Раковина «Мандельброта»: спиральные ветви с осколками-фракталами.
  const a = (i / 2000) * TAU * p.arms;
  const r = p.radius * (0.3 + 0.7 * h(i));
  out[0] = r * Math.cos(a) * (1 + 0.3 * Math.sin(p.freq * r));
  out[1] = r * Math.sin(a) * p.flatten * (1 + 0.2 * Math.cos(p.freq * r));
  out[2] = r * Math.sin(a * p.arms + p.twist) * 0.5 + h2(i + 7) * p.tubeR;
};

const juliaCloud = (i, p, out) => {
  // «Жюлиа»: облако точек, притягиваемое к кардиоподобной границе.
  const th = (i / 2000) * TAU;
  const r = p.radius * (0.2 + 0.8 * h(i + 1));
  const card = 1 + 0.4 * Math.sin(p.freq * th * p.arms);
  const rr = r * card;
  out[0] = rr * Math.cos(th);
  out[1] = rr * Math.sin(th) * p.flatten;
  out[2] = (h(i + 2) - 0.5) * p.tubeR * 2 * (1 - r / p.radius);
};

const lozengeAttractor = (i, p, out) => {
  // «Лоренц»: орбиты аттрактора, слоённые по спирали вверх.
  const t = (i / 2000) * p.turns * TAU;
  const decay = Math.exp(-t * 0.05);
  out[0] = p.radius * Math.sin(t) * (0.5 + 0.5 * decay) * Math.cos(p.freq * i);
  out[1] = p.radius * (0.3 + 0.7 * decay) * Math.sin(t * p.knotQ * 0.5);
  out[2] = p.radius * Math.cos(t) * (0.5 + 0.5 * decay) * Math.sin(p.freq * i);
};

const roesslerRibbon = (i, p, out) => {
  // «Рёсслер»: лента, закрученная вокруг себя, с разбросом по толщине.
  const t = (i / 2000) * TAU * p.turns;
  const r = p.radius * (0.4 + 0.6 * Math.sin(t * p.knotP));
  out[0] = r * Math.cos(t) + h2(i + 3) * p.tubeR;
  out[1] = p.radius * 0.3 * Math.sin(t * p.knotQ + p.twist);
  out[2] = r * Math.sin(t) * p.flatten + h2(i + 4) * p.tubeR * 0.5;
};

// ---- спирали и винты ----

const logSpiral = (i, p, out) => {
  // Логарифмическая спираль: рукав, расширяющийся от центра.
  const t = (i / 2000) * TAU * p.turns;
  const r = p.radius * Math.exp((t / (TAU * p.turns) - 1) * p.arms * 0.5);
  out[0] = r * Math.cos(t + p.twist);
  out[1] = h2(i + 5) * p.tubeR * 0.5;
  out[2] = r * Math.sin(t + p.twist) * p.flatten;
};

const doubleHelix = (i, p, out) => {
  // Двойная спираль: две нити с перемычками, как ДНК.
  const strand = i % 2;
  const t = (Math.floor(i / 2) / 1000) * TAU * p.turns;
  const phase = strand * Math.PI;
  const r = p.radius * 0.5;
  out[0] = r * Math.cos(t + phase + p.twist);
  out[1] = (Math.floor(i / 2) / 1000 - 0.5) * p.radius * 2 * p.flatten;
  out[2] = r * Math.sin(t + phase + p.twist) + h2(i + 6) * p.tubeR * 0.3;
};

const galacticArms = (i, p, out) => {
  // Галактика: рукава, закручивающиеся от яркого ядра.
  const arm = i % p.arms;
  const t = (i / 2000) * TAU * p.turns;
  const r = p.radius * (0.1 + 0.9 * Math.pow(h(i + 8), 0.5));
  const a = t + (arm / p.arms) * TAU + p.twist * (r / p.radius);
  out[0] = r * Math.cos(a);
  out[1] = h2(i + 9) * p.tubeR * (1 - r / p.radius) * 2;
  out[2] = r * Math.sin(a) * p.flatten;
};

const vortexEye = (i, p, out) => {
  // Вихрь: спираль, падающая в глаз, с рваной кромкой.
  const t = (i / 2000) * TAU * p.turns;
  const r = p.radius * (1 - (i / 2000) * 0.8);
  const a = t + p.twist;
  out[0] = r * Math.cos(a) + h2(i + 10) * p.tubeR * 0.5;
  out[1] = (i / 2000 - 0.5) * p.radius * 0.6 * p.flatten;
  out[2] = r * Math.sin(a) + h2(i + 11) * p.tubeR * 0.5;
};

// ---- многогранники ----

const tetraWire = (i, p, out) => {
  // Тетраэдр: каркас из 4 вершин и 6 рёбер.
  const V = [
    [1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1],
  ];
  const E = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
  const e = i % 6;
  const t = Math.floor(i / 6) / Math.max(1, Math.floor(2000 / 6));
  const A = V[E[e][0]], B = V[E[e][1]];
  const s = p.radius * 0.6;
  out[0] = (A[0] + (B[0] - A[0]) * t) * s + h2(i + 12) * p.tubeR * 0.2;
  out[1] = (A[1] + (B[1] - A[1]) * t) * s * p.flatten + h2(i + 13) * p.tubeR * 0.2;
  out[2] = (A[2] + (B[2] - A[2]) * t) * s + h2(i + 14) * p.tubeR * 0.2;
};

const octaFrame = (i, p, out) => {
  // Октаэдр: каркас из 6 вершин и 12 рёбер.
  const V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const E = [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5]];
  const e = i % 12;
  const t = Math.floor(i / 12) / Math.max(1, Math.floor(2000 / 12));
  const A = V[E[e][0]], B = V[E[e][1]];
  const s = p.radius * 0.7;
  out[0] = (A[0] + (B[0] - A[0]) * t) * s + h2(i + 15) * p.tubeR * 0.2;
  out[1] = (A[1] + (B[1] - A[1]) * t) * s * p.flatten + h2(i + 16) * p.tubeR * 0.2;
  out[2] = (A[2] + (B[2] - A[2]) * t) * s + h2(i + 17) * p.tubeR * 0.2;
};

const icoLattice = (i, p, out) => {
  // Икосаэдр: каркас из 12 вершин и 30 рёбер.
  const e = i % 30;
  const t = Math.floor(i / 30) / Math.max(1, Math.floor(2000 / 30));
  const A = ICO_V[ICO_E[e][0]], B = ICO_V[ICO_E[e][1]];
  const s = p.radius * 0.7;
  out[0] = (A[0] + (B[0] - A[0]) * t) * s + h2(i + 18) * p.tubeR * 0.2;
  out[1] = (A[1] + (B[1] - A[1]) * t) * s * p.flatten + h2(i + 19) * p.tubeR * 0.2;
  out[2] = (A[2] + (B[2] - A[2]) * t) * s + h2(i + 20) * p.tubeR * 0.2;
};

const geoDome = (i, p, out) => {
  // Геодезическая сфера: точки, равномерно рассыпанные по сфере Фибоначчи.
  const n = 2000;
  const ga = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - 2 * (i + 0.5) / n;
  const rr = Math.sqrt(Math.max(0, 1 - y * y));
  const a = ga * i;
  const s = p.radius * 0.7;
  out[0] = Math.cos(a) * rr * s + h2(i + 21) * p.tubeR * 0.1;
  out[1] = y * s * p.flatten + h2(i + 22) * p.tubeR * 0.1;
  out[2] = Math.sin(a) * rr * s + h2(i + 23) * p.tubeR * 0.1;
};

// ---- космос ----

const nebulaPillars = (i, p, out) => {
  // Туманность: колонны-«пальцы» из газа, с размытыми краями.
  const c = i % p.clusterCount;
  const t = Math.floor(i / p.clusterCount) / Math.max(1, Math.floor(2000 / p.clusterCount));
  const ca = (c / p.clusterCount) * TAU + p.twist;
  const cx = Math.cos(ca) * p.radius * 0.5;
  const cz = Math.sin(ca) * p.radius * 0.5 * p.flatten;
  out[0] = cx + h2(i + 24) * p.clusterRadius * (1 - t * 0.5);
  out[1] = (t - 0.3) * p.radius * 1.5 + h2(i + 25) * p.clusterRadius * 0.3;
  out[2] = cz + h2(i + 26) * p.clusterRadius * (1 - t * 0.5);
};

const blackHoleDisc = (i, p, out) => {
  // Чёрная дыра: аккреционный диск с провалом в центре.
  const t = i / 2000;
  const a = t * TAU * p.turns + p.twist;
  const r = p.radius * (0.3 + 0.7 * t);
  out[0] = r * Math.cos(a) + h2(i + 27) * p.tubeR * 0.4;
  out[1] = (t - 0.5) * p.tubeR * 0.8 * Math.sin(p.freq * a);
  out[2] = r * Math.sin(a) * p.flatten + h2(i + 28) * p.tubeR * 0.4;
};

const cometTail = (i, p, out) => {
  // Комета: яркое ядро и хвост, уходящий в сторону.
  const t = i / 2000;
  const hx = h2(i + 29) * p.tubeR * (0.2 + t * 1.5);
  const hy = h2(i + 30) * p.tubeR * (0.2 + t * 1.5);
  const hz = h2(i + 31) * p.tubeR * (0.2 + t * 1.5);
  out[0] = t * p.radius * 1.5 + hx;
  out[1] = h2(i + 32) * p.radius * 0.1 * (1 - t) + hy;
  out[2] = h2(i + 33) * p.radius * 0.1 * (1 - t) + hz;
};

const pulsarBeams = (i, p, out) => {
  // Пульсар: лучи, бьющие из центра, с расходящимися волнами.
  const a = (i % 360) / 360 * TAU + p.twist;
  const t = Math.floor(i / 360) / Math.max(1, Math.floor(2000 / 360));
  const r = p.radius * t * (1 + 0.2 * Math.sin(p.freq * t * 10));
  out[0] = r * Math.cos(a);
  out[1] = (t - 0.5) * p.tubeR * 2 * Math.sin(p.freq * i);
  out[2] = r * Math.sin(a) * p.flatten;
};

// ---- поверхности ----

const hyperbolicSaddle = (i, p, out) => {
  // Гиперболический параболоид: седло, изгибающееся в обе стороны.
  const x = (i / 2000 - 0.5) * p.radius * 1.5;
  const z = h2(i + 55) * p.radius * 0.75;
  const y = (x * x - z * z) / (p.radius * 0.8);
  out[0] = x;
  out[1] = y * p.flatten + h2(i + 56) * p.tubeR * 0.1;
  out[2] = z;
};

const mobiusStrip = (i, p, out) => {
  // Лента Мёбиуса: тороидальная лента с полуоборотом.
  const u = (i / 2000) * TAU;
  const v = (h(i + 57) - 0.5) * p.tubeR * 2;
  const R = p.radius * 0.5;
  out[0] = (R + v * Math.cos(u / 2)) * Math.cos(u);
  out[1] = (R + v * Math.cos(u / 2)) * Math.sin(u) * p.flatten;
  out[2] = v * Math.sin(u / 2);
};

const kleinBottle = (i, p, out) => {
  // Бутылка Клейна: замкнутая поверхность, проходящая сквозь себя.
  const u = (i / 2000) * TAU;
  const v = (h(i + 58) - 0.5) * TAU;
  const r = p.radius * 0.4;
  const cu = Math.cos(u), su = Math.sin(u);
  const cv = Math.cos(v), sv = Math.sin(v);
  const x0 = r * (1 - cu / 2) * cv;
  const z0 = r * (1 - cu / 2) * sv;
  out[0] = x0 * cu + (cu / 2) * r * 1.5;
  out[1] = x0 * su * p.flatten;
  out[2] = z0;
};

const waveMembrane = (i, p, out) => {
  // Волновая мембрана: плоскость, покрытая бегущими волнами.
  const x = (i / 2000 - 0.5) * p.radius * 1.5;
  const z = h2(i + 59) * p.radius * 0.75;
  const y = Math.sin(x * p.freq + p.twist) * p.amp * 0.3
    + Math.sin(z * p.freq * 1.2) * p.amp * 0.3;
  out[0] = x;
  out[1] = y * p.flatten;
  out[2] = z;
};

// ---- решётки ----

const cubeLattice = (i, p, out) => {
  // Куб-решётка: точки в узлах куба, с пустотами по шахматному закону.
  const n = 4;
  const idx = i % (n * n * n);
  const x = idx % n, y = Math.floor(idx / n) % n, z = Math.floor(idx / (n * n)) % n;
  const keep = (x + y + z) % 2 === (i >> 12) % 2;
  const s = p.radius * 0.8 / n;
  out[0] = (x - (n - 1) / 2) * s * 2 + h2(i + 60) * p.tubeR * 0.2;
  out[1] = (y - (n - 1) / 2) * s * 2 * p.flatten * (keep ? 1 : 0.3) + h2(i + 61) * p.tubeR * 0.2;
  out[2] = (z - (n - 1) / 2) * s * 2 + h2(i + 62) * p.tubeR * 0.2;
};

const hexGrid = (i, p, out) => {
  // Гексагональная сетка: точки в узлах шестиугольной решётки.
  const n = 6;
  const idx = i % (n * n);
  const x = idx % n, y = Math.floor(idx / n) % n;
  const off = (y % 2) * 0.5;
  const s = p.radius * 0.7 / n;
  out[0] = (x + off - (n - 1) / 2) * s * 2 + h2(i + 63) * p.tubeR * 0.2;
  out[1] = h2(i + 64) * p.tubeR * 0.3;
  out[2] = (y - (n - 1) / 2) * s * 2 * p.flatten + h2(i + 65) * p.tubeR * 0.2;
};

const voronoiCells = (i, p, out) => {
  // Ячейки Вороного: точки, притянутые к случайным «семенам»-центрам.
  const c = i % p.clusterCount;
  const t = Math.floor(i / p.clusterCount) / Math.max(1, Math.floor(2000 / p.clusterCount));
  const ca = h(c + 66) * TAU;
  const cr = h(c + 67) * p.radius * 0.6;
  const cx = Math.cos(ca) * cr;
  const cz = Math.sin(ca) * cr * p.flatten;
  const cellR = p.clusterRadius * (0.5 + 0.5 * h(c + 68));
  out[0] = cx + h2(i + 69) * cellR;
  out[1] = h2(i + 70) * p.tubeR * 0.5;
  out[2] = cz + h2(i + 71) * cellR;
};

// ---- каталог ----

const BASE_SHAPES = {
  // фракталы и хаос
  mandelShell,
  juliaCloud,
  lozengeAttractor,
  roesslerRibbon,
  // спирали и винты
  logSpiral,
  doubleHelix,
  galacticArms,
  vortexEye,
  // многогранники
  tetraWire,
  octaFrame,
  icoLattice,
  geoDome,
  // космос
  nebulaPillars,
  blackHoleDisc,
  cometTail,
  pulsarBeams,
  // поверхности
  hyperbolicSaddle,
  mobiusStrip,
  kleinBottle,
  waveMembrane,
  // решётки
  cubeLattice,
  hexGrid,
  voronoiCells,
};

// ---- legacy center-clustered forms (from old SHAPES in main.js) ----

const centerTorus = (i, p, out) => {
  // Тороидальное кольцо, сжатое к центру.
  const u = (i / 2000) * TAU;
  const v = h(i + 80) * TAU;
  const R = p.radius * 0.5;
  const r = p.tubeR * 0.5;
  torusPoint(u, v, R, r, out);
  out[1] *= p.flatten;
};

const centerSpiral = (i, p, out) => {
  // Спираль, закрученная внутрь к центру.
  const t = i / 2000;
  const a = t * TAU * p.turns + p.twist;
  const r = p.radius * (1 - t * 0.8);
  out[0] = r * Math.cos(a);
  out[1] = h2(i + 81) * p.tubeR * 0.4;
  out[2] = r * Math.sin(a) * p.flatten;
};

const centerOrb = (i, p, out) => {
  // Шар, сжатый к центру по вертикали.
  const n = 2000;
  const ga = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - 2 * (i + 0.5) / n;
  const rr = Math.sqrt(Math.max(0, 1 - y * y));
  const a = ga * i;
  const s = p.radius * 0.6;
  out[0] = Math.cos(a) * rr * s;
  out[1] = y * s * p.flatten;
  out[2] = Math.sin(a) * rr * s;
};

const centerBloom = (i, p, out) => {
  // Цветок-раскрытие: лепестки, расходящиеся от центра.
  const petal = i % p.arms;
  const t = Math.floor(i / p.arms) / Math.max(1, Math.floor(2000 / p.arms));
  const a = (petal / p.arms) * TAU + p.twist;
  const r = p.radius * t * (0.3 + 0.7 * h(i + 82));
  out[0] = r * Math.cos(a) + h2(i + 83) * p.tubeR * 0.3;
  out[1] = h2(i + 84) * p.tubeR * 0.3 * (1 - t);
  out[2] = r * Math.sin(a) * p.flatten + h2(i + 85) * p.tubeR * 0.3;
};

const centerLattice = (i, p, out) => {
  // Решётка, сжатая к центру.
  const n = 5;
  const idx = i % (n * n * n);
  const x = idx % n, y = Math.floor(idx / n) % n, z = Math.floor(idx / (n * n)) % n;
  const s = p.radius * 0.5 / n;
  out[0] = (x - (n - 1) / 2) * s * 2 + h2(i + 86) * p.tubeR * 0.15;
  out[1] = (y - (n - 1) / 2) * s * 2 * p.flatten + h2(i + 87) * p.tubeR * 0.15;
  out[2] = (z - (n - 1) / 2) * s * 2 + h2(i + 88) * p.tubeR * 0.15;
};

const centerRipple = (i, p, out) => {
  // Кольца-рябь, расходящиеся от центра.
  const t = i / 2000;
  const a = (i % 360) / 360 * TAU;
  const r = p.radius * t;
  out[0] = r * Math.cos(a) + h2(i + 89) * p.tubeR * 0.2;
  out[1] = Math.sin(r * p.freq) * p.amp * 0.3 * p.flatten;
  out[2] = r * Math.sin(a) + h2(i + 90) * p.tubeR * 0.2;
};

const centerVortex = (i, p, out) => {
  // Вихрь, падающий в центр.
  const t = i / 2000;
  const a = t * TAU * p.turns * 2 + p.twist;
  const r = p.radius * (1 - t * 0.7);
  out[0] = r * Math.cos(a) + h2(i + 91) * p.tubeR * 0.3;
  out[1] = (t - 0.5) * p.radius * 0.8 * p.flatten;
  out[2] = r * Math.sin(a) + h2(i + 92) * p.tubeR * 0.3;
};

const centerBraid = (i, p, out) => {
  // Плетение: несколько нитей, переплетённых вокруг центр.
  const strand = i % p.strands;
  const t = Math.floor(i / p.strands) / Math.max(1, Math.floor(2000 / p.strands));
  const a = t * TAU * p.turns + (strand / p.strands) * TAU;
  const r = p.radius * 0.4;
  out[0] = r * Math.cos(a) + h2(i + 93) * p.tubeR * 0.2;
  out[1] = (t - 0.5) * p.radius * 1.5 * p.flatten + h2(i + 94) * p.tubeR * 0.2;
  out[2] = r * Math.sin(a) + h2(i + 95) * p.tubeR * 0.2;
};

// Add legacy forms to catalog
Object.assign(BASE_SHAPES, {
  centerTorus,
  centerSpiral,
  centerOrb,
  centerBloom,
  centerLattice,
  centerRipple,
  centerVortex,
  centerBraid,
});

// Формы из shapePatch.js подменяют одноимённые базовые и добавляют новые.
export const SHAPES = { ...BASE_SHAPES, ...PATCH };
export const SHAPE_KEYS = Object.keys(SHAPES);
