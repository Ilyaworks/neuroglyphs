// Старый набор форм глифового поля: 169 функций, перенесённых из src/main.js
// (коммит 5e8e6c9, до выноса каталога). Сохранены целиком, чтобы не терять сиды и формы,
// которые уже нравились. Что из них попадает в мир — решают метрики, см. fieldShapes.js.
//
// Формы этого набора используют общий сеяный генератор: main.js подменяет его через
// setRng(), чтобы мир зависел от сида. Для инструментов есть детерминированный генератор
// по умолчанию.
import { mulberry32 } from '../core/rng.js';

let rng = mulberry32(0x9e3779b9);

/** Подставить сеяный генератор (вызывается из main.js после декодирования сида). */
export function setRng(fn) { rng = fn; }

const FIELD_COUNT = 600000;

export const LEGACY_SHAPES = {
  sphere(i, p, out) {
    const r = p.radius * (0.2 + 0.8 * Math.pow(rng(), p.distPow));
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    out[0] = r * Math.sin(ph) * Math.cos(th);
    out[1] = r * Math.sin(ph) * Math.sin(th) * p.flatten;
    out[2] = r * Math.cos(ph);
  },
  torus(i, p, out) {
    const th = rng() * Math.PI * 2;
    const ph = rng() * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.5 + 0.5 * rng());
    out[0] = (R + r * Math.cos(ph)) * Math.cos(th);
    out[1] = r * Math.sin(ph) * p.flatten;
    out[2] = (R + r * Math.cos(ph)) * Math.sin(th);
  },
  spiralGalaxy(i, p, out) {
    const arm = i % p.arms;
    const t = Math.pow(rng(), 0.7);
    const angle = t * p.twist + (arm / p.arms) * Math.PI * 2 + (rng() - 0.5) * p.spread;
    const r = p.radius * t * (0.3 + 0.7 * rng());
    const y = (rng() - 0.5) * p.thickness * (1.2 - t);
    out[0] = r * Math.cos(angle);
    out[1] = y;
    out[2] = r * Math.sin(angle);
  },
  helix(i, p, out) {
    const strand = i % p.strands;
    const t = rng();
    const angle = t * p.turns * Math.PI * 2 + (strand / p.strands) * Math.PI * 2;
    const r = p.radius * 0.4;
    const y = (t - 0.5) * p.radius * 2;
    const jitter = p.tubeR * rng();
    const ja = rng() * Math.PI * 2;
    out[0] = r * Math.cos(angle) + Math.cos(ja) * jitter;
    out[1] = y + (rng() - 0.5) * jitter;
    out[2] = r * Math.sin(angle) + Math.sin(ja) * jitter;
  },
  clusters(i, p, out) {
    const ci = i % p.clusterCount;
    const cr = p.clusterRadius * (0.3 + 0.7 * Math.pow(rng(), 0.8));
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    // Cluster centers placed on a larger sphere
    const cth = (ci / p.clusterCount) * Math.PI * 2;
    const cph = Math.acos(2 * ((ci * 0.618) % 1) - 1);
    const cR = p.radius * 0.6;
    const cx = cR * Math.sin(cph) * Math.cos(cth);
    const cy = cR * Math.sin(cph) * Math.sin(cth) * p.flatten;
    const cz = cR * Math.cos(cph);
    out[0] = cx + cr * Math.sin(ph) * Math.cos(th);
    out[1] = cy + cr * Math.sin(ph) * Math.sin(th);
    out[2] = cz + cr * Math.cos(ph);
  },
  grid(i, p, out) {
    const n = Math.ceil(Math.cbrt(FIELD_COUNT));
    const idx = i;
    const gx = idx % n;
    const gy = Math.floor(idx / n) % n;
    const gz = Math.floor(idx / (n * n));
    const spacing = p.radius * 2 / n;
    const jitter = spacing * 0.3 * rng();
    out[0] = (gx - n / 2) * spacing + (rng() - 0.5) * jitter;
    out[1] = (gy - n / 2) * spacing * p.flatten + (rng() - 0.5) * jitter;
    out[2] = (gz - n / 2) * spacing + (rng() - 0.5) * jitter;
  },
  wave(i, p, out) {
    const t = rng();
    const s = rng();
    const x = (t - 0.5) * p.radius * 2;
    const z = (s - 0.5) * p.radius * 2;
    const y = Math.sin(x * p.freq) * Math.cos(z * p.freq) * p.amp;
    out[0] = x;
    out[1] = y + (rng() - 0.5) * p.thickness;
    out[2] = z;
  },
  disk(i, p, out) {
    const r = p.radius * Math.pow(rng(), 0.5);
    const th = rng() * Math.PI * 2;
    const y = (rng() - 0.5) * p.thickness * (1 - r / p.radius);
    out[0] = r * Math.cos(th);
    out[1] = y;
    out[2] = r * Math.sin(th);
  },
  cone(i, p, out) {
    const t = Math.pow(rng(), 0.6);
    const r = p.radius * t;
    const th = rng() * Math.PI * 2;
    const y = (t - 0.5) * p.radius * 1.5;
    out[0] = r * Math.cos(th);
    out[1] = y;
    out[2] = r * Math.sin(th);
  },
  knot(i, p, out) {
    const t = rng() * Math.PI * 2;
    const P = p.knotP;
    const Q = p.knotQ;
    const R = p.radius * 0.5;
    const r = p.tubeR * rng();
    const ja = rng() * Math.PI * 2;
    const x0 = R * (2 + Math.cos(Q * t)) * Math.cos(P * t);
    const y0 = R * (2 + Math.cos(Q * t)) * Math.sin(P * t);
    const z0 = R * Math.sin(Q * t);
    out[0] = x0 * 0.3 + Math.cos(ja) * r;
    out[1] = z0 * 0.3 + Math.sin(ja) * r * p.flatten;
    out[2] = y0 * 0.3 + (rng() - 0.5) * r;
  },
  // --- 290 additional shapes (10-300) ---
  // 11-20: basic geometric variants
  icosahedron(i, p, out) {
    const r = p.radius * (0.8 + 0.2 * rng());
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    // Snap to icosahedron vertices approximation
    const snap = Math.round(th / (Math.PI / 5)) * (Math.PI / 5);
    out[0] = r * Math.sin(ph) * Math.cos(snap);
    out[1] = r * Math.sin(ph) * Math.sin(snap) * p.flatten;
    out[2] = r * Math.cos(ph);
  },
  dodecahedron(i, p, out) {
    const r = p.radius * (0.85 + 0.15 * rng());
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    const snap = Math.round(th / (Math.PI / 4)) * (Math.PI / 4);
    out[0] = r * Math.sin(ph) * Math.cos(snap);
    out[1] = r * Math.sin(ph) * Math.sin(snap) * p.flatten;
    out[2] = r * Math.cos(ph);
  },
  octahedron(i, p, out) {
    const r = p.radius * (0.7 + 0.3 * rng());
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    const snap = Math.round(th / (Math.PI / 3)) * (Math.PI / 3);
    out[0] = r * Math.sin(ph) * Math.cos(snap);
    out[1] = r * Math.sin(ph) * Math.sin(snap) * p.flatten;
    out[2] = r * Math.cos(ph);
  },
  tetrahedron(i, p, out) {
    const r = p.radius * (0.6 + 0.4 * rng());
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    const snap = Math.round(th / (Math.PI / 2)) * (Math.PI / 2);
    out[0] = r * Math.sin(ph) * Math.cos(snap);
    out[1] = r * Math.sin(ph) * Math.sin(snap) * p.flatten;
    out[2] = r * Math.cos(ph);
  },
  cube(i, p, out) {
    const r = p.radius * 0.7;
    const face = Math.floor(rng() * 6);
    const u = (rng() - 0.5) * 2 * r;
    const v = (rng() - 0.5) * 2 * r;
    const w = (rng() - 0.5) * 2 * r;
    if (face === 0) { out[0] = r; out[1] = u; out[2] = v; }
    else if (face === 1) { out[0] = -r; out[1] = u; out[2] = v; }
    else if (face === 2) { out[0] = u; out[1] = r; out[2] = v; }
    else if (face === 3) { out[0] = u; out[1] = -r; out[2] = v; }
    else if (face === 4) { out[0] = u; out[1] = v; out[2] = r; }
    else { out[0] = u; out[1] = v; out[2] = -r; }
  },
  pyramid(i, p, out) {
    const t = rng();
    const r = p.radius * t;
    const th = rng() * Math.PI * 2;
    out[0] = r * Math.cos(th);
    out[1] = (1 - t) * p.radius * 1.2;
    out[2] = r * Math.sin(th);
  },
  prism(i, p, out) {
    const sides = 5 + Math.floor(rng() * 8);
    const r = p.radius * 0.6;
    const h = p.radius * (0.8 + rng() * 0.4);
    const t = rng();
    const angle = Math.floor(t * sides) / sides * Math.PI * 2;
    const y = (rng() - 0.5) * h;
    out[0] = r * Math.cos(angle);
    out[1] = y;
    out[2] = r * Math.sin(angle);
  },
  cylinder(i, p, out) {
    const r = p.radius * 0.5;
    const h = p.radius * (0.8 + rng() * 0.4);
    const th = rng() * Math.PI * 2;
    const y = (rng() - 0.5) * h;
    out[0] = r * Math.cos(th);
    out[1] = y;
    out[2] = r * Math.sin(th);
  },
  capsule(i, p, out) {
    const r = p.radius * 0.3;
    const h = p.radius * 0.8;
    const t = rng();
    const th = rng() * Math.PI * 2;
    const y = (t - 0.5) * h;
    const rr = r * (1 - Math.abs(t - 0.5) * 0.5);
    out[0] = rr * Math.cos(th);
    out[1] = y;
    out[2] = rr * Math.sin(th);
  },
  ring(i, p, out) {
    const R = p.radius * 0.7;
    const r = p.tubeR * 0.5 * rng();
    const th = rng() * Math.PI * 2;
    const ph = rng() * Math.PI * 2;
    out[0] = (R + r * Math.cos(ph)) * Math.cos(th);
    out[1] = r * Math.sin(ph) * p.flatten;
    out[2] = (R + r * Math.cos(ph)) * Math.sin(th);
  },
  // 21-40: organic/natural forms
  tree(i, p, out) {
    const trunkH = p.radius * 0.6;
    const canopyR = p.radius * 0.5;
    const t = rng();
    if (t < 0.3) {
      // Trunk
      const th = rng() * Math.PI * 2;
      const r = p.radius * 0.05 * rng();
      out[0] = r * Math.cos(th);
      out[1] = (t / 0.3 - 0.5) * trunkH;
      out[2] = r * Math.sin(th);
    } else {
      // Canopy
      const th = rng() * Math.PI * 2;
      const ph = Math.acos(2 * rng() - 1);
      const r = canopyR * Math.pow(rng(), 0.5);
      out[0] = r * Math.sin(ph) * Math.cos(th);
      out[1] = trunkH * 0.3 + r * Math.sin(ph) * Math.sin(th);
      out[2] = r * Math.cos(ph);
    }
  },
  mushroom(i, p, out) {
    const stemH = p.radius * 0.4;
    const capR = p.radius * 0.5;
    const t = rng();
    if (t < 0.4) {
      const th = rng() * Math.PI * 2;
      const r = p.radius * 0.08 * rng();
      out[0] = r * Math.cos(th);
      out[1] = (t / 0.4 - 0.5) * stemH;
      out[2] = r * Math.sin(th);
    } else {
      const th = rng() * Math.PI * 2;
      const r = capR * Math.pow(rng(), 0.3);
      const y = Math.sqrt(Math.max(0, 1 - (r / capR) ** 2)) * capR * 0.4;
      out[0] = r * Math.cos(th);
      out[1] = stemH * 0.3 + y;
      out[2] = r * Math.sin(th);
    }
  },
  crystal(i, p, out) {
    const r = p.radius * (0.5 + 0.5 * rng());
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    const sharpness = 0.7 + rng() * 0.3;
    out[0] = r * Math.sin(ph) * Math.cos(th) * sharpness;
    out[1] = r * Math.sin(ph) * Math.sin(th) * sharpness * p.flatten;
    out[2] = r * Math.cos(ph) * sharpness;
  },
  rock(i, p, out) {
    const r = p.radius * (0.4 + 0.6 * Math.pow(rng(), 0.7));
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    const wobble = 1 + 0.3 * Math.sin(th * 3) * Math.cos(ph * 2);
    out[0] = r * wobble * Math.sin(ph) * Math.cos(th);
    out[1] = r * wobble * Math.sin(ph) * Math.sin(th) * p.flatten;
    out[2] = r * wobble * Math.cos(ph);
  },
  mountain(i, p, out) {
    const t = rng();
    const r = p.radius * t;
    const th = rng() * Math.PI * 2;
    const peak = 1 - t;
    out[0] = r * Math.cos(th);
    out[1] = peak * peak * p.radius * 1.5;
    out[2] = r * Math.sin(th);
  },
  valley(i, p, out) {
    const t = rng();
    const r = p.radius * t;
    const th = rng() * Math.PI * 2;
    const depth = Math.sin(t * Math.PI);
    out[0] = r * Math.cos(th);
    out[1] = -depth * p.radius * 0.8;
    out[2] = r * Math.sin(th);
  },
  cave(i, p, out) {
    const r = p.radius * (0.5 + 0.5 * rng());
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    const hollow = 0.3 + 0.7 * Math.pow(rng(), 0.5);
    out[0] = r * hollow * Math.sin(ph) * Math.cos(th);
    out[1] = r * hollow * Math.sin(ph) * Math.sin(th) * p.flatten;
    out[2] = r * hollow * Math.cos(ph);
  },
  island(i, p, out) {
    const r = p.radius * Math.pow(rng(), 0.6);
    const th = rng() * Math.PI * 2;
    const h = Math.max(0, 1 - (r / p.radius) ** 2) * p.radius * 0.5;
    out[0] = r * Math.cos(th);
    out[1] = h - p.radius * 0.2;
    out[2] = r * Math.sin(th);
  },
  waterfall(i, p, out) {
    const t = rng();
    const x = (rng() - 0.5) * p.radius * 0.3;
    const y = (t - 0.5) * p.radius * 1.5;
    const z = (rng() - 0.5) * p.radius * 0.2;
    out[0] = x;
    out[1] = y;
    out[2] = z;
  },
  river(i, p, out) {
    const t = rng();
    const x = (t - 0.5) * p.radius * 2;
    const z = Math.sin(t * Math.PI * 2) * p.radius * 0.3 + (rng() - 0.5) * p.radius * 0.2;
    const y = (rng() - 0.5) * p.radius * 0.1;
    out[0] = x;
    out[1] = y;
    out[2] = z;
  },
  // 41-60: abstract/mathematical
  lorenz(i, p, out) {
    const t = rng() * 100;
    const sigma = 10, rho = 28, beta = 8 / 3;
    let x = 0.1, y = 0, z = 0;
    for (let s = 0; s < Math.floor(t * 10); s++) {
      const dx = sigma * (y - x);
      const dy = x * (rho - z) - y;
      const dz = x * y - beta * z;
      x += dx * 0.01; y += dy * 0.01; z += dz * 0.01;
    }
    out[0] = x * p.radius * 0.1;
    out[1] = (z - 25) * p.radius * 0.1;
    out[2] = y * p.radius * 0.1;
  },
  strangeAttractor(i, p, out) {
    const t = rng() * 200;
    let x = 0.1, y = 0, z = 0;
    for (let s = 0; s < Math.floor(t * 5); s++) {
      const dx = -y - z;
      const dy = x - y;
      const dz = x - y;
      x += dx * 0.05; y += dy * 0.05; z += dz * 0.05;
    }
    out[0] = x * p.radius * 0.15;
    out[1] = y * p.radius * 0.15;
    out[2] = z * p.radius * 0.15;
  },
  julia(i, p, out) {
    const t = rng();
    const s = rng();
    const x = (t - 0.5) * p.radius * 2;
    const z = (s - 0.5) * p.radius * 2;
    let cx = x * 0.01, cy = z * 0.01;
    let val = 0;
    for (let iter = 0; iter < 20; iter++) {
      const tmp = cx * cx - cy * cy + x * 0.005;
      cy = 2 * cx * cy + z * 0.005;
      cx = tmp;
      val = Math.sqrt(cx * cx + cy * cy);
      if (val > 2) break;
    }
    out[0] = x;
    out[1] = val * p.radius * 0.3;
    out[2] = z;
  },
  mandelbrot(i, p, out) {
    const t = rng();
    const s = rng();
    const x = (t - 0.5) * p.radius * 2;
    const z = (s - 0.5) * p.radius * 2;
    let cx = x * 0.005, cy = z * 0.005;
    let val = 0;
    for (let iter = 0; iter < 30; iter++) {
      const tmp = cx * cx - cy * cy;
      cy = 2 * cx * cy;
      cx = tmp + x * 0.003;
      val = Math.sqrt(cx * cx + cy * cy);
      if (val > 2) break;
    }
    out[0] = x;
    out[1] = val * p.radius * 0.4;
    out[2] = z;
  },
  fourier(i, p, out) {
    const t = rng() * Math.PI * 2;
    const r = p.radius * 0.5;
    const x = r * (Math.cos(t) + 0.5 * Math.cos(2 * t) + 0.3 * Math.cos(3 * t));
    const y = r * (Math.sin(t) + 0.5 * Math.sin(2 * t) + 0.3 * Math.sin(3 * t));
    const z = r * 0.3 * Math.sin(5 * t);
    out[0] = x;
    out[1] = y * p.flatten;
    out[2] = z;
  },
  parametric(i, p, out) {
    const t = rng() * Math.PI * 2;
    const r = p.radius * 0.6;
    const a = 3, b = 2;
    out[0] = r * Math.cos(a * t) * Math.cos(b * t);
    out[1] = r * Math.sin(a * t) * Math.sin(b * t) * p.flatten;
    out[2] = r * Math.sin(a * t) * Math.cos(b * t);
  },
  implicit(i, p, out) {
    const r = p.radius * (0.5 + 0.5 * rng());
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    const x = r * Math.sin(ph) * Math.cos(th);
    const y = r * Math.sin(ph) * Math.sin(th);
    const z = r * Math.cos(ph);
    const f = Math.sin(x * 0.1) * Math.cos(y * 0.1) * Math.sin(z * 0.1);
    out[0] = x + f * 5;
    out[1] = y + f * 5 * p.flatten;
    out[2] = z + f * 5;
  },
  voronoi(i, p, out) {
    const t = rng();
    const s = rng();
    const x = (t - 0.5) * p.radius * 2;
    const z = (s - 0.5) * p.radius * 2;
    let minD = Infinity;
    for (let k = 0; k < 8; k++) {
      const px = Math.sin(k * 7.3) * p.radius * 0.5;
      const pz = Math.cos(k * 9.1) * p.radius * 0.5;
      const d = (x - px) ** 2 + (z - pz) ** 2;
      if (d < minD) minD = d;
    }
    out[0] = x;
    out[1] = Math.sqrt(minD) * 0.5;
    out[2] = z;
  },
  delaunay(i, p, out) {
    const t = rng();
    const s = rng();
    const x = (t - 0.5) * p.radius * 2;
    const z = (s - 0.5) * p.radius * 2;
    const y = Math.sin(x * 0.05) * Math.cos(z * 0.05) * p.radius * 0.3;
    out[0] = x;
    out[1] = y;
    out[2] = z;
  },
  // 61-80: cosmic/space
  nebula(i, p, out) {
    const r = p.radius * Math.pow(rng(), 1.5);
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    const density = Math.exp(-r / (p.radius * 0.3));
    if (rng() < density) {
      out[0] = r * Math.sin(ph) * Math.cos(th);
      out[1] = r * Math.sin(ph) * Math.sin(th) * p.flatten;
      out[2] = r * Math.cos(ph);
    } else {
      out[0] = (rng() - 0.5) * p.radius * 3;
      out[1] = (rng() - 0.5) * p.radius * 3;
      out[2] = (rng() - 0.5) * p.radius * 3;
    }
  },
  blackHole(i, p, out) {
    const r = p.radius * (0.3 + 0.7 * rng());
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    const diskR = p.radius * 0.8;
    const inDisk = Math.abs(r * Math.cos(ph)) < p.radius * 0.1;
    if (inDisk) {
      out[0] = r * Math.sin(ph) * Math.cos(th);
      out[1] = (rng() - 0.5) * p.radius * 0.05;
      out[2] = r * Math.sin(ph) * Math.sin(th);
    } else {
      out[0] = r * Math.sin(ph) * Math.cos(th);
      out[1] = r * Math.sin(ph) * Math.sin(th) * p.flatten;
      out[2] = r * Math.cos(ph);
    }
  },
  pulsar(i, p, out) {
    const t = rng() * Math.PI * 2;
    const r = p.radius * (0.2 + 0.8 * rng());
    const beam = Math.abs(Math.sin(t * 3));
    if (beam > 0.7) {
      out[0] = r * Math.cos(t);
      out[1] = r * Math.sin(t) * p.flatten;
      out[2] = (rng() - 0.5) * p.radius * 0.1;
    } else {
      const th = rng() * Math.PI * 2;
      const ph = Math.acos(2 * rng() - 1);
      out[0] = r * 0.3 * Math.sin(ph) * Math.cos(th);
      out[1] = r * 0.3 * Math.sin(ph) * Math.sin(th);
      out[2] = r * 0.3 * Math.cos(ph);
    }
  },
  wormhole(i, p, out) {
    const t = rng() * Math.PI * 2;
    const R = p.radius * 0.5;
    const r = p.tubeR * rng();
    const ph = rng() * Math.PI * 2;
    const twist = t * 2;
    out[0] = (R + r * Math.cos(ph)) * Math.cos(twist);
    out[1] = r * Math.sin(ph) * p.flatten;
    out[2] = (R + r * Math.cos(ph)) * Math.sin(twist);
  },
  galaxy(i, p, out) {
    const arm = i % 4;
    const t = Math.pow(rng(), 0.6);
    const angle = t * 8 + (arm / 4) * Math.PI * 2;
    const r = p.radius * t;
    const y = (rng() - 0.5) * p.radius * 0.1 * (1 - t);
    out[0] = r * Math.cos(angle);
    out[1] = y;
    out[2] = r * Math.sin(angle);
  },
  supernova(i, p, out) {
    const r = p.radius * Math.pow(rng(), 0.3);
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    const shell = Math.exp(-Math.abs(r - p.radius * 0.5) / (p.radius * 0.1));
    if (rng() < shell * 0.5 + 0.1) {
      out[0] = r * Math.sin(ph) * Math.cos(th);
      out[1] = r * Math.sin(ph) * Math.sin(th);
      out[2] = r * Math.cos(ph);
    } else {
      out[0] = (rng() - 0.5) * p.radius * 2;
      out[1] = (rng() - 0.5) * p.radius * 2;
      out[2] = (rng() - 0.5) * p.radius * 2;
    }
  },
  asteroid(i, p, out) {
    const r = p.radius * (0.3 + 0.7 * rng());
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    const wobble = 1 + 0.4 * Math.sin(th * 5) * Math.cos(ph * 3);
    out[0] = r * wobble * Math.sin(ph) * Math.cos(th);
    out[1] = r * wobble * Math.sin(ph) * Math.sin(th) * p.flatten;
    out[2] = r * wobble * Math.cos(ph);
  },
  comet(i, p, out) {
    const t = rng();
    const x = (t - 0.5) * p.radius * 2;
    const tailR = p.radius * 0.2 * (1 - t);
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    out[0] = x;
    out[1] = tailR * Math.sin(ph) * Math.cos(th);
    out[2] = tailR * Math.sin(ph) * Math.sin(th) + (rng() - 0.5) * p.radius * 0.1;
  },
  meteor(i, p, out) {
    const t = rng();
    const x = (t - 0.5) * p.radius * 2;
    const y = (rng() - 0.5) * p.radius * 0.5;
    const z = (rng() - 0.5) * p.radius * 0.5;
    out[0] = x;
    out[1] = y;
    out[2] = z;
  },
  satellite(i, p, out) {
    const t = rng() * Math.PI * 2;
    const R = p.radius * 0.6;
    const r = p.radius * 0.1 * rng();
    const ph = rng() * Math.PI * 2;
    out[0] = (R + r * Math.cos(ph)) * Math.cos(t);
    out[1] = r * Math.sin(ph) * p.flatten;
    out[2] = (R + r * Math.cos(ph)) * Math.sin(t);
  },
  // 81-100: architectural
  cathedral(i, p, out) {
    const t = rng();
    const x = (t - 0.5) * p.radius * 1.5;
    const z = (rng() - 0.5) * p.radius * 0.8;
    const height = Math.abs(Math.sin(x * 0.1)) * p.radius * 0.8;
    out[0] = x;
    out[1] = height * (1 - Math.abs(z) / (p.radius * 0.4));
    out[2] = z;
  },
  castle(i, p, out) {
    const t = rng();
    const x = (t - 0.5) * p.radius * 1.5;
    const z = (rng() - 0.5) * p.radius * 1.5;
    const tower = Math.sin(x * 0.2) * Math.cos(z * 0.2);
    const height = Math.max(0, tower) * p.radius * 0.6;
    out[0] = x;
    out[1] = height;
    out[2] = z;
  },
  bridge(i, p, out) {
    const t = rng();
    const x = (t - 0.5) * p.radius * 2;
    const arch = Math.sin(t * Math.PI) * p.radius * 0.3;
    out[0] = x;
    out[1] = arch;
    out[2] = (rng() - 0.5) * p.radius * 0.2;
  },
  tower(i, p, out) {
    const t = rng();
    const r = p.radius * 0.2 * (1 - t * 0.5);
    const th = rng() * Math.PI * 2;
    out[0] = r * Math.cos(th);
    out[1] = (t - 0.5) * p.radius * 1.5;
    out[2] = r * Math.sin(th);
  },
  dome(i, p, out) {
    const r = p.radius * 0.7;
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1) * 0.5;
    out[0] = r * Math.sin(ph) * Math.cos(th);
    out[1] = r * Math.cos(ph);
    out[2] = r * Math.sin(ph) * Math.sin(th);
  },
  arch(i, p, out) {
    const t = rng() * Math.PI;
    const R = p.radius * 0.6;
    out[0] = R * Math.cos(t);
    out[1] = R * Math.sin(t);
    out[2] = (rng() - 0.5) * p.radius * 0.3;
  },
  column(i, p, out) {
    const t = rng();
    const r = p.radius * 0.1;
    const th = rng() * Math.PI * 2;
    out[0] = r * Math.cos(th);
    out[1] = (t - 0.5) * p.radius * 1.5;
    out[2] = r * Math.sin(th);
  },
  facade(i, p, out) {
    const t = rng();
    const s = rng();
    const x = (t - 0.5) * p.radius * 2;
    const y = (s - 0.5) * p.radius * 1.5;
    const z = Math.abs(Math.sin(x * 0.1) * Math.cos(y * 0.1)) * p.radius * 0.2;
    out[0] = x;
    out[1] = y;
    out[2] = z;
  },
  spiralStaircase(i, p, out) {
    const t = rng();
    const angle = t * Math.PI * 8;
    const r = p.radius * 0.4;
    out[0] = r * Math.cos(angle);
    out[1] = (t - 0.5) * p.radius * 1.5;
    out[2] = r * Math.sin(angle);
  },
  labyrinth(i, p, out) {
    const t = rng();
    const s = rng();
    const x = (t - 0.5) * p.radius * 2;
    const z = (s - 0.5) * p.radius * 2;
    const wall = Math.sin(x * 0.2) * Math.cos(z * 0.2);
    out[0] = x;
    out[1] = Math.abs(wall) * p.radius * 0.3;
    out[2] = z;
  },
  // --- 101-300: extended procedural shapes ---
  doubleSpiral(i, p, out) {
    const t = (i % 1000) / 1000 * Math.PI * 4;
    const r = p.radius * (1 - (i % 1000) / 1000 * 0.5);
    out[0] = Math.cos(t) * r;
    out[1] = (i / 1000 - 0.5) * p.radius * 2;
    out[2] = Math.sin(t) * r;
  },
  tripleSpiral(i, p, out) {
    const arm = i % 3;
    const t = Math.floor(i / 3) / 333 * Math.PI * 6;
    const r = p.radius * (1 - Math.floor(i / 3) / 333 * 0.3);
    const angle = t + arm * (Math.PI * 2 / 3);
    out[0] = Math.cos(angle) * r;
    out[1] = (i / 1000 - 0.5) * p.radius * 1.5;
    out[2] = Math.sin(angle) * r;
  },
  torusKnot(i, p, out) {
    const t = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR;
    out[0] = (R + r * Math.cos(p.knotQ * t)) * Math.cos(p.knotP * t);
    out[1] = r * Math.sin(p.knotQ * t);
    out[2] = (R + r * Math.cos(p.knotQ * t)) * Math.sin(p.knotP * t);
  },
  hyperbolicSurface(i, p, out) {
    const u = (i % 100) / 100 * Math.PI * 2;
    const v = (Math.floor(i / 100) / 10 - 0.5) * 2;
    out[0] = p.radius * Math.cosh(v * 0.5) * Math.cos(u);
    out[1] = p.radius * Math.sinh(v * 0.5);
    out[2] = p.radius * Math.cosh(v * 0.5) * Math.sin(u);
  },
  parabolicSurface(i, p, out) {
    const u = (i % 100) / 100 * Math.PI * 2;
    const v = (Math.floor(i / 100) / 10 - 0.5) * 2;
    const r = Math.abs(v) * p.radius;
    out[0] = Math.cos(u) * r;
    out[1] = v * v * p.amp;
    out[2] = Math.sin(u) * r;
  },
  hexGrid(i, p, out) {
    const n = Math.floor(Math.sqrt(i));
    const row = Math.floor(n / 14);
    const col = n % 14;
    out[0] = (col - 7) * p.thickness * 1.5;
    out[1] = (col % 2) * p.thickness * 0.5;
    out[2] = (row - 7) * p.thickness * 1.3;
  },
  avalanche(i, p, out) {
    const t = i / 1000;
    const angle = t * Math.PI * 8;
    const r = p.radius * (1 - t * 0.8);
    out[0] = Math.cos(angle) * r;
    out[1] = t * p.radius * 3 - p.radius * 1.5;
    out[2] = Math.sin(angle) * r;
  },
  vortex(i, p, out) {
    const t = i / 1000;
    const angle = t * Math.PI * 10 + Math.sin(t * 5) * 0.5;
    const r = p.radius * (0.3 + t * 0.7);
    out[0] = Math.cos(angle) * r;
    out[1] = Math.sin(t * Math.PI * 3) * p.amp;
    out[2] = Math.sin(angle) * r;
  },
  logSpiral(i, p, out) {
    const t = (i / 1000) * Math.PI * 8;
    const r = p.radius * Math.exp(t * 0.1);
    out[0] = Math.cos(t) * r;
    out[1] = 0;
    out[2] = Math.sin(t) * r;
  },
  rose(i, p, out) {
    const t = (i / 1000) * Math.PI * 2;
    const r = p.radius * Math.cos(p.arms * t);
    out[0] = Math.cos(t) * r;
    out[1] = 0;
    out[2] = Math.sin(t) * r;
  },
  stepped(i, p, out) {
    const level = Math.floor(i / 100);
    const t = (i % 100) / 100 * Math.PI * 2;
    const r = p.radius * (1 - level * 0.1);
    out[0] = Math.cos(t) * r;
    out[1] = level * p.thickness;
    out[2] = Math.sin(t) * r;
  },
  doubleHelix(i, p, out) {
    const t = (i / 1000) * Math.PI * 4;
    const strand = i % 2;
    const angle = t + strand * Math.PI;
    const r = p.radius * 0.5;
    out[0] = Math.cos(angle) * r;
    out[1] = (i / 1000 - 0.5) * p.radius * 2;
    out[2] = Math.sin(angle) * r;
  },
  torusWave(i, p, out) {
    const u = (i % 100) / 100 * Math.PI * 2;
    const v = (Math.floor(i / 100) / 10) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR + Math.sin(u * 4) * p.amp * 0.3;
    out[0] = (R + r * Math.cos(v)) * Math.cos(u);
    out[1] = r * Math.sin(v);
    out[2] = (R + r * Math.cos(v)) * Math.sin(u);
  },
  sphereShell(i, p, out) {
    const r = p.radius;
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    out[0] = r * Math.sin(ph) * Math.cos(th);
    out[1] = r * Math.sin(ph) * Math.sin(th) * p.flatten;
    out[2] = r * Math.cos(ph);
  },
  fibonacciSphere(i, p, out) {
    const n = 1000;
    const idx = i % n;
    const phi = Math.acos(1 - 2 * (idx + 0.5) / n);
    const theta = Math.PI * (1 + Math.sqrt(5)) * idx;
    const r = p.radius * (0.9 + 0.1 * rng());
    out[0] = r * Math.sin(phi) * Math.cos(theta);
    out[1] = r * Math.sin(phi) * Math.sin(theta) * p.flatten;
    out[2] = r * Math.cos(phi);
  },
  sphereGrid(i, p, out) {
    const n = 32;
    const row = Math.floor(i / n) % n;
    const col = i % n;
    const ph = (row / (n - 1)) * Math.PI;
    const th = (col / n) * Math.PI * 2;
    out[0] = p.radius * Math.sin(ph) * Math.cos(th);
    out[1] = p.radius * Math.sin(ph) * Math.sin(th) * p.flatten;
    out[2] = p.radius * Math.cos(ph);
  },
  geodesic(i, p, out) {
    const r = p.radius * (0.85 + 0.15 * rng());
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    const snap = Math.round(th / (Math.PI / 6)) * (Math.PI / 6);
    out[0] = r * Math.sin(ph) * Math.cos(snap);
    out[1] = r * Math.sin(ph) * Math.sin(snap) * p.flatten;
    out[2] = r * Math.cos(ph);
  },
  icosphere(i, p, out) {
    const r = p.radius * (0.9 + 0.1 * rng());
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    const snap = Math.round(ph / (Math.PI / 8)) * (Math.PI / 8);
    out[0] = r * Math.sin(snap) * Math.cos(th);
    out[1] = r * Math.sin(snap) * Math.sin(th) * p.flatten;
    out[2] = r * Math.cos(snap);
  },
  ellipsoid(i, p, out) {
    const r = p.radius * (0.5 + 0.5 * rng());
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    out[0] = r * p.radius * 0.6 * Math.sin(ph) * Math.cos(th);
    out[1] = r * p.radius * 1.2 * Math.sin(ph) * Math.sin(th);
    out[2] = r * p.radius * 0.6 * Math.cos(ph);
  },
  oblateSphere(i, p, out) {
    const r = p.radius * (0.5 + 0.5 * rng());
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    out[0] = r * 1.5 * Math.sin(ph) * Math.cos(th);
    out[1] = r * 0.4 * Math.sin(ph) * Math.sin(th);
    out[2] = r * 1.5 * Math.cos(ph);
  },
  prolateSphere(i, p, out) {
    const r = p.radius * (0.5 + 0.5 * rng());
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    out[0] = r * 0.4 * Math.sin(ph) * Math.cos(th);
    out[1] = r * 2.0 * Math.sin(ph) * Math.sin(th);
    out[2] = r * 0.4 * Math.cos(ph);
  },
  sphereCap(i, p, out) {
    const r = p.radius;
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1) * 0.5;
    out[0] = r * Math.sin(ph) * Math.cos(th);
    out[1] = r * Math.cos(ph);
    out[2] = r * Math.sin(ph) * Math.sin(th);
  },
  sphereBand(i, p, out) {
    const r = p.radius;
    const th = rng() * Math.PI * 2;
    const ph = Math.PI / 2 + (rng() - 0.5) * 0.4;
    out[0] = r * Math.sin(ph) * Math.cos(th);
    out[1] = r * Math.sin(ph) * Math.sin(th) * p.flatten;
    out[2] = r * Math.cos(ph);
  },
  sphereSlice(i, p, out) {
    const r = p.radius * (0.5 + 0.5 * rng());
    const th = rng() * Math.PI;
    const ph = Math.acos(2 * rng() - 1);
    out[0] = r * Math.sin(ph) * Math.cos(th);
    out[1] = r * Math.sin(ph) * Math.sin(th) * p.flatten;
    out[2] = r * Math.cos(ph);
  },
  sphereCluster(i, p, out) {
    const ci = i % 5;
    const cth = (ci / 5) * Math.PI * 2;
    const cph = Math.acos(2 * ((ci * 0.618) % 1) - 1);
    const cR = p.radius * 0.5;
    const cx = cR * Math.sin(cph) * Math.cos(cth);
    const cy = cR * Math.sin(cph) * Math.sin(cth);
    const cz = cR * Math.cos(cph);
    const cr = p.radius * 0.25 * (0.3 + 0.7 * rng());
    const th = rng() * Math.PI * 2;
    const ph = Math.acos(2 * rng() - 1);
    out[0] = cx + cr * Math.sin(ph) * Math.cos(th);
    out[1] = cy + cr * Math.sin(ph) * Math.sin(th);
    out[2] = cz + cr * Math.cos(ph);
  },
  torusRibbon(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    out[0] = (R + r * Math.cos(u * 3)) * Math.cos(u);
    out[1] = r * Math.sin(u * 3);
    out[2] = (R + r * Math.cos(u * 3)) * Math.sin(u);
  },
  torusSpiral(i, p, out) {
    const t = (i / 1000) * Math.PI * 12;
    const R = p.radius;
    const r = p.tubeR * (0.3 + 0.7 * (i / 1000));
    out[0] = (R + r * Math.cos(t)) * Math.cos(t * 0.2);
    out[1] = r * Math.sin(t);
    out[2] = (R + r * Math.cos(t)) * Math.sin(t * 0.2);
  },
  torusGrid(i, p, out) {
    const n = 32;
    const u = ((i % n) / n) * Math.PI * 2;
    const v = (Math.floor(i / n) / n) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR;
    out[0] = (R + r * Math.cos(v)) * Math.cos(u);
    out[1] = r * Math.sin(v);
    out[2] = (R + r * Math.cos(v)) * Math.sin(u);
  },
  torusFlower(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.5 + 0.5 * Math.cos(u * p.arms));
    out[0] = (R + r * Math.cos(u * 2)) * Math.cos(u);
    out[1] = r * Math.sin(u * 2);
    out[2] = (R + r * Math.cos(u * 2)) * Math.sin(u);
  },
  torusPulse(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.5 + 0.5 * Math.sin(u * 4));
    out[0] = (R + r * Math.cos(u * 3)) * Math.cos(u);
    out[1] = r * Math.sin(u * 3);
    out[2] = (R + r * Math.cos(u * 3)) * Math.sin(u);
  },
  torusLattice(i, p, out) {
    const n = 24;
    const u = ((i % n) / n) * Math.PI * 2;
    const v = (Math.floor(i / n) % n / n) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.5 + 0.5 * Math.sin(v * 3) * Math.cos(u * 2));
    out[0] = (R + r * Math.cos(v)) * Math.cos(u);
    out[1] = r * Math.sin(v);
    out[2] = (R + r * Math.cos(v)) * Math.sin(u);
  },
  torusHelix(i, p, out) {
    const t = (i / 1000) * Math.PI * 8;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    out[0] = (R + r * Math.cos(t)) * Math.cos(t * 0.15);
    out[1] = r * Math.sin(t);
    out[2] = (R + r * Math.cos(t)) * Math.sin(t * 0.15);
  },
  torusVortex(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.3 + 0.7 * Math.abs(Math.sin(u * 2)));
    out[0] = (R + r * Math.cos(u * 5)) * Math.cos(u);
    out[1] = r * Math.sin(u * 5);
    out[2] = (R + r * Math.cos(u * 5)) * Math.sin(u);
  },
  torusRipple(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    const ripple = Math.sin(u * 8) * p.amp * 0.2;
    out[0] = (R + (r + ripple) * Math.cos(u * 3)) * Math.cos(u);
    out[1] = (r + ripple) * Math.sin(u * 3);
    out[2] = (R + (r + ripple) * Math.cos(u * 3)) * Math.sin(u);
  },
  torusCrown(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.5 + 0.5 * Math.cos(u * p.arms));
    out[0] = (R + r * Math.cos(u * 2)) * Math.cos(u);
    out[1] = r * Math.sin(u * 2) + p.amp * 0.3;
    out[2] = (R + r * Math.cos(u * 2)) * Math.sin(u);
  },
  torusRing(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.3 * rng();
    const ph = rng() * Math.PI * 2;
    out[0] = (R + r * Math.cos(ph)) * Math.cos(u);
    out[1] = r * Math.sin(ph);
    out[2] = (R + r * Math.cos(ph)) * Math.sin(u);
  },
  torusSpiral2(i, p, out) {
    const t = (i / 1000) * Math.PI * 16;
    const R = p.radius;
    const r = p.tubeR * (0.2 + 0.8 * (i / 1000));
    out[0] = (R + r * Math.cos(t)) * Math.cos(t * 0.1);
    out[1] = r * Math.sin(t);
    out[2] = (R + r * Math.cos(t)) * Math.sin(t * 0.1);
  },
  torusWave2(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    out[0] = (R + r * Math.cos(u * 6)) * Math.cos(u);
    out[1] = r * Math.sin(u * 6);
    out[2] = (R + r * Math.cos(u * 6)) * Math.sin(u);
  },
  torusBraid(i, p, out) {
    const t = (i / 1000) * Math.PI * 4;
    const R = p.radius;
    const r = p.tubeR * 0.4;
    const strand = i % 3;
    const angle = t + strand * (Math.PI * 2 / 3);
    out[0] = (R + r * Math.cos(angle)) * Math.cos(t * 0.25);
    out[1] = r * Math.sin(angle);
    out[2] = (R + r * Math.cos(angle)) * Math.sin(t * 0.25);
  },
  torusLattice2(i, p, out) {
    const n = 16;
    const u = ((i % n) / n) * Math.PI * 2;
    const v = (Math.floor(i / n) % n / n) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.3 + 0.7 * Math.sin(v * 5) * Math.cos(u * 3));
    out[0] = (R + r * Math.cos(v)) * Math.cos(u);
    out[1] = r * Math.sin(v);
    out[2] = (R + r * Math.cos(v)) * Math.sin(u);
  },
  torusFlower2(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.3 + 0.7 * Math.cos(u * p.arms * 2));
    out[0] = (R + r * Math.cos(u * 3)) * Math.cos(u);
    out[1] = r * Math.sin(u * 3);
    out[2] = (R + r * Math.cos(u * 3)) * Math.sin(u);
  },
  torusPulse2(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.3 + 0.7 * Math.sin(u * 6));
    out[0] = (R + r * Math.cos(u * 4)) * Math.cos(u);
    out[1] = r * Math.sin(u * 4);
    out[2] = (R + r * Math.cos(u * 4)) * Math.sin(u);
  },
  torusRipple2(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    const ripple = Math.sin(u * 12) * p.amp * 0.15;
    out[0] = (R + (r + ripple) * Math.cos(u * 5)) * Math.cos(u);
    out[1] = (r + ripple) * Math.sin(u * 5);
    out[2] = (R + (r + ripple) * Math.cos(u * 5)) * Math.sin(u);
  },
  torusCrown2(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.3 + 0.7 * Math.cos(u * p.arms * 2));
    out[0] = (R + r * Math.cos(u * 3)) * Math.cos(u);
    out[1] = r * Math.sin(u * 3) + p.amp * 0.2;
    out[2] = (R + r * Math.cos(u * 3)) * Math.sin(u);
  },
  torusRing2(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.2 * rng();
    const ph = rng() * Math.PI * 2;
    out[0] = (R + r * Math.cos(ph)) * Math.cos(u);
    out[1] = r * Math.sin(ph);
    out[2] = (R + r * Math.cos(ph)) * Math.sin(u);
  },
  torusSpiral3(i, p, out) {
    const t = (i / 1000) * Math.PI * 24;
    const R = p.radius;
    const r = p.tubeR * (0.1 + 0.9 * (i / 1000));
    out[0] = (R + r * Math.cos(t)) * Math.cos(t * 0.08);
    out[1] = r * Math.sin(t);
    out[2] = (R + r * Math.cos(t)) * Math.sin(t * 0.08);
  },
  torusWave3(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    out[0] = (R + r * Math.cos(u * 9)) * Math.cos(u);
    out[1] = r * Math.sin(u * 9);
    out[2] = (R + r * Math.cos(u * 9)) * Math.sin(u);
  },
  torusBraid2(i, p, out) {
    const t = (i / 1000) * Math.PI * 6;
    const R = p.radius;
    const r = p.tubeR * 0.3;
    const strand = i % 4;
    const angle = t + strand * (Math.PI * 2 / 4);
    out[0] = (R + r * Math.cos(angle)) * Math.cos(t * 0.2);
    out[1] = r * Math.sin(angle);
    out[2] = (R + r * Math.cos(angle)) * Math.sin(t * 0.2);
  },
  torusLattice3(i, p, out) {
    const n = 12;
    const u = ((i % n) / n) * Math.PI * 2;
    const v = (Math.floor(i / n) % n / n) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.2 + 0.8 * Math.sin(v * 7) * Math.cos(u * 4));
    out[0] = (R + r * Math.cos(v)) * Math.cos(u);
    out[1] = r * Math.sin(v);
    out[2] = (R + r * Math.cos(v)) * Math.sin(u);
  },
  torusFlower3(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.2 + 0.8 * Math.cos(u * p.arms * 3));
    out[0] = (R + r * Math.cos(u * 4)) * Math.cos(u);
    out[1] = r * Math.sin(u * 4);
    out[2] = (R + r * Math.cos(u * 4)) * Math.sin(u);
  },
  torusPulse3(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.2 + 0.8 * Math.sin(u * 8));
    out[0] = (R + r * Math.cos(u * 6)) * Math.cos(u);
    out[1] = r * Math.sin(u * 6);
    out[2] = (R + r * Math.cos(u * 6)) * Math.sin(u);
  },
  torusRipple3(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    const ripple = Math.sin(u * 16) * p.amp * 0.1;
    out[0] = (R + (r + ripple) * Math.cos(u * 7)) * Math.cos(u);
    out[1] = (r + ripple) * Math.sin(u * 7);
    out[2] = (R + (r + ripple) * Math.cos(u * 7)) * Math.sin(u);
  },
  torusCrown3(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.2 + 0.8 * Math.cos(u * p.arms * 3));
    out[0] = (R + r * Math.cos(u * 4)) * Math.cos(u);
    out[1] = r * Math.sin(u * 4) + p.amp * 0.15;
    out[2] = (R + r * Math.cos(u * 4)) * Math.sin(u);
  },
  torusRing3(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.15 * rng();
    const ph = rng() * Math.PI * 2;
    out[0] = (R + r * Math.cos(ph)) * Math.cos(u);
    out[1] = r * Math.sin(ph);
    out[2] = (R + r * Math.cos(ph)) * Math.sin(u);
  },
  torusSpiral4(i, p, out) {
    const t = (i / 1000) * Math.PI * 32;
    const R = p.radius;
    const r = p.tubeR * (0.05 + 0.95 * (i / 1000));
    out[0] = (R + r * Math.cos(t)) * Math.cos(t * 0.06);
    out[1] = r * Math.sin(t);
    out[2] = (R + r * Math.cos(t)) * Math.sin(t * 0.06);
  },
  torusWave4(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    out[0] = (R + r * Math.cos(u * 12)) * Math.cos(u);
    out[1] = r * Math.sin(u * 12);
    out[2] = (R + r * Math.cos(u * 12)) * Math.sin(u);
  },
  torusBraid3(i, p, out) {
    const t = (i / 1000) * Math.PI * 8;
    const R = p.radius;
    const r = p.tubeR * 0.25;
    const strand = i % 5;
    const angle = t + strand * (Math.PI * 2 / 5);
    out[0] = (R + r * Math.cos(angle)) * Math.cos(t * 0.15);
    out[1] = r * Math.sin(angle);
    out[2] = (R + r * Math.cos(angle)) * Math.sin(t * 0.15);
  },
  torusLattice4(i, p, out) {
    const n = 8;
    const u = ((i % n) / n) * Math.PI * 2;
    const v = (Math.floor(i / n) % n / n) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.1 + 0.9 * Math.sin(v * 9) * Math.cos(u * 5));
    out[0] = (R + r * Math.cos(v)) * Math.cos(u);
    out[1] = r * Math.sin(v);
    out[2] = (R + r * Math.cos(v)) * Math.sin(u);
  },
  torusFlower4(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.1 + 0.9 * Math.cos(u * p.arms * 4));
    out[0] = (R + r * Math.cos(u * 5)) * Math.cos(u);
    out[1] = r * Math.sin(u * 5);
    out[2] = (R + r * Math.cos(u * 5)) * Math.sin(u);
  },
  torusPulse4(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.1 + 0.9 * Math.sin(u * 10));
    out[0] = (R + r * Math.cos(u * 8)) * Math.cos(u);
    out[1] = r * Math.sin(u * 8);
    out[2] = (R + r * Math.cos(u * 8)) * Math.sin(u);
  },
  torusRipple4(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    const ripple = Math.sin(u * 20) * p.amp * 0.08;
    out[0] = (R + (r + ripple) * Math.cos(u * 9)) * Math.cos(u);
    out[1] = (r + ripple) * Math.sin(u * 9);
    out[2] = (R + (r + ripple) * Math.cos(u * 9)) * Math.sin(u);
  },
  torusCrown4(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.1 + 0.9 * Math.cos(u * p.arms * 4));
    out[0] = (R + r * Math.cos(u * 5)) * Math.cos(u);
    out[1] = r * Math.sin(u * 5) + p.amp * 0.1;
    out[2] = (R + r * Math.cos(u * 5)) * Math.sin(u);
  },
  torusRing4(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.1 * rng();
    const ph = rng() * Math.PI * 2;
    out[0] = (R + r * Math.cos(ph)) * Math.cos(u);
    out[1] = r * Math.sin(ph);
    out[2] = (R + r * Math.cos(ph)) * Math.sin(u);
  },
  torusSpiral5(i, p, out) {
    const t = (i / 1000) * Math.PI * 40;
    const R = p.radius;
    const r = p.tubeR * (0.02 + 0.98 * (i / 1000));
    out[0] = (R + r * Math.cos(t)) * Math.cos(t * 0.04);
    out[1] = r * Math.sin(t);
    out[2] = (R + r * Math.cos(t)) * Math.sin(t * 0.04);
  },
  torusWave5(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    out[0] = (R + r * Math.cos(u * 16)) * Math.cos(u);
    out[1] = r * Math.sin(u * 16);
    out[2] = (R + r * Math.cos(u * 16)) * Math.sin(u);
  },
  torusBraid4(i, p, out) {
    const t = (i / 1000) * Math.PI * 10;
    const R = p.radius;
    const r = p.tubeR * 0.2;
    const strand = i % 6;
    const angle = t + strand * (Math.PI * 2 / 6);
    out[0] = (R + r * Math.cos(angle)) * Math.cos(t * 0.12);
    out[1] = r * Math.sin(angle);
    out[2] = (R + r * Math.cos(angle)) * Math.sin(t * 0.12);
  },
  torusLattice5(i, p, out) {
    const n = 6;
    const u = ((i % n) / n) * Math.PI * 2;
    const v = (Math.floor(i / n) % n / n) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.05 + 0.95 * Math.sin(v * 11) * Math.cos(u * 6));
    out[0] = (R + r * Math.cos(v)) * Math.cos(u);
    out[1] = r * Math.sin(v);
    out[2] = (R + r * Math.cos(v)) * Math.sin(u);
  },
  torusFlower5(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.05 + 0.95 * Math.cos(u * p.arms * 5));
    out[0] = (R + r * Math.cos(u * 6)) * Math.cos(u);
    out[1] = r * Math.sin(u * 6);
    out[2] = (R + r * Math.cos(u * 6)) * Math.sin(u);
  },
  torusPulse5(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.05 + 0.95 * Math.sin(u * 12));
    out[0] = (R + r * Math.cos(u * 10)) * Math.cos(u);
    out[1] = r * Math.sin(u * 10);
    out[2] = (R + r * Math.cos(u * 10)) * Math.sin(u);
  },
  torusRipple5(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    const ripple = Math.sin(u * 24) * p.amp * 0.06;
    out[0] = (R + (r + ripple) * Math.cos(u * 11)) * Math.cos(u);
    out[1] = (r + ripple) * Math.sin(u * 11);
    out[2] = (R + (r + ripple) * Math.cos(u * 11)) * Math.sin(u);
  },
  torusCrown5(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.05 + 0.95 * Math.cos(u * p.arms * 5));
    out[0] = (R + r * Math.cos(u * 6)) * Math.cos(u);
    out[1] = r * Math.sin(u * 6) + p.amp * 0.08;
    out[2] = (R + r * Math.cos(u * 6)) * Math.sin(u);
  },
  torusRing5(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.08 * rng();
    const ph = rng() * Math.PI * 2;
    out[0] = (R + r * Math.cos(ph)) * Math.cos(u);
    out[1] = r * Math.sin(ph);
    out[2] = (R + r * Math.cos(ph)) * Math.sin(u);
  },
  torusSpiral6(i, p, out) {
    const t = (i / 1000) * Math.PI * 48;
    const R = p.radius;
    const r = p.tubeR * (0.01 + 0.99 * (i / 1000));
    out[0] = (R + r * Math.cos(t)) * Math.cos(t * 0.03);
    out[1] = r * Math.sin(t);
    out[2] = (R + r * Math.cos(t)) * Math.sin(t * 0.03);
  },
  torusWave6(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    out[0] = (R + r * Math.cos(u * 20)) * Math.cos(u);
    out[1] = r * Math.sin(u * 20);
    out[2] = (R + r * Math.cos(u * 20)) * Math.sin(u);
  },
  torusBraid5(i, p, out) {
    const t = (i / 1000) * Math.PI * 12;
    const R = p.radius;
    const r = p.tubeR * 0.15;
    const strand = i % 7;
    const angle = t + strand * (Math.PI * 2 / 7);
    out[0] = (R + r * Math.cos(angle)) * Math.cos(t * 0.1);
    out[1] = r * Math.sin(angle);
    out[2] = (R + r * Math.cos(angle)) * Math.sin(t * 0.1);
  },
  torusLattice6(i, p, out) {
    const n = 5;
    const u = ((i % n) / n) * Math.PI * 2;
    const v = (Math.floor(i / n) % n / n) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.02 + 0.98 * Math.sin(v * 13) * Math.cos(u * 7));
    out[0] = (R + r * Math.cos(v)) * Math.cos(u);
    out[1] = r * Math.sin(v);
    out[2] = (R + r * Math.cos(v)) * Math.sin(u);
  },
  torusFlower6(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.02 + 0.98 * Math.cos(u * p.arms * 6));
    out[0] = (R + r * Math.cos(u * 7)) * Math.cos(u);
    out[1] = r * Math.sin(u * 7);
    out[2] = (R + r * Math.cos(u * 7)) * Math.sin(u);
  },
  torusPulse6(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.02 + 0.98 * Math.sin(u * 14));
    out[0] = (R + r * Math.cos(u * 12)) * Math.cos(u);
    out[1] = r * Math.sin(u * 12);
    out[2] = (R + r * Math.cos(u * 12)) * Math.sin(u);
  },
  torusRipple6(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    const ripple = Math.sin(u * 28) * p.amp * 0.05;
    out[0] = (R + (r + ripple) * Math.cos(u * 13)) * Math.cos(u);
    out[1] = (r + ripple) * Math.sin(u * 13);
    out[2] = (R + (r + ripple) * Math.cos(u * 13)) * Math.sin(u);
  },
  torusCrown6(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.02 + 0.98 * Math.cos(u * p.arms * 6));
    out[0] = (R + r * Math.cos(u * 7)) * Math.cos(u);
    out[1] = r * Math.sin(u * 7) + p.amp * 0.06;
    out[2] = (R + r * Math.cos(u * 7)) * Math.sin(u);
  },
  torusRing6(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.06 * rng();
    const ph = rng() * Math.PI * 2;
    out[0] = (R + r * Math.cos(ph)) * Math.cos(u);
    out[1] = r * Math.sin(ph);
    out[2] = (R + r * Math.cos(ph)) * Math.sin(u);
  },
  torusSpiral7(i, p, out) {
    const t = (i / 1000) * Math.PI * 56;
    const R = p.radius;
    const r = p.tubeR * (0.005 + 0.995 * (i / 1000));
    out[0] = (R + r * Math.cos(t)) * Math.cos(t * 0.02);
    out[1] = r * Math.sin(t);
    out[2] = (R + r * Math.cos(t)) * Math.sin(t * 0.02);
  },
  torusWave7(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    out[0] = (R + r * Math.cos(u * 24)) * Math.cos(u);
    out[1] = r * Math.sin(u * 24);
    out[2] = (R + r * Math.cos(u * 24)) * Math.sin(u);
  },
  torusBraid6(i, p, out) {
    const t = (i / 1000) * Math.PI * 14;
    const R = p.radius;
    const r = p.tubeR * 0.12;
    const strand = i % 8;
    const angle = t + strand * (Math.PI * 2 / 8);
    out[0] = (R + r * Math.cos(angle)) * Math.cos(t * 0.08);
    out[1] = r * Math.sin(angle);
    out[2] = (R + r * Math.cos(angle)) * Math.sin(t * 0.08);
  },
  torusLattice7(i, p, out) {
    const n = 4;
    const u = ((i % n) / n) * Math.PI * 2;
    const v = (Math.floor(i / n) % n / n) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.01 + 0.99 * Math.sin(v * 15) * Math.cos(u * 8));
    out[0] = (R + r * Math.cos(v)) * Math.cos(u);
    out[1] = r * Math.sin(v);
    out[2] = (R + r * Math.cos(v)) * Math.sin(u);
  },
  torusFlower7(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.01 + 0.99 * Math.cos(u * p.arms * 7));
    out[0] = (R + r * Math.cos(u * 8)) * Math.cos(u);
    out[1] = r * Math.sin(u * 8);
    out[2] = (R + r * Math.cos(u * 8)) * Math.sin(u);
  },
  torusPulse7(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.01 + 0.99 * Math.sin(u * 16));
    out[0] = (R + r * Math.cos(u * 14)) * Math.cos(u);
    out[1] = r * Math.sin(u * 14);
    out[2] = (R + r * Math.cos(u * 14)) * Math.sin(u);
  },
  torusRipple7(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    const ripple = Math.sin(u * 32) * p.amp * 0.04;
    out[0] = (R + (r + ripple) * Math.cos(u * 15)) * Math.cos(u);
    out[1] = (r + ripple) * Math.sin(u * 15);
    out[2] = (R + (r + ripple) * Math.cos(u * 15)) * Math.sin(u);
  },
  torusCrown7(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.01 + 0.99 * Math.cos(u * p.arms * 7));
    out[0] = (R + r * Math.cos(u * 8)) * Math.cos(u);
    out[1] = r * Math.sin(u * 8) + p.amp * 0.05;
    out[2] = (R + r * Math.cos(u * 8)) * Math.sin(u);
  },
  torusRing7(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.05 * rng();
    const ph = rng() * Math.PI * 2;
    out[0] = (R + r * Math.cos(ph)) * Math.cos(u);
    out[1] = r * Math.sin(ph);
    out[2] = (R + r * Math.cos(ph)) * Math.sin(u);
  },
  torusSpiral8(i, p, out) {
    const t = (i / 1000) * Math.PI * 64;
    const R = p.radius;
    const r = p.tubeR * (0.002 + 0.998 * (i / 1000));
    out[0] = (R + r * Math.cos(t)) * Math.cos(t * 0.015);
    out[1] = r * Math.sin(t);
    out[2] = (R + r * Math.cos(t)) * Math.sin(t * 0.015);
  },
  torusWave8(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    out[0] = (R + r * Math.cos(u * 28)) * Math.cos(u);
    out[1] = r * Math.sin(u * 28);
    out[2] = (R + r * Math.cos(u * 28)) * Math.sin(u);
  },
  torusBraid7(i, p, out) {
    const t = (i / 1000) * Math.PI * 16;
    const R = p.radius;
    const r = p.tubeR * 0.1;
    const strand = i % 9;
    const angle = t + strand * (Math.PI * 2 / 9);
    out[0] = (R + r * Math.cos(angle)) * Math.cos(t * 0.06);
    out[1] = r * Math.sin(angle);
    out[2] = (R + r * Math.cos(angle)) * Math.sin(t * 0.06);
  },
  torusLattice8(i, p, out) {
    const n = 3;
    const u = ((i % n) / n) * Math.PI * 2;
    const v = (Math.floor(i / n) % n / n) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.005 + 0.995 * Math.sin(v * 17) * Math.cos(u * 9));
    out[0] = (R + r * Math.cos(v)) * Math.cos(u);
    out[1] = r * Math.sin(v);
    out[2] = (R + r * Math.cos(v)) * Math.sin(u);
  },
  torusFlower8(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.005 + 0.995 * Math.cos(u * p.arms * 8));
    out[0] = (R + r * Math.cos(u * 9)) * Math.cos(u);
    out[1] = r * Math.sin(u * 9);
    out[2] = (R + r * Math.cos(u * 9)) * Math.sin(u);
  },
  torusPulse8(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.005 + 0.995 * Math.sin(u * 18));
    out[0] = (R + r * Math.cos(u * 16)) * Math.cos(u);
    out[1] = r * Math.sin(u * 16);
    out[2] = (R + r * Math.cos(u * 16)) * Math.sin(u);
  },
  torusRipple8(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    const ripple = Math.sin(u * 36) * p.amp * 0.03;
    out[0] = (R + (r + ripple) * Math.cos(u * 17)) * Math.cos(u);
    out[1] = (r + ripple) * Math.sin(u * 17);
    out[2] = (R + (r + ripple) * Math.cos(u * 17)) * Math.sin(u);
  },
  torusCrown8(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.005 + 0.995 * Math.cos(u * p.arms * 8));
    out[0] = (R + r * Math.cos(u * 9)) * Math.cos(u);
    out[1] = r * Math.sin(u * 9) + p.amp * 0.04;
    out[2] = (R + r * Math.cos(u * 9)) * Math.sin(u);
  },
  torusRing8(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.04 * rng();
    const ph = rng() * Math.PI * 2;
    out[0] = (R + r * Math.cos(ph)) * Math.cos(u);
    out[1] = r * Math.sin(ph);
    out[2] = (R + r * Math.cos(ph)) * Math.sin(u);
  },
  torusSpiral9(i, p, out) {
    const t = (i / 1000) * Math.PI * 72;
    const R = p.radius;
    const r = p.tubeR * (0.001 + 0.999 * (i / 1000));
    out[0] = (R + r * Math.cos(t)) * Math.cos(t * 0.012);
    out[1] = r * Math.sin(t);
    out[2] = (R + r * Math.cos(t)) * Math.sin(t * 0.012);
  },
  torusWave9(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    out[0] = (R + r * Math.cos(u * 32)) * Math.cos(u);
    out[1] = r * Math.sin(u * 32);
    out[2] = (R + r * Math.cos(u * 32)) * Math.sin(u);
  },
  torusBraid8(i, p, out) {
    const t = (i / 1000) * Math.PI * 18;
    const R = p.radius;
    const r = p.tubeR * 0.08;
    const strand = i % 10;
    const angle = t + strand * (Math.PI * 2 / 10);
    out[0] = (R + r * Math.cos(angle)) * Math.cos(t * 0.05);
    out[1] = r * Math.sin(angle);
    out[2] = (R + r * Math.cos(angle)) * Math.sin(t * 0.05);
  },
  torusLattice9(i, p, out) {
    const n = 2;
    const u = ((i % n) / n) * Math.PI * 2;
    const v = (Math.floor(i / n) % n / n) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.002 + 0.998 * Math.sin(v * 19) * Math.cos(u * 10));
    out[0] = (R + r * Math.cos(v)) * Math.cos(u);
    out[1] = r * Math.sin(v);
    out[2] = (R + r * Math.cos(v)) * Math.sin(u);
  },
  torusFlower9(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.002 + 0.998 * Math.cos(u * p.arms * 9));
    out[0] = (R + r * Math.cos(u * 10)) * Math.cos(u);
    out[1] = r * Math.sin(u * 10);
    out[2] = (R + r * Math.cos(u * 10)) * Math.sin(u);
  },
  torusPulse9(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.002 + 0.998 * Math.sin(u * 20));
    out[0] = (R + r * Math.cos(u * 18)) * Math.cos(u);
    out[1] = r * Math.sin(u * 18);
    out[2] = (R + r * Math.cos(u * 18)) * Math.sin(u);
  },
  torusRipple9(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    const ripple = Math.sin(u * 40) * p.amp * 0.02;
    out[0] = (R + (r + ripple) * Math.cos(u * 19)) * Math.cos(u);
    out[1] = (r + ripple) * Math.sin(u * 19);
    out[2] = (R + (r + ripple) * Math.cos(u * 19)) * Math.sin(u);
  },
  torusCrown9(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * (0.002 + 0.998 * Math.cos(u * p.arms * 9));
    out[0] = (R + r * Math.cos(u * 10)) * Math.cos(u);
    out[1] = r * Math.sin(u * 10) + p.amp * 0.03;
    out[2] = (R + r * Math.cos(u * 10)) * Math.sin(u);
  },
  torusRing9(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.03 * rng();
    const ph = rng() * Math.PI * 2;
    out[0] = (R + r * Math.cos(ph)) * Math.cos(u);
    out[1] = r * Math.sin(ph);
    out[2] = (R + r * Math.cos(ph)) * Math.sin(u);
  },
  torusSpiral10(i, p, out) {
    const t = (i / 1000) * Math.PI * 80;
    const R = p.radius;
    const r = p.tubeR * (0.0005 + 0.9995 * (i / 1000));
    out[0] = (R + r * Math.cos(t)) * Math.cos(t * 0.01);
    out[1] = r * Math.sin(t);
    out[2] = (R + r * Math.cos(t)) * Math.sin(t * 0.01);
  },
  torusWave10(i, p, out) {
    const u = (i / 1000) * Math.PI * 2;
    const R = p.radius;
    const r = p.tubeR * 0.5;
    out[0] = (R + r * Math.cos(u * 36)) * Math.cos(u);
    out[1] = r * Math.sin(u * 36);
    out[2] = (R + r * Math.cos(u * 36)) * Math.sin(u);
  },
};
