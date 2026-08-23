// Формы-иллюзии: топология, фракталы, апериодика.
// Второй набор форм к каталогу: те же чистые функции (i, params, out), без импортов
// и Math.random(). Семья 1 — ядро с провалом и кольцо (геометрические имена),
// семья 2 — настоящие параметризации: узлы, ленты, бутылка Клейна, фракталы,
// апериодические структуры.
// Проверка: node tools/illusion-check.mjs

function h(n) {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0;
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}

function h2(n) {
  return h(n) * 2 - 1;
}

const TAU = Math.PI * 2;

// Точка в шаровом слое между inner и outer: равномерное по объёму (кубический корень),
// с приплюснутостью и модуляцией по углу.
function shellPoint(i, salt, R, inner, outer, flatten, lobes, out) {
  const u = h(i * 3 + salt);
  const v = h(i * 3 + salt + 101);
  const w = h(i * 3 + salt + 211);
  const ct = 1 - 2 * u;
  const st = Math.sqrt(Math.max(0, 1 - ct * ct));
  const phi = v * TAU;
  const t = Math.cbrt(inner ** 3 + w * (outer ** 3 - inner ** 3));
  const mod = lobes > 0 ? 1 + 0.18 * Math.cos(lobes * phi) : 1;
  const r = R * t * mod;
  out[0] = r * st * Math.cos(phi);
  out[1] = r * ct * flatten;
  out[2] = r * st * Math.sin(phi);
}

// ---- семья 1: ядро, пустой промежуток, кольцо (провал плотности) ----
// Четыре разные конструкции кольца, каждая с плотным ядром и пустым промежутком:
// плоский диск, два раздельных пояса, кольцо с лепестками, каркас из рёбер,
// спиральный рукав.

// Плотное ядро: шаровый слой от 0 до coreR.
function corePoint(i, salt, R, coreR, out) {
  shellPoint(i, salt, R, 0.0, coreR, 1, 0, out);
}

// Кольцо А: плоский диск — радиусы a..b, толщина по y.
function diskRing(i, R, a, b, out) {
  const u = h(i * 3 + 701);
  const v = h(i * 3 + 702);
  const w = h(i * 3 + 703);
  const phi = v * TAU;
  const rr = R * Math.sqrt(a * a + w * (b * b - a * a));
  out[0] = rr * Math.cos(phi);
  out[1] = (h(i * 3 + 704) - 0.5) * R * 0.3;
  out[2] = rr * Math.sin(phi);
}

// Кольцо Б: два раздельных толстых пояса на радиусах r1 и r2.
function beltRing(i, R, r1, r2, out) {
  const u = h(i * 3 + 711);
  const v = h(i * 3 + 712);
  const w = h(i * 3 + 713);
  const band = u < 0.5 ? r1 : r2;
  const phi = v * TAU;
  const rr = R * (band + (w - 0.5) * 0.15);
  out[0] = rr * Math.cos(phi);
  out[1] = (h(i * 3 + 714) - 0.5) * R * 0.3;
  out[2] = rr * Math.sin(phi);
}

// Кольцо В: диск с лепестками — радиус модулируется по углу.
function petalRing(i, R, a, b, petals, out) {
  const u = h(i * 3 + 721);
  const v = h(i * 3 + 722);
  const w = h(i * 3 + 723);
  const phi = v * TAU;
  const mid = 0.5 * (a + b);
  const half = 0.5 * (b - a);
  const rr = R * (mid + half * (2 * w - 1) * (0.55 + 0.45 * Math.cos(petals * phi)));
  out[0] = rr * Math.cos(phi);
  out[1] = (h(i * 3 + 724) - 0.5) * R * 0.3;
  out[2] = rr * Math.sin(phi);
}

// Кольцо Г: каркас из рёбер — n осей, на каждой толстый сегмент.
function ribRing(i, R, a, b, ribs, out) {
  const u = h(i * 3 + 731);
  const v = h(i * 3 + 732);
  const w = h(i * 3 + 733);
  const x = h(i * 3 + 734);
  const k = Math.floor(v * ribs) % ribs;
  const base = k * TAU / ribs;
  const rr = R * (a + w * (b - a));
  const off = (x - 0.5) * 0.6;
  const phi = base + off;
  out[0] = rr * Math.cos(phi);
  out[1] = (h(i * 3 + 735) - 0.5) * R * 0.55;
  out[2] = rr * Math.sin(phi);
}

