import * as THREE from "three";
import { mulberry32, strToSeed } from "../core/rng.js";
import { decodeSeed, randomSeed } from "../core/seed.js";
import { buildGlyphAtlas } from "../core/atlas.js";
import { buildFieldGeometry } from "./fieldGeometry.js";
import { buildFieldMaterial } from "./fieldMaterial.js";

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
  const fields = decodeSeed(seedCode) || decodeSeed(resolveSeed());
  const rng = fields.rng;
  const group = new THREE.Group();

  const density = 1500 + fields.density * 2000;
  const atlas = buildGlyphAtlas();
  const { geometry, ready } = buildFieldGeometry(density, (i, out) => {
    const u = rng() * 2 - 1;
    const v = rng() * 2 - 1;
    const w = rng() * 2 - 1;
    const len = Math.hypot(u, v, w) || 1;
    const rad = FIELD_RADIUS * Math.cbrt(rng());
    out[0] = (u / len) * rad;
    out[1] = (v / len) * rad;
    out[2] = (w / len) * rad;
  });

  const { material, uniforms } = buildFieldMaterial(atlas);
  const field = new THREE.Points(geometry, material);
  group.add(field);

  const starCount = 2000;
  const starPos = new Float32Array(starCount * 3);
  const starGlyph = new Float32Array(starCount);
  const starSize = new Float32Array(starCount);
  const starOff = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const u = rng() * 2 - 1;
    const v = rng() * 2 - 1;
    const w = rng() * 2 - 1;
    const len = Math.hypot(u, v, w) || 1;
    starPos[i * 3] = (u / len) * STAR_RADIUS;
    starPos[i * 3 + 1] = (v / len) * STAR_RADIUS;
    starPos[i * 3 + 2] = (w / len) * STAR_RADIUS;
    starGlyph[i] = Math.floor(rng() * 128);
    starSize[i] = 1 + rng() * 3;
    starOff[i] = rng();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute("glyph", new THREE.BufferAttribute(starGlyph, 1));
  starGeo.setAttribute("size", new THREE.BufferAttribute(starSize, 1));
  starGeo.setAttribute("offset", new THREE.BufferAttribute(starOff, 1));
  starGeo.computeBoundingSphere();
  const { material: starMat } = buildFieldMaterial(atlas);
  const stars = new THREE.Points(starGeo, starMat);
  group.add(stars);

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
