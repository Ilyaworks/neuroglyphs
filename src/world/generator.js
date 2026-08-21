// NEUROGLYPHS — T03: World Generator
// Composes a complete 3D world from a decoded seed: structure, particles,
// fog, background, and exactly one rectangular exit portal.
// All geometry is deterministic: same seed -> identical world (INV-3).
// All visuals are glyph-based (INV-2). No Math.random() (INV-1).

import * as THREE from 'three';
import { LAYOUTS, worldParams } from './structures.js';
import { GLYPHS, PALETTE } from '../core/glyphs.js';

// ---------------------------------------------------------------------------
// Shared shader (same as main.js — kept local to avoid circular imports)
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
// Structure: one of 8 layout types, rendered as glyph points
// ---------------------------------------------------------------------------
function buildStructure(atlas, layoutResult, palette, rng) {
  const count = layoutResult.count;
  const positions = layoutResult.positions;
  const scales = layoutResult.scales;

  const uvs = new Float32Array(count * 2);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);

  const { cols, rows } = atlas;
  const cW = 1 / cols;
  const cH = 1 / rows;

  for (let i = 0; i < count; i++) {
    const gi = Math.floor(rng() * GLYPHS.length);
    uvs[i * 2] = (gi % cols) * cW;
    uvs[i * 2 + 1] = Math.floor(gi / cols) * cH;
    phases[i] = rng() * Math.PI * 2;
    const c = palette[Math.floor(rng() * palette.length)];
    const b = 0.6 + rng() * 0.4;
    colors[i * 3] = c.r * b;
    colors[i * 3 + 1] = c.g * b;
    colors[i * 3 + 2] = c.b * b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
  geo.setAttribute('aUv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scales.slice(), 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = makePointsMaterial(atlas, 36);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, mat };
}

// ---------------------------------------------------------------------------
// Particle field: ambient glyph dust
// ---------------------------------------------------------------------------
function buildParticles(atlas, count, palette, rng, driftAmp, driftSpeed, twinkleAmp) {
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const scales = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);

  const { cols, rows } = atlas;
  const cW = 1 / cols;
  const cH = 1 / rows;

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rng() - 0.5) * 200;
    positions[i * 3 + 1] = (rng() - 0.5) * 80;
    positions[i * 3 + 2] = (rng() - 0.5) * 200;

    const gi = Math.floor(rng() * GLYPHS.length);
    uvs[i * 2] = (gi % cols) * cW;
    uvs[i * 2 + 1] = Math.floor(gi / cols) * cH;

    scales[i] = 0.3 + rng() * 0.7;
    phases[i] = rng() * Math.PI * 2;

    const c = palette[Math.floor(rng() * palette.length)];
    const b = 0.3 + rng() * 0.4;
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

  const mat = makePointsMaterial(atlas, 24);
  mat.uniforms.uDriftAmp.value = driftAmp;
  mat.uniforms.uDriftSpeed.value = driftSpeed;
  mat.uniforms.uTwinkleAmp.value = twinkleAmp;

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, mat };
}

