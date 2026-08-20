// NEUROGLYPHS — T00 launchable demo
// 3D world made entirely of glyphs (tokens). No meshes with normal textures.
// Stack: Three.js via CDN importmap. Vanilla JS ESM.
// All objects use THREE.Points to keep draw calls minimal (~5 total) while
// supporting hundreds of thousands of glyphs at 60fps.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mulberry32 } from './core/rng.js';
import { GLYPHS, PALETTE } from './core/glyphs.js';
import { buildGlyphAtlas } from './core/glyphTexture.js';
import { decodeSeed, validateSeed } from './core/seed.js';

// ---------------------------------------------------------------------------
// Seeded RNG (determinism: same seed -> same field layout)
// ---------------------------------------------------------------------------
const DEFAULT_SEED = 'neuroglyphs';
const params = new URLSearchParams(window.location.search);
const seedString = validateSeed(params.get('seed')) ? params.get('seed') : DEFAULT_SEED;
const seed = decodeSeed(seedString);
const rng = seed.rng;
const SEED = seedString;

const palette = PALETTE.map((h) => new THREE.Color(h));

// ---------------------------------------------------------------------------
// Shared vertex/fragment shaders for all Points-based glyph clouds.
// ---------------------------------------------------------------------------
const POINTS_VERT = `
  uniform float uTime;
  uniform float uSize;
  uniform float uDriftAmp;
  uniform float uDriftSpeed;
  uniform float uTwinkleBase;
  uniform float uTwinkleAmp;
  uniform float uTwinkleSpeed;
  attribute vec2 aUv;
  attribute float aScale;
  attribute float aPhase;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vTw;
  void main() {
    vUv = aUv;
    vColor = color;
    vec3 p = position;
    float t = uTime * uDriftSpeed + aPhase;
    p += vec3(sin(t) * uDriftAmp, cos(t * 0.8) * uDriftAmp, sin(t * 0.6) * uDriftAmp);
    vTw = uTwinkleBase + uTwinkleAmp * sin(uTime * uTwinkleSpeed + aPhase * 3.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aScale * (1.0 / -mv.z);
  }
`;