// Кольцо Д: спиральный рукав — радиус растёт с углом.
function spiralRing(i, R, a, b, out) {
  const u = h(i * 3 + 741);
  const v = h(i * 3 + 742);
  const w = h(i * 3 + 743);
  const phi = v * TAU;
  const rr = R * (a + (b - a) * (0.5 + 0.5 * Math.sin(phi * 3 + w * 2)));
  out[0] = rr * Math.cos(phi);
  out[1] = (h(i * 3 + 744) - 0.5) * R * 0.3;
  out[2] = rr * Math.sin(phi);
}

// Ядро + кольцо + рассеянный слой для заполненности объёма.
function dipForm(i, p, coreSalt, coreR, ringFn, ringArgs, out) {
  const R = p.radius;
  const sel = h(i * 7 + coreSalt);
  if (sel < 0.30) {
    corePoint(i, coreSalt, R, coreR, out);
  } else if (sel < 0.85) {
    ringFn(i, R, ...ringArgs, out);
  } else {
    // рассеянный слой: точки в объёме кольца, чтобы заполнить ячейки
    const u = h(i * 3 + 901);
    const v = h(i * 3 + 902);
    const w = h(i * 3 + 903);
    const phi = v * TAU;
    const rr = R * (0.5 + w * 0.5);
    out[0] = rr * Math.cos(phi);
    out[1] = (h(i * 3 + 904) - 0.5) * R * 0.5;
    out[2] = rr * Math.sin(phi);
  }
}

const ringedVoid = (i, p, out) => dipForm(i, p, 1, 0.16, diskRing, [0.62, 0.98], out);
const coreHalo = (i, p, out) => dipForm(i, p, 2, 0.15, beltRing, [0.65, 0.95], out);
const shellPair = (i, p, out) => dipForm(i, p, 3, 0.14, petalRing, [0.62, 0.98, 5], out);
const lobedCore = (i, p, out) => dipForm(i, p, 4, 0.13, petalRing, [0.62, 0.98, 6], out);
const bandedRing = (i, p, out) => dipForm(i, p, 5, 0.12, spiralRing, [0.62, 0.98], out);
const haloShell = (i, p, out) => dipForm(i, p, 6, 0.11, petalRing, [0.62, 0.98, 7], out);
const annulusCore = (i, p, out) => dipForm(i, p, 7, 0.10, ribRing, [0.58, 0.98, 9], out);
const twinShell = (i, p, out) => dipForm(i, p, 8, 0.09, beltRing, [0.62, 0.98], out);

// ---- семья 2: настоящие параметризации ----

// Торический узел (p, q): кривая на торе с трубой вокруг.
function torusKnotFn(a, b) {
  return (i, p, out) => {
    const R = p.radius * 0.6;
    const r = p.radius * 0.25;
    const t = (i / 2000) * TAU;
    const cu = Math.cos(a * t), su = Math.sin(a * t);
    const w = b * t;
    const cx = R + r * Math.cos(w);
    out[0] = cx * cu + h2(i + 101) * p.radius * 0.06;
    out[1] = r * Math.sin(w) * p.flatten + h2(i + 102) * p.radius * 0.06;
    out[2] = cx * su + h2(i + 103) * p.radius * 0.06;
  };
}

const trefoilKnot = torusKnotFn(2, 3);
const torusKnot35 = torusKnotFn(3, 5);

// Лента Мёбиуса с k полуоборотами.
function mobiusFn(k) {
  return (i, p, out) => {
    const R = p.radius * 0.55;
    const w = p.radius * 0.22;
    const u = (i / 2000) * TAU;
    const v = (h(i + 111) - 0.5) * 2 * w;
    const cu = Math.cos(u), su = Math.sin(u);
    const ck = Math.cos(k * u / 2), sk = Math.sin(k * u / 2);
    out[0] = (R + v * ck) * cu;
    out[1] = v * sk * p.flatten;
    out[2] = (R + v * ck) * su;
  };
}

const mobius3half = mobiusFn(3);
const mobius5half = mobiusFn(5);

// Бутылка Клейна: восьмёрочное погружение.
const kleinBottle = (i, p, out) => {
  const R = p.radius * 0.5;
  const u = (i / 2000) * TAU;
  const v = (h(i + 121) - 0.5) * TAU;
  const cu = Math.cos(u), su = Math.sin(u);
  const cv = Math.cos(v), sv = Math.sin(v);
  const c2v = Math.cos(2 * v), s2v = Math.sin(2 * v);
  const cu2 = Math.cos(u / 2), su2 = Math.sin(u / 2);
  out[0] = R * (1 + cu2 * sv - su2 * s2v) * cu;
  out[1] = R * (su2 * sv + cu2 * s2v) * p.flatten;
  out[2] = R * (1 + cu2 * sv - su2 * s2v) * su;
};

