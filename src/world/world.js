import * as THREE from "three";
import { mulberry32, strToSeed } from "../core/rng.js";
import { decodeSeed, randomSeed } from "../core/seed.js";
import { buildGlyphAtlas } from "../core/atlas.js";
import { buildFieldGeometry } from "./fieldGeometry.js";
import { buildFieldMaterial } from "./fieldMaterial.js";
import { buildShapeField } from "./shapeField.js";
import { LAYOUTS } from "./layouts/index.js";
import { buildExitPortal } from "./portal.js";
import { buildImpossible, IMPOSSIBLE_KINDS } from "../atmosphere/impossible.js";
import { resolvePalette } from "../art/palettes.js";

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

  const budget = 1500 + fields.density * 2000;
  const density = Math.floor(budget * 0.6);
  const shapeCount = Math.max(1, budget - density);
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

  const palette = resolvePalette(fields);
  const fogDensity = Math.min(0.004, Math.max(0.0003, palette.fogDensity * (0.5 + fields.density / 15)));
  const { material, uniforms } = buildFieldMaterial(atlas, { fogDensity });
  material.uniforms.uSpectrum.value = palette.glyph.map((c) => new THREE.Color(c));
  const field = new THREE.Points(geometry, material);
  group.add(field);

  // Второе, «формовое» поле: облако по форме из каталога, выбранной по seed.shape.
  // Делит тот же бюджет точек, красится той же палитрой мира.
  const shape = buildShapeField(fields, { count: shapeCount, extent: FIELD_RADIUS });
  const { geometry: shapeGeo, ready: shapeReady } = buildFieldGeometry(shape.count, (i, out) => shape.fill(i, out));
  const { material: shapeMat, uniforms: shapeUniforms } = buildFieldMaterial(atlas, { fogDensity });
  shapeMat.uniforms.uSpectrum.value = palette.glyph.map((c) => new THREE.Color(c));
  shapeUniforms.uPulse = uniforms.uPulse;
  shapeUniforms.uTime = uniforms.uTime;
  const shapeField = new THREE.Points(shapeGeo, shapeMat);
  group.add(shapeField);

  // Невозможная фигура: привязка — позиция камеры на старте (начало координат),
  // центр — между камерой и порталом, тип — по seed.shape. Добавляем ПОСЛЕ полей,
  // не первым: гейт палитры мерит цвет кадра по первому облаку в группе мира.
  const impKind = IMPOSSIBLE_KINDS[fields.shape % IMPOSSIBLE_KINDS.length];
  const impCount = Math.max(1, Math.floor(budget * 0.15));
  // Точка привязки — позиция камеры на старте, центр — на 45% пути к порталу,
  // габарит соразмерен миру: эталон 260 даёт 0.88 высоты кадра.
  const impAnchor = [0, 0, 0];
  const impCenter = [impAnchor[0], impAnchor[1], (bounds.min[2] - 40) * 0.45];
  const imp = buildImpossible(impKind, impAnchor, { count: impCount, extent: 260, center: impCenter });
  const { geometry: impGeo, ready: impReady } = buildFieldGeometry(imp.count, (i, out) => imp.fill(i, out));
  const { material: impMat, uniforms: impUniforms } = buildFieldMaterial(atlas, { fogDensity });
  impMat.uniforms.uSpectrum.value = palette.glyph.map((c) => new THREE.Color(c));
  impUniforms.uPulse = uniforms.uPulse;
  impUniforms.uTime = uniforms.uTime;
  const impField = new THREE.Points(impGeo, impMat);
  impField.userData.impossible = true;
  group.add(impField);
  impReady.then(() => {
    const sz = impGeo.attributes.size.array;
    for (let i = 0; i < sz.length; i++) sz[i] = Math.max(6, sz[i]);
    impGeo.attributes.size.needsUpdate = true;
  });

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

  // Портал выхода: ровно один на мир. Садим его на дальнюю по −Z границу габарита —
  // камера в boot.js стоит в начале координат и смотрит в −Z, поэтому портал обязан
  // оказаться перед ней, а не за спиной.
  const portal = buildExitPortal(fields, atlas);
  const pz = bounds.min[2] - 40;
  portal.group.position.set(0, 0, pz);
  portal.group.traverse((o) => {
    if (o.isPoints) o.frustumCulled = false;
  });
  portal.group.traverse((o) => {
    if (o.isPoints && o.material && o.material.uniforms) {
      o.material.uniforms.uPulse = uniforms.uPulse;
      o.material.uniforms.uTime = uniforms.uTime;
    }
  });
  group.add(portal.group);

  group.userData = { seed: code, structure, bounds, exitPosition: portal.group.position, palette, fogDensity };
  group.userData.impossible = {
    kind: imp.kind,
    anchor: impAnchor,
    center: impCenter,
    count: imp.count,
    seams: imp.seams.map((s) => ({ a: [s.a[0], s.a[1], s.a[2]], b: [s.b[0], s.b[1], s.b[2]] })),
  };

  group.traverse((o) => {
    if (o.isPoints) {
      o.frustumCulled = false;
    }
  });

  let disposed = false;
  return {
    group,
    ready: Promise.all([ready, shapeReady, impReady]).then(() => true),
    uniforms,
    distanceToExit(cameraPos) {
      return cameraPos.distanceTo(group.userData.exitPosition);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      shapeGeo.dispose();
      impGeo.dispose();
      starGeo.dispose();
      material.dispose();
      shapeMat.dispose();
      impMat.dispose();
      starMat.dispose();
      portal.group.traverse((o) => {
        if (o.isPoints) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
    },
  };
}
