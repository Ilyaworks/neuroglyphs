// Эталон для tools/impossible-check.mjs: невозможные фигуры, собранные тем приёмом,
// которым их и надо собирать. Приём один и он общий.
//
// Невозможная фигура — это не форма, а совпадение проекции. Строится открытая фигура из
// брусков, честная в пространстве, а последний её конец сдвигается ВДОЛЬ ЛУЧА ЗРЕНИЯ из
// точки привязки, пока не наложится в проекции на первый конец. Из точки привязки фигура
// читается замкнутой и невозможной; при отходе в сторону наложение расходится, и видно,
// что бруски не сходятся вовсе.
//
// Пары концов, которые обязаны совпасть в проекции, модуль отдаёт сам, в `seams`: иначе
// проверяющему нечего мерить, а глазами это не проверяется — разница в один пиксель.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a) => { const l = len(a) || 1; return scale(a, 1 / l); };

// Тот самый приём: вернуть точку на луче «привязка → цель», удалённую от привязки
// на столько же, на сколько удалён естественный конец бруска.
function slideOntoRay(anchor, natural, target) {
  const dist = len(sub(natural, anchor));
  return add(anchor, scale(norm(sub(target, anchor)), dist));
}

// Детерминированный разброс для толщины бруска: без него это нить, а не брус.
function h(n) {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0;
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}

function beamsPenroseTriangle(anchor, center, L) {
  const A = add(center, [-L, -L * 0.6, 0]);
  const B = add(center, [L, -L * 0.6, 0]);
  const C = add(center, [L, L * 0.9, 0]);
  const naturalEnd = add(C, [0, 0, 2 * L]);
  const D = slideOntoRay(anchor, naturalEnd, A);
  return { beams: [[A, B], [B, C], [C, D]], seams: [{ a: A, b: D }] };
}

function beamsPenroseSquare(anchor, center, L) {
  const A = add(center, [-L, -L, 0]);
  const B = add(center, [L, -L, 0]);
  const C = add(center, [L, L, 0]);
  const D = add(center, [-L, L, 0]);
  const naturalEnd = add(D, [0, 0, 2.4 * L]);
  const E = slideOntoRay(anchor, naturalEnd, A);
  return { beams: [[A, B], [B, C], [C, D], [D, E]], seams: [{ a: A, b: E }] };
}

function beamsEscherStairs(anchor, center, L) {
  // Четыре марша, каждый поднимается: в пространстве это спираль, которая не замыкается.
  const step = L * 0.5;
  const P0 = add(center, [-L, -L, 0]);
  const P1 = add(center, [L, -L, step]);
  const P2 = add(center, [L, L, 2 * step]);
  const P3 = add(center, [-L, L, 3 * step]);
  const naturalEnd = add(P3, [0, -2 * L, step]);
  const P4 = slideOntoRay(anchor, naturalEnd, P0);
  return { beams: [[P0, P1], [P1, P2], [P2, P3], [P3, P4]], seams: [{ a: P0, b: P4 }] };
}

const KINDS = {
  penroseTriangle: beamsPenroseTriangle,
  penroseSquare: beamsPenroseSquare,
  escherStairs: beamsEscherStairs,
};

export const IMPOSSIBLE_KINDS = Object.keys(KINDS);

export function buildImpossible(kind, anchor, opts = {}) {
  const count = Math.max(1, Math.floor(opts.count ?? 3000));
  const extent = opts.extent ?? 200;
  const center = opts.center ?? [0, 0, 0];
  const eye = anchor ?? [0, 0, extent * 3];
  const make = KINDS[kind] || KINDS[IMPOSSIBLE_KINDS[0]];
  const { beams, seams } = make(eye, center, extent * 0.5);

  const lengths = beams.map(([p, q]) => len(sub(q, p)));
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  const thickness = extent * 0.02;

  return {
    kind: KINDS[kind] ? kind : IMPOSSIBLE_KINDS[0],
    count,
    seams,
    anchor: eye,
    fill(i, out) {
      // Точка распределяется по брускам пропорционально их длине, поперёк — толщина.
      const u = ((i % count) + 0.5) / count;
      let t = u * total, k = 0;
      while (k < lengths.length - 1 && t > lengths[k]) { t -= lengths[k]; k++; }
      const [p, q] = beams[k];
      const s = lengths[k] > 0 ? t / lengths[k] : 0;
      const dir = norm(sub(q, p));
      // Два вектора поперёк бруска, чтобы разброс шёл по сечению, а не по длине.
      const up = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const e1 = norm([
        dir[1] * up[2] - dir[2] * up[1],
        dir[2] * up[0] - dir[0] * up[2],
        dir[0] * up[1] - dir[1] * up[0],
      ]);
      const e2 = [
        dir[1] * e1[2] - dir[2] * e1[1],
        dir[2] * e1[0] - dir[0] * e1[2],
        dir[0] * e1[1] - dir[1] * e1[0],
      ];
      const j1 = (h(i * 2 + 1) - 0.5) * 2 * thickness;
      const j2 = (h(i * 2 + 7919) - 0.5) * 2 * thickness;
      out[0] = p[0] + dir[0] * lengths[k] * s + e1[0] * j1 + e2[0] * j2;
      out[1] = p[1] + dir[1] * lengths[k] * s + e1[1] * j1 + e2[1] * j2;
      out[2] = p[2] + dir[2] * lengths[k] * s + e1[2] * j1 + e2[2] * j2;
    },
  };
}