// ---------------------------------------------------------------------------
// Exit portal: rectangular frame made of glyph bars + shaped hole indicator
// INV-6: always present, always rectangular, always findable.
// ---------------------------------------------------------------------------
function buildExitPortal(atlas, exit, palette, rng) {
  const group = new THREE.Group();
  const w = exit.width;
  const h = exit.height;
  const barThickness = 0.8;
  const barCount = 12;
  const totalBars = barCount * 4;

  const positions = new Float32Array(totalBars * 3);
  const uvs = new Float32Array(totalBars * 2);
  const scales = new Float32Array(totalBars);
  const colors = new Float32Array(totalBars * 3);
  const phases = new Float32Array(totalBars);

  const { cols, rows } = atlas;
  const cW = 1 / cols;
  const cH = 1 / rows;

  const glowColor = palette[0];
  let idx = 0;

  function placeBar(x, y, z) {
    positions[idx * 3] = x;
    positions[idx * 3 + 1] = y;
    positions[idx * 3 + 2] = z;
    const gi = Math.floor(rng() * GLYPHS.length);
    uvs[idx * 2] = (gi % cols) * cW;
    uvs[idx * 2 + 1] = Math.floor(gi / cols) * cH;
    scales[idx] = 1.2 + rng() * 0.3;
    phases[idx] = rng() * Math.PI * 2;
    colors[idx * 3] = glowColor.r;
    colors[idx * 3 + 1] = glowColor.g;
    colors[idx * 3 + 2] = glowColor.b;
    idx++;
  }

  // Top bar
  for (let i = 0; i < barCount; i++) {
    const t = i / (barCount - 1);
    placeBar(-w / 2 + t * w, h / 2, 0);
  }
  // Bottom bar
  for (let i = 0; i < barCount; i++) {
    const t = i / (barCount - 1);
    placeBar(-w / 2 + t * w, -h / 2, 0);
  }
  // Left bar
  for (let i = 0; i < barCount; i++) {
    const t = i / (barCount - 1);
    placeBar(-w / 2, -h / 2 + t * h, 0);
  }
  // Right bar
  for (let i = 0; i < barCount; i++) {
    const t = i / (barCount - 1);
    placeBar(w / 2, -h / 2 + t * h, 0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aUv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = makePointsMaterial(atlas, 48);
  mat.uniforms.uDriftAmp.value = 0.05;
  mat.uniforms.uDriftSpeed.value = 0.1;
  mat.uniforms.uTwinkleBase.value = 0.8;
  mat.uniforms.uTwinkleAmp.value = 0.2;

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  group.add(points);
  group.position.set(exit.x, exit.y, exit.z);
  group.rotation.y = exit.rotY;

  group.userData = { isExit: true, exit };
  return { group, mat };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a complete world from a decoded seed.
 * @param {object} decoded - result of decodeSeed()
 * @param {THREE.Scene} scene - target scene
 * @param {object} atlas - result of buildGlyphAtlas()
 * @returns {object} worldGroup with { group, structure, particles, exit, fog, mats }
 */
export function generateWorld(decoded, scene, atlas) {
  const palette = PALETTE.map((h) => new THREE.Color(h));
  const wp = worldParams(decoded);
  const rng = decoded.rng;

  const group = new THREE.Group();

  // Structure
  const layoutFn = LAYOUTS[wp.structure];
  const layoutResult = layoutFn(rng, { count: wp.structureCount });
  const structure = buildStructure(atlas, layoutResult, palette, rng);
  group.add(structure.points);

  // Particles
  const particles = buildParticles(atlas, wp.particleCount, palette, rng, wp.driftAmp, wp.driftSpeed, wp.twinkleAmp);
  group.add(particles.points);

  // Exit portal
  const exit = buildExitPortal(atlas, wp.exit, palette, rng);
  group.add(exit.group);

  // Fog
  const fogColor = new THREE.Color().setHSL(wp.fogHue, 0.3, 0.05);
  const fog = new THREE.FogExp2(fogColor.getHex(), wp.fogDensity);
  scene.fog = fog;

  // Background
  const bgColor = new THREE.Color().setHSL(wp.bgHue, 0.2, 0.03);
  scene.background = bgColor;

  scene.add(group);

  return {
    group,
    structure: { ...structure, count: wp.structureCount, type: wp.structure },
    particles: { ...particles, count: wp.particleCount },
    exit: { ...exit, position: new THREE.Vector3(wp.exit.x, wp.exit.y, wp.exit.z) },
    fog,
    params: wp,
  };
}

/**
 * Dispose all GPU resources in a world group.
 * @param {object} world - result of generateWorld()
 */
export function disposeWorld(world) {
  if (!world) return;
  const { group, structure, particles, exit } = world;

  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (obj.material.map) obj.material.map.dispose();
      obj.material.dispose();
    }
  });

  if (structure.mat) structure.mat.dispose();
  if (particles.mat) particles.mat.dispose();
  if (exit.mat) exit.mat.dispose();
}

/**
 * Get the world-space position of the exit portal.
 * @param {object} world - result of generateWorld()
 * @returns {THREE.Vector3}
 */
export function getExitPosition(world) {
  if (!world || !world.exit) return new THREE.Vector3();
  return world.exit.position.clone();
}