const POINTS_FRAG = `
  uniform sampler2D uAtlas;
  uniform float uCols;
  uniform float uRows;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vTw;
  void main() {
    vec2 uv = (vUv + gl_PointCoord) / vec2(uCols, uRows);
    uv.y = 1.0 - uv.y;
    vec4 tex = texture2D(uAtlas, uv);
    float a = tex.a * vTw;
    if (a < 0.02) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

function makePointsMaterial(atlas, sizeBase) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlas.texture },
      uCols: { value: atlas.cols },
      uRows: { value: atlas.rows },
      uTime: { value: 0 },
      uSize: { value: sizeBase },
      uDriftAmp: { value: 0.4 },
      uDriftSpeed: { value: 0.25 },
      uTwinkleBase: { value: 0.6 },
      uTwinkleAmp: { value: 0.4 },
      uTwinkleSpeed: { value: 1.5 },
    },
    vertexShader: POINTS_VERT,
    fragmentShader: POINTS_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });
}

// ---------------------------------------------------------------------------
// Glyph field: 600k glyph points. Shape is seed-driven — each seed picks a
// distinct structural archetype so no two worlds look the same.
// ---------------------------------------------------------------------------
const FIELD_COUNT = 600000;

// Shape archetypes: each is a function (i, params, out) that writes x,y,z.
// params are seeded-random values that vary the shape within its archetype.
const SHAPES = {
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
    const cph = Math.acos(2 * ((ci * 0.618) % 1) * 2 - 1);
    const cR = p.radius * 0.6;
    const cx = cR * Math.sin(cph) * Math.cos(cth);
    const cy = cR * Math.sin(cph) * Math.sin(cth) * p.flatten;
    const cz = cR * Math.cos(cph);
    out[0] = cx + cr * Math.sin(ph) * Math.cos(th);
    out[1] = cy + cr * Math.sin(ph) * Math.sin(th);
    out[2] = cz + cr * Math.cos(ph);
  },
  grid(i, p, out) {
    const n = Math.ceil(Math.cbrt(count));
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
    // Torus knot: p=2, q=3 style
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
};

const SHAPE_KEYS = Object.keys(SHAPES);

function pickShapeParams(key) {
  const p = {
    radius: 40 + rng() * 40,
    flatten: 0.4 + rng() * 0.8,
    distPow: 0.4 + rng() * 0.8,
    tubeR: 5 + rng() * 15,
    arms: 2 + Math.floor(rng() * 5),
    twist: 2 + rng() * 6,
    spread: 0.3 + rng() * 0.8,
    thickness: 3 + rng() * 12,
    strands: 2 + Math.floor(rng() * 4),
    turns: 2 + Math.floor(rng() * 5),
    clusterCount: 3 + Math.floor(rng() * 8),
    clusterRadius: 8 + rng() * 15,
    freq: 0.15 + rng() * 0.4,
    amp: 4 + rng() * 12,
    knotP: 2 + Math.floor(rng() * 3),
    knotQ: 2 + Math.floor(rng() * 4),
  };
  return p;
}

function buildGlyphField(atlas, opts = {}) {
  const {
    count = FIELD_COUNT,
    sizeBase = 42,
    scaleMin = 0.5,
    scaleMax = 2.1,
    driftAmp = 0.4,
    driftSpeed = 0.25,
    twinkleBase = 0.6,
    twinkleAmp = 0.4,
    twinkleSpeed = 1.5,
  } = opts;

  // Seed-driven shape selection
  const shapeKey = SHAPE_KEYS[Math.floor(rng() * SHAPE_KEYS.length)];
  const shapeFn = SHAPES[shapeKey];
  const shapeParams = pickShapeParams(shapeKey);

  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const scales = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);

  const { cols, rows } = atlas;
  const cW = 1 / cols;
  const cH = 1 / rows;
  const out = [0, 0, 0];

  for (let i = 0; i < count; i++) {
    shapeFn(i, shapeParams, out);
    positions[i * 3] = out[0];
    positions[i * 3 + 1] = out[1];
    positions[i * 3 + 2] = out[2];

    const gi = Math.floor(rng() * GLYPHS.length);
    uvs[i * 2] = (gi % cols) * cW;
    uvs[i * 2 + 1] = Math.floor(gi / cols) * cH;

    scales[i] = scaleMin + rng() * (scaleMax - scaleMin);
    phases[i] = rng() * Math.PI * 2;

    const c = palette[Math.floor(rng() * palette.length)];
    const b = 0.5 + rng() * 0.5;
    colors[i * 3] = c.r * b;
    colors[i * 3 + 1] = c.g * b;
    colors[i * 3 + 2] = c.b * b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aUv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = makePointsMaterial(atlas, sizeBase);
  mat.uniforms.uDriftAmp.value = driftAmp;
  mat.uniforms.uDriftSpeed.value = driftSpeed;
  mat.uniforms.uTwinkleBase.value = twinkleBase;
  mat.uniforms.uTwinkleAmp.value = twinkleAmp;
  mat.uniforms.uTwinkleSpeed.value = twinkleSpeed;

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, mat, count, shapeKey };
}

// ---------------------------------------------------------------------------
// Context ring: 6400 glyph points in a torus band.
// ---------------------------------------------------------------------------
function buildContextRing(atlas) {
  const count = 6400;
  const { cols, rows } = atlas;
  const cW = 1 / cols;
  const cH = 1 / rows;
  const radius = 20;

  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const scales = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const angles = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.02;
    const r = radius + (rng() - 0.5) * 2.0;
    const y = Math.sin(a * 3.0) * 1.5 + (rng() - 0.5) * 0.5;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(a) * r;
    angles[i] = a;

    const gi = Math.floor(rng() * GLYPHS.length);
    uvs[i * 2] = (gi % cols) * cW;
    uvs[i * 2 + 1] = Math.floor(gi / cols) * cH;

    scales[i] = 0.8 + rng() * 0.8;
    phases[i] = rng() * Math.PI * 2;

    colors[i * 3] = 0.35;
    colors[i * 3 + 1] = 0.9;
    colors[i * 3 + 2] = 0.82;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aUv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = makePointsMaterial(atlas, 38);
  mat.uniforms.uDriftAmp.value = 0.15;
  mat.uniforms.uDriftSpeed.value = 0.1;
  mat.uniforms.uTwinkleBase.value = 0.65;
  mat.uniforms.uTwinkleAmp.value = 0.35;
  mat.uniforms.uTwinkleSpeed.value = 1.8;

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  const group = new THREE.Group();
  group.add(points);

  return { group, points, mat, count };
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const boot = document.getElementById('boot');
function fail(msg) {
  boot.textContent = 'ERROR: ' + msg;
  boot.classList.add('err');
}

let renderer, scene, camera, controls, clock;
let field, core, ring, stars;
let tokens = 0;
const CONTEXT_MAX = 2048;
let pulse = 0;

const STAR_COUNT = 150000;
const CORE_COUNT = 1400;
const RING_COUNT = 6400;
const TOTAL_GLYPHS = FIELD_COUNT + STAR_COUNT + CORE_COUNT + RING_COUNT;

try {
  const canvas = document.getElementById('scene');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x05060a, 1);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060a, 0.008);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);
  camera.position.set(0, 10, 46);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 200;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;

  const atlas = buildGlyphAtlas();

  field = buildGlyphField(atlas, { count: FIELD_COUNT });
  scene.add(field.points);

  core = buildNeuralCore(atlas);
  scene.add(core.group);

  ring = buildContextRing(atlas);
  scene.add(ring.group);

  stars = buildGlyphField(atlas, {
    count: STAR_COUNT,
    sizeBase: 18,
    scaleMin: 0.3,
    scaleMax: 1.2,
    driftAmp: 0.2,
    driftSpeed: 0.1,
    twinkleBase: 0.4,
    twinkleAmp: 0.6,
    twinkleSpeed: 2.5,
  });
  scene.add(stars.points);

  clock = new THREE.Clock();

  // HUD
  const elTokens = document.getElementById('s-tokens');
  const elContext = document.getElementById('s-context');
  const elGlyphs = document.getElementById('s-glyphs');
  const elFps = document.getElementById('s-fps');
  const elFill = document.getElementById('context-fill');
  elGlyphs.textContent = TOTAL_GLYPHS.toLocaleString();

  let fpsAccum = 0, fpsFrames = 0, fpsTimer = 0;

  function onPulse() {
    pulse = 1.0;
    tokens = Math.min(CONTEXT_MAX, tokens + 128);
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); onPulse(); }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const t = clock.elapsedTime;

    // Update time uniforms
    field.mat.uniforms.uTime.value = t;
    stars.mat.uniforms.uTime.value = t;
    core.mat.uniforms.uTime.value = t;
    ring.mat.uniforms.uTime.value = t;

    // Pulse decay
    if (pulse > 0) pulse = Math.max(0, pulse - dt * 0.8);
    const p = pulse;

    // Core rotation
    core.group.rotation.y += dt * 0.12;
    core.lineMat.opacity = 0.3 + p * 0.6;
    // Pulse: brighten core points
    const coreBright = 0.7 + p * 0.5;
    core.mat.uniforms.uTwinkleBase.value = coreBright;

    // Ring rotation
    ring.group.rotation.y -= dt * 0.15;
    ring.mat.uniforms.uTwinkleBase.value = 0.65 + p * 0.35;

    // Simulate token collection
    tokens = Math.min(CONTEXT_MAX, tokens + dt * 40 * (1 + p * 3));

    controls.update();
    renderer.render(scene, camera);

    // HUD
    elTokens.textContent = Math.floor(tokens).toLocaleString();
    elContext.textContent = `${Math.floor(tokens).toLocaleString()} / ${CONTEXT_MAX.toLocaleString()}`;
    elFill.style.width = `${(tokens / CONTEXT_MAX) * 100}%`;

    fpsAccum += dt; fpsFrames++; fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      elFps.textContent = Math.round(fpsFrames / fpsAccum);
      fpsAccum = 0; fpsFrames = 0; fpsTimer = 0;
    }
  }

  animate();

  requestAnimationFrame(() => {
    boot.classList.add('fade');
    setTimeout(() => boot.remove(), 700);
  });

  console.log('[NEUROGLYPHS] demo booted. seed=' + SEED + ' glyphs=' + TOTAL_GLYPHS.toLocaleString());
} catch (err) {
  console.error(err);
  fail(err && err.message ? err.message : String(err));
}