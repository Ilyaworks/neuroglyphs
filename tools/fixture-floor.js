// Эталон отражающего пола: заведомо правильная реализация контракта N29.
// Нужен, чтобы у tools/floor-check.mjs было на чём быть зелёным — инструмент,
// который не проходит ни на чём, ничего не проверяет.
//
//   node tools/floor-check.mjs --mod tools/fixture-floor.js               -> FLOOR_OK
//   node tools/floor-check.mjs --mod tools/fixture-floor.js --mutate copy -> ПРОВАЛ
//
// Мутации живут здесь же, в globalThis.__FLOOR_MUTATE: гейт обязан краснеть на
// каждом правдоподобном способе сдать задачу так, чтобы пол не работал.
import * as THREE from "three";
import { mulberry32, strToSeed } from "../src/core/rng.js";

const mut = () => String(globalThis.__FLOOR_MUTATE || "");

const VERTEX = /* glsl */ `
  attribute float glyph;
  attribute float size;
  attribute float offset;
  attribute float fade;
  uniform float uPulse;
  varying float vFade;
  varying float vGlyph;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(size * (1.0 + 0.5 * uPulse) * (300.0 / -mv.z), 64.0);
    gl_Position = projectionMatrix * mv;
    vFade = fade;
    vGlyph = glyph;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  varying float vFade;
  varying float vGlyph;
  void main() {
    float g = mod(vGlyph, 128.0);
    vec2 uv = (gl_PointCoord + vec2(mod(g, 16.0), floor(g / 16.0))) / 16.0;
    vec4 t = texture2D(uAtlas, uv);
    if (t.a < 0.05) discard;
    gl_FragColor = vec4(t.rgb * vFade, t.a * vFade);
  }
`;

// Мутация noshader: пол рисуется материалом, который атрибут fade не читает вовсе.
// Данные при этом идеальны — именно так «затухание» и остаётся на бумаге.
const VERTEX_NOFADE = VERTEX.replace("attribute float fade;", "").replace("vFade = fade;", "vFade = 1.0;");

function material(atlasTexture, uniforms) {
  const m = mut();
  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlasTexture },
      uPulse: uniforms.uPulse,
      uTime: uniforms.uTime,
    },
    vertexShader: m === "noshader" ? VERTEX_NOFADE : VERTEX,
    fragmentShader: FRAGMENT,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}

