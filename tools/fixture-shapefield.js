// Эталон для tools/shapefield-check.mjs: тонкий слой над каталогом форм, написанный так,
// как его просит N27. Каталог здесь свой, из восьми простых форм — эталону не нужен
// настоящий `shapeCatalog.js` (он приезжает из истории в самой N27), ему нужно быть
// заведомо правильным по контракту: форма выбирается по `seed.shape`, точек ровно столько,
// сколько попросили, габарит слушает `extent`, один и тот же сид даёт те же точки.
const TAU = Math.PI * 2;

// Подпись форм та же, что в каталоге: (i, params, out).
const SHAPES = {
  shellSphere: (i, p, out) => {
    const g = i * 2.399963;
    const y = 1 - (2 * (i % p.count) + 1) / p.count;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    out[0] = Math.cos(g) * r * p.radius;
    out[1] = y * p.radius;
    out[2] = Math.sin(g) * r * p.radius;
  },
  flatRing: (i, p, out) => {
    const a = (i / p.count) * TAU;
    const r = p.radius * (0.7 + 0.3 * ((i * 7919) % 100) / 100);
    out[0] = Math.cos(a) * r;
    out[1] = (((i * 104729) % 100) / 100 - 0.5) * p.radius * 0.1;
    out[2] = Math.sin(a) * r;
  },
  solidDisc: (i, p, out) => {
    const a = (i / p.count) * TAU * 13;
    const r = p.radius * Math.sqrt((i + 0.5) / p.count);
    out[0] = Math.cos(a) * r;
    out[1] = (((i * 31337) % 100) / 100 - 0.5) * p.radius * 0.2;
    out[2] = Math.sin(a) * r;
  },
  doubleHelix: (i, p, out) => {
    const t = (i / p.count) * TAU * 4;
    const side = i % 2 === 0 ? 1 : -1;
    out[0] = Math.cos(t) * p.radius * 0.5 * side;
    out[1] = ((i / p.count) - 0.5) * 2 * p.radius;
    out[2] = Math.sin(t) * p.radius * 0.5 * side;
  },
  cubeLattice: (i, p, out) => {
    const n = Math.max(2, Math.round(Math.cbrt(p.count)));
    const x = i % n, y = Math.floor(i / n) % n, z = Math.floor(i / (n * n)) % n;
    out[0] = (x / (n - 1) - 0.5) * 2 * p.radius;
    out[1] = (y / (n - 1) - 0.5) * 2 * p.radius;
    out[2] = (z / (n - 1) - 0.5) * 2 * p.radius;
  },
  twoLobes: (i, p, out) => {
    const g = i * 2.399963;
    const y = 1 - (2 * (i % p.count) + 1) / p.count;
    const r = Math.sqrt(Math.max(0, 1 - y * y)) * 0.45;
    const shift = i % 2 === 0 ? 0.55 : -0.55;
    out[0] = (Math.cos(g) * r + shift) * p.radius;
    out[1] = y * p.radius * 0.45;
    out[2] = Math.sin(g) * r * p.radius;
  },
  hollowCone: (i, p, out) => {
    const t = (i + 0.5) / p.count;
    const a = i * 2.399963;
    out[0] = Math.cos(a) * t * p.radius;
    out[1] = (t - 0.5) * 2 * p.radius;
    out[2] = Math.sin(a) * t * p.radius;
  },
  ringedCore: (i, p, out) => {
    // Ядро плюс кольцо с провалом между ними: то самое «светило с кольцом» из каталога.
    const core = i % 3 === 0;
    const a = i * 2.399963;
    const y = 1 - (2 * (i % p.count) + 1) / p.count;
    if (core) {
      const r = Math.sqrt(Math.max(0, 1 - y * y)) * 0.18;
      out[0] = Math.cos(a) * r * p.radius;
      out[1] = y * p.radius * 0.18;
      out[2] = Math.sin(a) * r * p.radius;
    } else {
      const r = p.radius * (0.75 + 0.2 * ((i * 7919) % 100) / 100);
      out[0] = Math.cos(a) * r;
      out[1] = y * p.radius * 0.08;
      out[2] = Math.sin(a) * r;
    }
  },
};

export const SHAPE_KEYS = Object.keys(SHAPES);

export function buildShapeField(fields, opts = {}) {
  const count = Math.max(1, Math.floor(opts.count ?? 6000));
  const extent = opts.extent ?? 400;
  const shape = Number.isInteger(fields && fields.shape) ? fields.shape : 0;
  const key = SHAPE_KEYS[shape % SHAPE_KEYS.length];
  const fn = SHAPES[key];
  const params = { radius: extent * 0.5, count };
  return {
    key,
    count,
    params,
    fill(i, out) {
      fn(i % count, params, out);
    },
  };
}
