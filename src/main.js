// NEUROGLYPHS — T00 launchable demo
// 3D world made entirely of glyphs (tokens). No meshes with normal textures.
// Stack: Three.js via CDN importmap. Vanilla JS ESM.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mulberry32 } from './core/rng.js';
import { GLYPHS, PALETTE } from './core/glyphs.js';
import { buildGlyphAtlas } from './core/glyphTexture.js';
import { decodeSeed, validateSeed } from './core/seed.js';

// ---------------------------------------------------------------------------
// Seeded RNG (determinism: same seed -> same field layout)
// The seed comes from the ?seed= URL param (lowercase base36, <=16 chars).
// decodeSeed returns a fresh deterministic rng + decoded world params.
// ---------------------------------------------------------------------------
const DEFAULT_SEED = 'neuroglyphs';
const params = new URLSearchParams(window.location.search);
const seedString = validateSeed(params.get('seed')) ? params.get('seed') : DEFAULT_SEED;
const seed = decodeSeed(seedString);
const rng = seed.rng;
const SEED = seedString;

// Palette as THREE.Color objects (hex list lives in core/glyphs.js).
const palette = PALETTE.map((h) => new THREE.Color(h));

// ---------------------------------------------------------------------------
// Build a sprite-material per glyph using atlas UVs (one texture atlas, many
// sprites share it; we offset UVs per sprite via a custom attribute on a
// Points cloud for the big field, and per-PlaneGeometry UVs for the core).
// ---------------------------------------------------------------------------

// Big glyph field as a THREE.Points cloud (fast, thousands of glyphs).
function buildGlyphField(count, radius, atlas) {
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);       // atlas cell (u,v) top-left
  const scales = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);

  const { cols, rows } = atlas;
  const cW = 1 / cols;
  const cH = 1 / rows;

  for (let i = 0; i < count; i++) {
    // Distribute in a shell / volume around the core.
    const r = radius * (0.25 + 0.75 * Math.pow(rng(), 0.6));
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta) * 0.7; // flatten a bit
    const z = r * Math.cos(phi);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const gi = Math.floor(rng() * GLYPHS.length);
    const col = gi % cols;
    const row = Math.floor(gi / cols);
    uvs[i * 2] = col * cW;
    uvs[i * 2 + 1] = row * cH;

    scales[i] = 0.5 + rng() * 1.6;
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

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlas.texture },
      uCols: { value: cols },
      uRows: { value: rows },
      uTime: { value: 0 },
      uSize: { value: 42 },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uSize;
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
        // gentle drift
        float t = uTime * 0.25 + aPhase;
        p += vec3(sin(t) * 0.4, cos(t * 0.8) * 0.4, sin(t * 0.6) * 0.4);
        vTw = 0.6 + 0.4 * sin(uTime * 1.5 + aPhase * 3.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * aScale * (1.0 / -mv.z);
      }
    `,
    fragmentShader: `
      uniform sampler2D uAtlas;
      uniform float uCols;
      uniform float uRows;
      varying vec2 vUv;
      varying vec3 vColor;
      varying float vTw;
      void main() {
        vec2 cell = vUv;
        vec2 frag = gl_PointCoord;
        // map point coord into the atlas cell
        vec2 uv = (cell + frag) / vec2(uCols, uRows);
        // flip v for canvas texture orientation
        uv.y = 1.0 - uv.y;
        vec4 tex = texture2D(uAtlas, uv);
        float a = tex.a * vTw;
        if (a < 0.02) discard;
        gl_FragColor = vec4(vColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, mat, count };
}

