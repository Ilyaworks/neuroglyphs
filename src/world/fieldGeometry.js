import * as THREE from "three";
import { mulberry32 } from "../core/rng.js";

const CHUNK = 20000;

export function buildFieldGeometry(count, fill) {
  const positions = new Float32Array(count * 3);
  const glyphs = new Float32Array(count);
  const sizes = new Float32Array(count);
  const offsets = new Float32Array(count);
  const rng = mulberry32(0x9e3779b9);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('glyph', new THREE.BufferAttribute(glyphs, 1));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 1));

  let done = 0;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  function step() {
    const end = Math.min(done + CHUNK, count);
    const out = [0, 0, 0];
    try {
      for (let i = done; i < end; i++) {
        fill(i, out);
        positions[i * 3] = out[0];
        positions[i * 3 + 1] = out[1];
        positions[i * 3 + 2] = out[2];
        glyphs[i] = Math.floor(rng() * 128);
        sizes[i] = 1 + rng() * 9;
        offsets[i] = rng();
      }
    } catch (err) {
      rejectReady(err);
      return;
    }
    done = end;
    geometry.attributes.position.needsUpdate = true;
    if (done < count) {
      requestAnimationFrame(step);
    } else {
      geometry.attributes.glyph.needsUpdate = true;
      geometry.attributes.size.needsUpdate = true;
      geometry.attributes.offset.needsUpdate = true;
      geometry.computeBoundingSphere();
      resolveReady();
    }
  }

  if (count > 0) {
    requestAnimationFrame(step);
  } else {
    geometry.computeBoundingSphere();
    resolveReady();
  }

  return { geometry, ready };
}
