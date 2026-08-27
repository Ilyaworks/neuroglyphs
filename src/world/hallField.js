// Зал на экране: из чисел halls.js собираются облака точек.
//
// Колонны и арки — это ОДИН элемент языка, повторённый грамматикой. Поэтому вариация
// строится один раз на всю аркаду, а копии отличаются только местом, размером и
// разворотом: так аркада и читается аркадой, а не рядом разных предметов.
import * as THREE from "three";
import { mulberry32, strToSeed } from "../core/rng.js";
import { buildFieldMaterial } from "./fieldMaterial.js";
import { buildSurfaceField } from "./surfaceField.js";

// Точка элемента в мире: своё растяжение, свой размер, свой разворот, своё место.
// Порядок именно такой — растянуть, увеличить, повернуть, поставить.
// lift — насколько поднять элемент, чтобы он СТОЯЛ НА ПОЛУ. У кольца, ромба и купола
// начало координат в середине, и без подъёма половина колонны уходит под пол.
function placePoint(local, place, out, lift) {
  const st = place.stretch || [1, 1, 1];
  const x = local[0] * st[0] * place.scale;
  const y = (local[1] - (lift || 0)) * st[1] * place.scale;
  const z = local[2] * st[2] * place.scale;
  const t = place.turn || 0;
  const c = Math.cos(t), s = Math.sin(t);
  out[0] = place.at[0] + x * c - z * s;
  out[1] = place.at[1] + y;
  out[2] = place.at[2] + x * s + z * c;
  return out;
}

function lowestOf(variant, samples = 200) {
  const out = [0, 0, 0];
  let lo = Infinity;
  const step = Math.max(1, Math.floor(variant.count / samples));
  for (let i = 0; i < variant.count; i += step) { variant.fill(i, out); if (out[1] < lo) lo = out[1]; }
  return Number.isFinite(lo) ? lo : 0;
}

function cloudOf(variant, places, glyphs, dot, rng) {
  const lift = lowestOf(variant);
  const per = variant.count;
  const total = per * places.length;
  const pos = new Float32Array(total * 3);
  const gl = new Float32Array(total);
  const sz = new Float32Array(total);
  const off = new Float32Array(total);
  const local = [0, 0, 0], world = [0, 0, 0];
  let w = 0;
  for (let pi = 0; pi < places.length; pi++) {
    const place = places[pi];
    for (let i = 0; i < per; i++) {
      variant.fill(i, local);
      placePoint(local, place, world, lift);
      pos[w * 3] = world[0]; pos[w * 3 + 1] = world[1]; pos[w * 3 + 2] = world[2];
      gl[w] = glyphs[(w * 7 + pi) % glyphs.length];
      sz[w] = dot * place.scale;
      off[w] = rng();
      w++;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("glyph", new THREE.BufferAttribute(gl, 1));
  geo.setAttribute("size", new THREE.BufferAttribute(sz, 1));
  geo.setAttribute("offset", new THREE.BufferAttribute(off, 1));
  geo.computeBoundingSphere();
  return geo;
}

export function buildHallField(hall, language, atlas, opts = {}) {
  const rng = mulberry32(strToSeed(String(opts.seed || "hall") + ":hallfield"));
  const group = new THREE.Group();
  const parts = [];
  const spectrum = opts.spectrum;
  const fogDensity = opts.fogDensity;

  const mk = (geo, name) => {
    const { material, uniforms } = buildFieldMaterial(atlas, { fogDensity });
    if (spectrum) material.uniforms.uSpectrum.value = spectrum.map((c) => new THREE.Color(c));
    if (opts.uPulse) uniforms.uPulse = opts.uPulse;
    if (opts.uTime) uniforms.uTime = opts.uTime;
    const pts = new THREE.Points(geo, material);
    pts.frustumCulled = false;
    pts.userData.hallPart = name;
    group.add(pts);
    parts.push({ points: pts, geometry: geo, material });
    return pts;
  };

  const glyphs = (language && language.glyphs) || [0, 1, 2, 3];

  // Колонны: одна вариация на всю аркаду.
  if (hall.columns.length) {
    const v = language.variantOf(hall.forms.column, mulberry32(strToSeed(String(opts.seed) + ":col")));
    mk(cloudOf(v, hall.columns, glyphs, 2.4, rng), "columns");
  }
  // Арки поверх колонн.
  if (hall.arches.length) {
    const v = language.variantOf(hall.forms.span, mulberry32(strToSeed(String(opts.seed) + ":span")));
    mk(cloudOf(v, hall.arches, glyphs, 2.4, rng), "arches");
  }

  // Поверхности: сфера, стены, пол. Их покрывает marks.js через surface.js.
  const surfaces = [];
  for (let i = 0; i < hall.surfaces.length; i++) {
    const item = hall.surfaces[i];
    const built = buildSurfaceField(String(opts.seed) + ":hall:" + item.role + i, item.spec, atlas, {
      marks: item.marks,
      language,
      fogDensity,
      spectrum,
      salt: item.role + i,
    });
    if (opts.uPulse) built.uniforms.uPulse = opts.uPulse;
    if (opts.uTime) built.uniforms.uTime = opts.uTime;
    built.points.userData.hallPart = item.role;
    group.add(built.points);
    surfaces.push(built);
    parts.push(built);
  }

  group.userData.hall = {
    eye: hall.eye,
    axis: hall.axis,
    floorY: hall.floorY,
    bounds: hall.bounds,
    forms: hall.forms,
  };

  return {
    group,
    parts,
    dispose() {
      for (const p of parts) {
        if (p.geometry) p.geometry.dispose();
        if (p.material) p.material.dispose();
      }
    },
  };
}