function points(n, atlasTexture, uniforms, fill) {
  const pos = new Float32Array(n * 3);
  const glyph = new Float32Array(n);
  const size = new Float32Array(n);
  const offset = new Float32Array(n);
  const fade = new Float32Array(n);
  const out = [0, 0, 0, 0, 0, 0, 0];
  if (mut() !== "zeroattr") {
    for (let i = 0; i < n; i++) {
      fill(i, out);
      pos[i * 3] = out[0]; pos[i * 3 + 1] = out[1]; pos[i * 3 + 2] = out[2];
      glyph[i] = out[3]; size[i] = out[4]; offset[i] = out[5]; fade[i] = out[6];
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("glyph", new THREE.BufferAttribute(glyph, 1));
  g.setAttribute("size", new THREE.BufferAttribute(size, 1));
  g.setAttribute("offset", new THREE.BufferAttribute(offset, 1));
  g.setAttribute("fade", new THREE.BufferAttribute(fade, 1));
  g.computeBoundingSphere();
  return new THREE.Points(g, material(atlasTexture, uniforms));
}

export function buildFloor(seedCode, world, opts = {}) {
  const m = mut();
  const group = new THREE.Group();
  const bounds = world.group.userData.bounds;
  const floorY = bounds.min[1];
  const height = Math.max(1, bounds.size[1]);
  const uniforms = world.uniforms;

  // Текстуру атласа берём у материала мира: своего атласа полу не нужно, а
  // buildGlyphAtlas требует canvas, которого в узле нет.
  let atlasTexture = null;
  world.group.traverse((o) => {
    if (!atlasTexture && o.isPoints && o.material && o.material.uniforms && o.material.uniforms.uAtlas) {
      atlasTexture = o.material.uniforms.uAtlas.value;
    }
  });

  const sources = [];
  world.group.traverse((o) => {
    if (o.isPoints && o.userData.noReflect !== true && o.geometry.attributes.position) sources.push(o);
  });

  // --- отражение полей: копия через scale(1,-1,1) относительно линии пола --------
  const fadeLen = height * 0.35;
  for (const src of sources) {
    const sp = src.geometry.attributes.position.array;
    const sg = src.geometry.attributes.glyph.array;
    const ss = src.geometry.attributes.size.array;
    const so = src.geometry.attributes.offset.array;
    const srcCount = sg.length;
    // Вдвое меньшая плотность: берём каждую вторую точку.
    const step = m === "full" ? 1 : 2;
    const n = Math.max(1, Math.floor(srcCount / step));
    const p = points(n, atlasTexture, uniforms, (i, out) => {
      const j = Math.min(srcCount - 1, i * step);
      const y = sp[j * 3 + 1];
      const d = Math.abs(y - floorY);
      let mirroredY;
      if (m === "copy") mirroredY = y;
      else if (m === "flat") mirroredY = floorY;
      else mirroredY = 2 * floorY - y;
      let fade = Math.exp(-d / fadeLen);
      if (m === "nofade") fade = 1;
      else if (m === "stepfade") fade = d < fadeLen ? 1 : 0;
      let size = ss[j];
      if (m === "shrink") { size = ss[j] * fade; fade = 1; }
      // dimsize: затухание в fade сделано правильно, но размер ещё и уменьшен —
      // «я сделал и то и то». Точки всё равно уходят ниже пикселя.
      else if (m === "dimsize") size = ss[j] * fade;
      out[0] = sp[j * 3];
      out[1] = mirroredY;
      out[2] = sp[j * 3 + 2];
      out[3] = sg[j];
      out[4] = size;
      // Сдвиг фазы пульсации: иначе отражение мигает синхронно с миром и читается копией.
      out[5] = m === "samephase" ? so[j] : (so[j] + 0.37) % 1;
      out[6] = fade;
    });
    p.userData.floorPart = "mirror";
    p.frustumCulled = false;
    group.add(p);
  }

  // --- сама плоскость пола: сетка глифов с падающей яркостью ---------------------
  if (m !== "noplane") {
    const rng = m === "random" ? Math.random : mulberry32(strToSeed(seedCode + ":floor"));
    const pad = 1.25;
    const spanX = m === "fixedplane" ? 200 : Math.max(1, bounds.size[0]) * pad;
    const spanZ = m === "fixedplane" ? 200 : Math.max(1, bounds.size[2]) * pad;
    const cx = m === "fixedplane" ? 0 : (bounds.min[0] + bounds.max[0]) / 2;
    const cz = m === "fixedplane" ? 0 : (bounds.min[2] + bounds.max[2]) / 2;
    const nx = 48, nz = 48;
    const half = Math.hypot(spanX, spanZ) / 2;
    const glyphs = new Float32Array(nx * nz);
    const offs = new Float32Array(nx * nz);
    for (let i = 0; i < nx * nz; i++) { glyphs[i] = Math.floor(rng() * 128); offs[i] = rng(); }
    const plane = points(nx * nz, atlasTexture, uniforms, (i, out) => {
      const ix = i % nx, iz = Math.floor(i / nx);
      const x = cx - spanX / 2 + (spanX * ix) / (nx - 1);
      const z = cz - spanZ / 2 + (spanZ * iz) / (nz - 1);
      const r = Math.hypot(x - cx, z - cz);
      out[0] = x; out[1] = floorY; out[2] = z;
      out[3] = glyphs[i];
      out[4] = 3.5;
      out[5] = offs[i];
      out[6] = Math.exp(-r / (half * 0.5));
    });
    plane.userData.floorPart = "plane";
    plane.frustumCulled = false;
    group.add(plane);
  }

  group.userData = { floorY, seed: seedCode };

  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed || mut() === "leak") return;
      disposed = true;
      for (const c of group.children) { c.geometry.dispose(); c.material.dispose(); }
      group.children.length = 0;
    },
  };
}