// Neural core: nodes (glyph planes) + synapse lines.
function buildNeuralCore(atlas) {
  const group = new THREE.Group();
  const nodeCount = 14;
  const nodes = [];
  const { cols, rows } = atlas;
  const cW = 1 / cols;
  const cH = 1 / rows;

  const nodeGeo = new THREE.PlaneGeometry(3.2, 3.2);

  for (let i = 0; i < nodeCount; i++) {
    const gi = Math.floor(rng() * GLYPHS.length);
    const col = gi % cols;
    const row = Math.floor(gi / cols);
    const geo = nodeGeo.clone();
    const uv = geo.attributes.uv;
    for (let j = 0; j < uv.count; j++) {
      const u = uv.getX(j);
      const v = uv.getY(j);
      uv.setXY(j, col * cW + u * cW, row * cH + v * cH);
    }
    uv.needsUpdate = true;

    const mat = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(0x8fffe6),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);

    const r = 6 + rng() * 6;
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    mesh.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta) * 0.7,
      r * Math.cos(phi)
    );
    mesh.userData.spin = (rng() - 0.5) * 0.6;
    group.add(mesh);
    nodes.push(mesh);
  }

  // Synapses: connect each node to its 2 nearest neighbors.
  const linePositions = [];
  for (let i = 0; i < nodeCount; i++) {
    const a = nodes[i].position;
    const dists = [];
    for (let j = 0; j < nodeCount; j++) {
      if (i === j) continue;
      dists.push({ j, d: a.distanceTo(nodes[j].position) });
    }
    dists.sort((x, y) => x.d - y.d);
    for (let k = 0; k < 2; k++) {
      const b = nodes[dists[k].j].position;
      linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x2f9e8f,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  group.add(lines);

  return { group, nodes, lines, lineMat };
}

// Context ring: orbiting glyphs forming a "context window" band.
function buildContextRing(atlas, count = 64) {
  const group = new THREE.Group();
  const { cols, rows } = atlas;
  const cW = 1 / cols;
  const cH = 1 / rows;
  const radius = 20;
  const ringGeo = new THREE.PlaneGeometry(2.4, 2.4);
  const items = [];

  for (let i = 0; i < count; i++) {
    const gi = Math.floor(rng() * GLYPHS.length);
    const col = gi % cols;
    const row = Math.floor(gi / cols);
    const geo = ringGeo.clone();
    const uv = geo.attributes.uv;
    for (let j = 0; j < uv.count; j++) {
      const u = uv.getX(j);
      const v = uv.getY(j);
      uv.setXY(j, col * cW + u * cW, row * cH + v * cH);
    }
    uv.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(0x58e6d0),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const a = (i / count) * Math.PI * 2;
    mesh.userData.angle = a;
    mesh.userData.radius = radius;
    mesh.userData.y = Math.sin(a * 3.0) * 1.5;
    group.add(mesh);
    items.push(mesh);
  }
  return { group, items };
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
let field, core, ring;
let tokens = 0;
const CONTEXT_MAX = 2048;
let pulse = 0;

try {
  const canvas = document.getElementById('scene');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x05060a, 1);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060a, 0.012);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 10, 46);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 8;
  controls.maxDistance = 120;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;

  const atlas = buildGlyphAtlas();

  field = buildGlyphField(6000, 60, atlas);
  scene.add(field.points);

  core = buildNeuralCore(atlas);
  scene.add(core.group);

  ring = buildContextRing(atlas);
  scene.add(ring.group);

  // subtle starfield of tiny glyphs far out
  const stars = buildGlyphField(1500, 180, atlas);
  stars.mat.uniforms.uSize.value = 18;
  scene.add(stars.points);

  clock = new THREE.Clock();

  // HUD refs
  const elTokens = document.getElementById('s-tokens');
  const elContext = document.getElementById('s-context');
  const elGlyphs = document.getElementById('s-glyphs');
  const elFps = document.getElementById('s-fps');
  const elFill = document.getElementById('context-fill');
  elGlyphs.textContent = (6000 + 1500).toLocaleString();

  // token accrual (simulated inference collecting tokens)
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

    field.mat.uniforms.uTime.value = t;
    stars.mat.uniforms.uTime.value = t;

    // pulse decay
    if (pulse > 0) pulse = Math.max(0, pulse - dt * 0.8);
    const p = pulse;

    // core rotation + node spin + pulse glow
    core.group.rotation.y += dt * 0.12;
    for (const n of core.nodes) {
      n.rotation.z += dt * n.userData.spin;
      n.material.color.setHSL(0.45, 0.8, 0.55 + p * 0.4);
      const s = 1 + p * 0.6;
      n.scale.setScalar(s);
    }
    core.lineMat.opacity = 0.3 + p * 0.6;

    // ring orbit + pulse radius
    ring.group.rotation.y -= dt * 0.15;
    for (const it of ring.items) {
      const a = it.userData.angle + t * 0.1;
      const r = it.userData.radius + p * 4;
      it.position.set(Math.cos(a) * r, it.userData.y, Math.sin(a) * r);
      it.lookAt(camera.position);
      it.material.color.setHSL(0.48, 0.85, 0.5 + p * 0.4);
    }

    // simulate token collection
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

  // hide boot
  requestAnimationFrame(() => {
    boot.classList.add('fade');
    setTimeout(() => boot.remove(), 700);
  });

  console.log('[NEUROGLYPHS] demo booted. seed=' + SEED);
} catch (err) {
  console.error(err);
  fail(err && err.message ? err.message : String(err));
}