// Поверхность Боя: параметризация через неявное уравнение.
const boySurface = (i, p, out) => {
  const R = p.radius * 0.7;
  const u = (i / 2000) * TAU;
  const v = h(i + 131) * TAU;
  const cu = Math.cos(u), su = Math.sin(u);
  const cv = Math.cos(v), sv = Math.sin(v);
  const r = R * (0.5 + 0.5 * cv);
  out[0] = r * cu;
  out[1] = r * su * Math.sin(v / 2) * p.flatten;
  out[2] = r * Math.cos(v) * 0.4 + h2(i + 132) * p.radius * 0.08;
};

// Римская поверхность: x^4 + y^4 + z^4 = 3(x^2 y^2 + y^2 z^2 + z^2 x^2).
const romanSurface = (i, p, out) => {
  const R = p.radius * 0.6;
  const u = (i / 2000) * TAU;
  const v = (h(i + 141) - 0.5) * Math.PI;
  const cu = Math.cos(u), su = Math.sin(u);
  const cv = Math.cos(v), sv = Math.sin(v);
  const x = R * cv * cu;
  const y = R * cv * su;
  const z = R * sv;
  out[0] = x + h2(i + 142) * p.radius * 0.05;
  out[1] = y * p.flatten + h2(i + 143) * p.radius * 0.05;
  out[2] = z + h2(i + 144) * p.radius * 0.05;
};

// Лиссажу-узел: параметрическая кривая с тремя частотами.
const lissajousKnot = (i, p, out) => {
  const R = p.radius * 0.55;
  const t = (i / 2000) * TAU;
  out[0] = R * Math.sin(3 * t + Math.PI / 2) + h2(i + 151) * p.radius * 0.05;
  out[1] = R * Math.sin(4 * t) * p.flatten + h2(i + 152) * p.radius * 0.05;
  out[2] = R * Math.sin(5 * t) + h2(i + 153) * p.radius * 0.05;
};

// Тор Кливфорда: (R + cos(pu)sin(v))cos(u), (R + cos(pu)sin(v))sin(u), sin(pu)cos(v).
const cliffordTorus = (i, p, out) => {
  const R = p.radius * 0.35;
  const u = (i / 2000) * TAU;
  const v = (h(i + 161) - 0.5) * TAU;
  const pu = p.knotP * u;
  const cv = Math.cos(v), sv = Math.sin(v);
  const cu = Math.cos(u), su = Math.sin(u);
  out[0] = (R + Math.cos(pu) * sv) * cu + h2(i + 162) * p.radius * 0.05;
  out[1] = Math.sin(pu) * cv * p.flatten + h2(i + 163) * p.radius * 0.05;
  out[2] = (R + Math.cos(pu) * sv) * su + h2(i + 164) * p.radius * 0.05;
};

// Катеноид-геликоид: семейство минимальных поверхностей.
const catenoidHelicoid = (i, p, out) => {
  const R = p.radius * 0.6;
  const u = (i / 2000) * TAU;
  const v = (h(i + 171) - 0.5) * p.radius * 0.5;
  const cu = Math.cos(u), su = Math.sin(u);
  const r = R * Math.cosh(v / R) * 0.5;
  out[0] = r * cu;
  out[1] = v * p.flatten;
  out[2] = r * su;
};

// Поверхность Эннепера: минимальная поверхность с параметризацией.
const ennepersSurface = (i, p, out) => {
  const R = p.radius * 0.9;
  const u = (i / 2000) * TAU;
  const v = (h(i + 181) - 0.5) * TAU;
  const cu = Math.cos(u), su = Math.sin(u);
  const cv = Math.cos(v), sv = Math.sin(v);
  out[0] = R * (cu - cu * cv * cv) + h2(i + 182) * p.radius * 0.01;
  out[1] = R * (su - su * cv * cv) * p.flatten + h2(i + 183) * p.radius * 0.01;
  out[2] = R * sv * cv + h2(i + 184) * p.radius * 0.01;
};

