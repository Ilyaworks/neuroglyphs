const CHUNK = 20000;

export function buildFieldGeometry(count, fill) {
  const positions = new Float32Array(count * 3);
  const glyphs = new Float32Array(count);
  const sizes = new Float32Array(count);
  const offsets = new Float32Array(count);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('glyph', new THREE.BufferAttribute(glyphs, 1));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 1));

  let done = 0;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });

  function step() {
    const end = Math.min(done + CHUNK, count);
    const out = [0, 0, 0];
    for (let i = done; i < end; i++) {
      fill(i, out);
      positions[i * 3] = out[0];
      positions[i * 3 + 1] = out[1];
      positions[i * 3 + 2] = out[2];
    }
    done = end;
    geometry.attributes.position.needsUpdate = true;
    if (done < count) {
      requestAnimationFrame(step);
    } else {
      resolveReady();
    }
  }

  if (count > 0) {
    requestAnimationFrame(step);
  } else {
    resolveReady();
  }

  return { geometry, ready };
}
