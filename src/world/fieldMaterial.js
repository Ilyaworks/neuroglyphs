import * as THREE from "three";

const VERTEX_SHADER = /* glsl */ `
  attribute float glyph;
  attribute float size;
  attribute float offset;

  uniform float uPulse;
  uniform float uTime;
  uniform vec3 uSpectrum[4];

  varying vec2 vUv;
  varying vec3 vColor;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float computed = size * (1.0 + 0.5 * uPulse) * (300.0 / -mvPosition.z);
    gl_PointSize = min(computed, 64.0);
    gl_Position = projectionMatrix * mvPosition;

    float g = mod(glyph, 128.0);
    float c = mod(g, 16.0);
    float r = floor(g / 16.0);
    float pad = 0.5 / 64.0;
    vUv = vec2(
      (c + pad) / 16.0,
      1.0 - (floor(r + 1.0 - pad) / 8.0)
    );

    float mixIndex = mod(offset * 4.0, 4.0);
    vec3 colA = uSpectrum[int(mixIndex)];
    vColor = colA;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uPulse;
  uniform float uTime;
  uniform vec3 uSpectrum[4];

  varying vec2 vUv;
  varying vec3 vColor;

  void main() {
    vec4 texel = texture2D(uAtlas, vUv);
    float alpha = texel.a;
    if (alpha < 0.01) discard;
    vec3 color = vColor * (0.8 + 0.4 * uPulse);
    gl_FragColor = vec4(color, alpha);
  }
`;

export function buildFieldMaterial(atlas, opts = {}) {
  const uniforms = {
    uAtlas: { value: atlas.texture },
    uPulse: { value: 0 },
    uTime: { value: 0 },
    uSpectrum: {
      value: [
        new THREE.Color(0x00ffff),
        new THREE.Color(0xff00ff),
        new THREE.Color(0x00ff88),
        new THREE.Color(0xffffff),
      ],
    },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    transparent: true,
  });

  return { material, uniforms };
}