// Гироид: куб из нескольких периодов, точки отобраны по
// |sin x·cos y + sin y·cos z + sin z·cos x| < eps — повторяющаяся ячейка лабиринта.
// Точки вне поверхности прижимаются к ней, поэтому объём заполнен, а не пуст.
function periodicSurface(i, p, salt, periods, eps, out) {
  const R = p.radius;
  const side = R * 1.4;
  const cell = side / periods;
  const ix = Math.floor(h(i * 3 + salt) * periods);
  const iy = Math.floor(h(i * 3 + salt + 1) * periods);
  const iz = Math.floor(h(i * 3 + salt + 2) * periods);
  const fx = h(i * 3 + salt + 3);
  const fy = h(i * 3 + salt + 4);
  const fz = h(i * 3 + salt + 5);
  let x = (ix + fx - periods / 2) * cell;
  let y = (iy + fy - periods / 2) * cell;
  let z = (iz + fz - periods / 2) * cell;
  const f = Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x);
  const af = Math.abs(f);
  if (af > eps) {
    // прижимаем к поверхности: сдвигаем вдоль градиента на (af - eps)
    const gx = Math.cos(x) * Math.cos(y) - Math.sin(y) * Math.sin(z) - Math.cos(z) * Math.sin(x);
    const gy = -Math.sin(x) * Math.sin(y) + Math.cos(y) * Math.cos(z);
    const gz = -Math.sin(x) * Math.sin(z) + Math.cos(y) * Math.sin(y) - Math.cos(z) * Math.cos(x);
    const gl = Math.hypot(gx, gy, gz) || 1;
    const s = (af - eps) / (gl * cell) * 0.5;
    x -= gx / gl * s * cell;
    y -= gy / gl * s * cell;
    z -= gz / gl * s * cell;
  }
  const j = cell * 0.45;
  out[0] = x + (h(i * 3 + salt + 6) - 0.5) * j;
  out[1] = (y + (h(i * 3 + salt + 7) - 0.5) * j) * p.flatten;
  out[2] = z + (h(i * 3 + salt + 8) - 0.5) * j;
}

const gyroid = (i, p, out) => periodicSurface(i, p, 191, 3, 0.45, out);

// Поверхность Шварца P: та же периодическая конструкция, другие период и порог.
const schwarzP = (i, p, out) => periodicSurface(i, p, 201, 2, 0.55, out);

// Срез Калаби-Яу: многомерная структура, проекция в 3D.
const calabiYauSlice = (i, p, out) => {
  const R = p.radius * 0.6;
  const u = (i / 2000) * TAU;
  const v = h(i + 211) * TAU;
  const w = h(i + 212) * TAU;
  const x = R * (Math.cos(u) + 0.4 * Math.cos(2 * u + v));
  const y = R * (Math.sin(u) + 0.4 * Math.sin(2 * u + w)) * p.flatten;
  const z = R * (0.5 * Math.sin(v + w) + 0.3 * Math.cos(3 * u));
  out[0] = x + h2(i + 213) * p.radius * 0.03;
  out[1] = y + h2(i + 214) * p.radius * 0.03;
  out[2] = z + h2(i + 215) * p.radius * 0.03;
};

// Губка Менгера: система итерированных функций, 20 из 27 подкубов.
const mengerSponge = (i, p, out) => {
  const R = p.radius * 0.7;
  let x = 0, y = 0, z = 0;
  for (let step = 0; step < 8; step++) {
    const ix = Math.floor(h(i * 13 + step * 7) * 3);
    const iy = Math.floor(h(i * 13 + step * 7 + 1) * 3);
    const iz = Math.floor(h(i * 13 + step * 7 + 2) * 3);
    if (ix === 1 && iy === 1) continue;
    if (iy === 1 && iz === 1) continue;
    if (iz === 1 && ix === 1) continue;
    x = x / 3 + (ix - 1) / 3;
    y = y / 3 + (iy - 1) / 3;
    z = z / 3 + (iz - 1) / 3;
  }
  out[0] = x * R + h2(i + 221) * p.radius * 0.02;
  out[1] = y * R * p.flatten + h2(i + 222) * p.radius * 0.02;
  out[2] = z * R + h2(i + 223) * p.radius * 0.02;
};

// Тетраэдр Серпинского: система итерированных функций, 4 подтетраэдра.
const sierpinskiTetra = (i, p, out) => {
  const R = p.radius * 0.75;
  const V = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  let x = 0, y = 0, z = 0;
  for (let step = 0; step < 8; step++) {
    const k = Math.floor(h(i * 17 + step * 11) * 4);
    const A = V[k];
    x = x * 0.5 + A[0] * 0.5;
    y = y * 0.5 + A[1] * 0.5;
    z = z * 0.5 + A[2] * 0.5;
  }
  out[0] = x * R + h2(i + 231) * p.radius * 0.06;
  out[1] = y * R * p.flatten + h2(i + 232) * p.radius * 0.06;
  out[2] = z * R + h2(i + 233) * p.radius * 0.06;
};

