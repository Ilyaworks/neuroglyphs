// Облако точек по готовой раскладке поверхности.
//
// surface.js считает числа и ничего не знает про three; здесь из этих чисел собирается
// то, что видно на экране. Разделение не ради красоты: раскладку так можно мерить без
// браузера, а гейт surface-check работает на числах, а не на скриншоте.
import * as THREE from "three";
import { buildFieldMaterial } from "./fieldMaterial.js";
import { buildSurface } from "./surface.js";
import { MARK_KINDS } from "./marks.js";

export function buildSurfaceField(seedCode, spec, atlas, opts = {}) {
  const s = buildSurface(seedCode, spec, opts);

  const offset = new Float32Array(s.count);
  for (let i = 0; i < s.count; i++) {
    // Цвет знака держится за его род: эмблемы одного цвета, строки другого. Случайный
    // цвет на точку размывает знак в кашу — на поверхности рисунок обязан читаться.
    offset[i] = ((s.kind[i] % 4) + 0.5) / 4;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(s.positions, 3));
  geometry.setAttribute("glyph", new THREE.BufferAttribute(s.glyph, 1));
  geometry.setAttribute("size", new THREE.BufferAttribute(s.dot, 1));
  geometry.setAttribute("offset", new THREE.BufferAttribute(offset, 1));
  geometry.computeBoundingSphere();

  const { material, uniforms } = buildFieldMaterial(atlas, opts);
  if (opts.spectrum) {
    material.uniforms.uSpectrum.value = opts.spectrum.map((c) => new THREE.Color(c));
  }

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.userData.surface = {
    type: spec.type,
    count: s.count,
    kinds: [...new Set(Array.from(s.kind))].map((k) => MARK_KINDS[k]),
  };

  return { points, geometry, material, uniforms, data: s };
}
