import * as THREE from "three";
import { mulberry32, strToSeed } from "../core/rng.js";

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

function material(atlasTexture, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlasTexture },
      uPulse: uniforms.uPulse,
      uTime: uniforms.uTime,
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
}

export function buildFloor(seedCode, world, opts = {}) {
  const group = new THREE.Group();
  const bounds = world.group.userData.bounds;
  const floorY = bounds.min[1];
  const height = Math.max(1, bounds.size[1]);
  const uniforms = world.uniforms;

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

  const fadeLen = height * 0.35;
  for (const src of sources) {
    const sp = src.geometry.attributes.position.array;
    const sg = src.geometry.attributes.glyph.array;
    const ss = src.geometry.attributes.size.array;
    const so = src.geometry.attributes.offset.array;
    const srcCount = sg.length;
    const n = Math.max(1, Math.floor(srcCount / 2));
    const pos = new Float32Array(n * 3);
    const glyph = new Float32Array(n);
    const size = new Float32Array(n);
    const offset = new Float32Array(n);
    const fade = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = Math.min(srcCount - 1, i * 2);
      const y = sp[j * 3 + 1];
      const d = Math.abs(y - floorY);
      pos[i * 3] = sp[j * 3];
      pos[i * 3 + 1] = 2 * floorY - y;
      pos[i * 3 + 2] = sp[j * 3 + 2];
      glyph[i] = sg[j];
      size[i] = ss[j];
      offset[i] = (so[j] + 0.37) % 1;
      fade[i] = Math.exp(-d / (fadeLen * 0.5));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("glyph", new THREE.BufferAttribute(glyph, 1));
    geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
    geo.setAttribute("offset", new THREE.BufferAttribute(offset, 1));
    geo.setAttribute("fade", new THREE.BufferAttribute(fade, 1));
    geo.computeBoundingSphere();
    const p = new THREE.Points(geo, material(atlasTexture, uniforms));
    p.userData.floorPart = "mirror";
    p.frustumCulled = false;
    group.add(p);
  }

  const rng = mulberry32(strToSeed(seedCode + ":floor"));
  const pad = 3.0;
  const spanX = Math.max(1, bounds.size[0]) * pad;
  const spanZ = Math.max(1, bounds.size[2]) * pad;
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  const nx = 64, nz = 64;
  const half = Math.hypot(spanX, spanZ) / 2;
  const glyphs = new Float32Array(nx * nz);
  const offs = new Float32Array(nx * nz);
  for (let i = 0; i < nx * nz; i++) { glyphs[i] = Math.floor(rng() * 128); offs[i] = rng(); }
  const pPos = new Float32Array(nx * nz * 3);
  const pGlyph = new Float32Array(nx * nz);
  const pSize = new Float32Array(nx * nz);
  const pOffset = new Float32Array(nx * nz);
  const pFade = new Float32Array(nx * nz);
  for (let i = 0; i < nx * nz; i++) {
    const ix = i % nx, iz = Math.floor(i / nx);
    const x = cx - spanX / 2 + (spanX * ix) / (nx - 1);
    const z = cz - spanZ / 2 + (spanZ * iz) / (nz - 1);
    const r = Math.hypot(x - cx, z - cz);
    pPos[i * 3] = x; pPos[i * 3 + 1] = floorY; pPos[i * 3 + 2] = z;
    pGlyph[i] = glyphs[i];
    pSize[i] = 3.5;
    pOffset[i] = offs[i];
    pFade[i] = Math.exp(-r / (half * 0.35));
  }
  const planeGeo = new THREE.BufferGeometry();
  planeGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  planeGeo.setAttribute("glyph", new THREE.BufferAttribute(pGlyph, 1));
  planeGeo.setAttribute("size", new THREE.BufferAttribute(pSize, 1));
  planeGeo.setAttribute("offset", new THREE.BufferAttribute(pOffset, 1));
  planeGeo.setAttribute("fade", new THREE.BufferAttribute(pFade, 1));
  planeGeo.computeBoundingSphere();
  const plane = new THREE.Points(planeGeo, material(atlasTexture, uniforms));
  plane.userData.floorPart = "plane";
  plane.frustumCulled = false;
  group.add(plane);

  group.userData = { floorY, seed: seedCode };

  let disposed = false;
  return {
    group,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const c of group.children) { c.geometry.dispose(); c.material.dispose(); }
      group.children.length = 0;
    },
  };
}
