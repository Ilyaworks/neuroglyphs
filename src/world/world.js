import * as THREE from "three";
import { mulberry32, strToSeed } from "../core/rng.js";
import { decodeSeed, randomSeed } from "../core/seed.js";
import { buildGlyphAtlas } from "../core/atlas.js";
import { buildFieldGeometry } from "./fieldGeometry.js";
import { buildFieldMaterial } from "./fieldMaterial.js";
import { LAYOUTS } from "./layouts/index.js";

const FIELD_RADIUS = 400;
const STAR_RADIUS = 2200;

function resolveSeed() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("seed");
  if (fromUrl && decodeSeed(fromUrl)) return fromUrl.toUpperCase();
  const rng = mulberry32(strToSeed(String(Date.now())));
  const code = randomSeed(rng);
  params.set("seed", code);
  history.replaceState(null, "", location.pathname + "?" + params.toString());
  return code;
}

export function createWorld(seedCode) {
  const code = decodeSeed(seedCode) ? seedCode : resolveSeed();
  const fields = decodeSeed(code);
  const rng = fields.rng;
  const group = new THREE.Group();

  const density = 1500 + fields.density * 2000;
  const atlas = buildGlyphAtlas();

  // Мир строится не сферой, а раскладкой из сида: восемь структур, по три бита сида.
  // Раскладка получает тот же поток rng, поэтому один сид даёт один мир побайтово.
  const structure = fields.structure % LAYOUTS.length;
  const layout = LAYOUTS[structure](rng, { target: density, extent: FIELD_RADIUS });
  const points = layout.positions;
  const count = layout.count;

  // Габарит нужен камере и дальнему плану: у раскладок он разный, сфера тут не подходит.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      const v = points[i * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  const bounds = count > 0
    ? { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] }
    : { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };

  const { geometry, ready } = buildFieldGeometry(count, (i, out) => {
    out[0] = points[i * 3];
    out[1] = points[i * 3 + 1];
    out[2] = points[i * 3 + 2];
  });

  const { material, uniforms } = buildFieldMaterial(atlas);
  const field = new THREE.Points(geometry, material);
  group.add(field);

  // Дальний план живёт на своём потоке случайности: иначе он зависит от того, сколько
  // чисел израсходовала раскладка, и меняется при любой правке структуры мира.
  const starRng = mulberry32(strToSeed(code + ":stars"));
  const starCount = 2000;
  const starPos = new Float32Array(starCount * 3);
  const starGlyph = new Float32Array(starCount);
  const starSize = new Float32Array(starCount);
  const starOff = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const u = starRng() * 2 - 1;
    const v = starRng() * 2 - 1;
    const w = starRng() * 2 - 1;
    const len = Math.hypot(u, v, w) || 1;
    starPos[i * 3] = (u / len) * STAR_RADIUS;
    starPos[i * 3 + 1] = (v / len) * STAR_RADIUS;
    starPos[i * 3 + 2] = (w / len) * STAR_RADIUS;
    starGlyph[i] = Math.floor(starRng() * 128);
    starSize[i] = 14 + starRng() * 22;
    starOff[i] = starRng();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute("glyph", new THREE.BufferAttribute(starGlyph, 1));
  starGeo.setAttribute("size", new THREE.BufferAttribute(starSize, 1));
  starGeo.setAttribute("offset", new THREE.BufferAttribute(starOff, 1));
  starGeo.computeBoundingSphere();
  const { material: starMat } = buildFieldMaterial(atlas, { fogDensity: 0 });
  starMat.uniforms.uPulse = uniforms.uPulse;
  starMat.uniforms.uTime = uniforms.uTime;
  const stars = new THREE.Points(starGeo, starMat);
  group.add(stars);

  group.userData = { seed: code, structure, bounds };

  group.traverse((o) => {
    if (o.isPoints) {
      o.frustumCulled = false;
    }
  });

  let disposed = false;
  return {
    group,
    ready,
    uniforms,
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      starGeo.dispose();
      material.dispose();
      starMat.dispose();
    },
  };
}