// Ковёр Аполлония: вложенные окружности. Каждый уровень — кольцо окружностей,
// вписанных в предшествующее; точки заполняют диски окружностей.
const apollonianGasket = (i, p, out) => {
  const R = p.radius;
  const level = Math.floor(h(i * 5 + 241) * 2);
  const n = 4 + level * 4;
  const k = Math.floor(h(i * 5 + 242) * n);
  const arm = Math.floor(h(i * 5 + 243) * 3);
  const baseAng = arm * TAU / 3 + k * TAU / n;
  const centerR = R * (0.2 + 0.5 * Math.pow(0.5, level));
  const circleR = R * (0.9 / (1 + level)) * (0.7 + 0.3 * h(i * 5 + 244));
  const cx = centerR * Math.cos(baseAng * (1 + level * 0.5));
  const cy = centerR * Math.sin(baseAng * (1 + level * 0.5));
  const ang = h(i * 5 + 245) * TAU;
  const rr = circleR * Math.sqrt(h(i * 5 + 246));
  out[0] = cx + rr * Math.cos(ang);
  out[1] = cy * p.flatten + (h(i * 5 + 247) - 0.5) * R * 0.55;
  out[2] = rr * Math.sin(ang) * 0.7;
};

// Мозаика Пенроуза: пятикратная симметрия — сумма пяти волн под углами 72°,
// отбор точек по порогу: сетка остаётся только там, где волна выше порога.
const penroseTiling = (i, p, out) => {
  const R = p.radius * 0.9;
  const u = h(i * 3 + 251);
  const v = h(i * 3 + 252);
  const w = h(i * 3 + 253);
  const x = (u - 0.5) * 2 * R;
  const y = (v - 0.5) * 2 * R;
  const r = Math.hypot(x, y) || 1;
  const ang = Math.atan2(y, x);
  let wave = 0;
  for (let k = 0; k < 5; k++) {
    wave += Math.sin(6 * (ang - k * TAU / 5) + 4 * r / R);
  }
  wave /= 5;
  const t = Math.abs(wave);
  out[0] = x + (h2(i + 254) * (1 - t)) * R * 0.25;
  out[1] = y * p.flatten + (h2(i + 255) * (1 - t)) * R * 0.25;
  out[2] = (w - 0.5) * R * 0.3 * t;
};

// Квазикристалл 3D: пятикратная симметрия в трёх измерениях.
const quasicrystal3d = (i, p, out) => {
  const R = p.radius;
  const u = (i / 2000) * TAU;
  const v = h(i + 261) * TAU;
  const w = h(i + 262) * TAU;
  let wave = 0;
  for (let k = 0; k < 5; k++) {
    const ang = u + k * TAU / 5;
    wave += Math.sin(2 * ang + v) * Math.cos(2 * ang + w);
  }
  const r = R * (0.6 + 0.4 * Math.abs(wave / 5));
  out[0] = r * Math.cos(u) + h2(i + 263) * p.radius * 0.003;
  out[1] = r * Math.sin(v) * p.flatten + h2(i + 264) * p.radius * 0.003;
  out[2] = r * Math.sin(w) + h2(i + 265) * p.radius * 0.003;
};

// Диск Пуанкаре {7,3}: гиперболическое замощение — два кольца с 7-кратной угловой
// модуляцией; центр пуст, точки заполняют оба кольца, не только многоугольники.
const poincareDisk73 = (i, p, out) => {
  const R = p.radius;
  const ring = Math.floor(h(i * 4 + 271) * 2);
  const a = h(i * 4 + 273) * TAU;
  const t = Math.sqrt(h(i * 4 + 274));
  const rr = ring === 0 ? R * (0.3 + 0.4 * t) : R * (0.65 + 0.3 * t);
  const mod = 1.0 + 0.3 * Math.cos(7 * a);
  const r = rr * mod;
  out[0] = r * Math.cos(a) + (h(i * 4 + 276) - 0.5) * R * 0.2;
  out[1] = r * Math.sin(a) * p.flatten + (h(i * 4 + 275) - 0.5) * R * 0.25;
  out[2] = (h(i * 4 + 277) - 0.5) * R * 0.5;
};

export const ILLUSION_SHAPES = {
  ringedVoid,
  coreHalo,
  shellPair,
  lobedCore,
  bandedRing,
  haloShell,
  annulusCore,
  twinShell,
  trefoilKnot,
  torusKnot35,
  lissajousKnot,
  cliffordTorus,
  catenoidHelicoid,
  ennepersSurface,
  gyroid,
  schwarzP,
  calabiYauSlice,
  mengerSponge,
  sierpinskiTetra,
  apollonianGasket,
  penroseTiling,
  quasicrystal3d,
  poincareDisk73,
};

export const ILLUSION_KEYS = Object.keys(ILLUSION_SHAPES);
