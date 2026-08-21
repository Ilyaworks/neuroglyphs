// ЭТАЛОН ДЛЯ ПРОВЕРКИ ИНСТРУМЕНТА, НЕ ИГРОВОЙ КОД.
//
// tools/material-check.mjs судит шейдер по пикселям спрайта. Чтобы инструмент не был
// «всегда красным», он должен на чём-то проходить: этот файл — заведомо правильный
// материал, выборка идёт по gl_PointCoord внутри клетки атласа. Границы клетки
// повторяют atlas.uv(): u с отступом полпикселя, v перевёрнут, как flipY у CanvasTexture.
//
// В src/ этот файл не импортируется и импортироваться не должен.
import * as THREE from "three";

const VERTEX_SHADER = /* glsl */ `
  attribute float glyph;
  attribute float size;
  attribute float offset;

  uniform float uPulse;
  uniform float uTime;
  uniform vec3 uSpectrum[4];

  varying vec3 vColor;
  varying float vGlyph;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float computed = size * (1.0 + 0.5 * uPulse) * (300.0 / -mvPosition.z);
    gl_PointSize = min(computed, 64.0);
    gl_Position = projectionMatrix * mvPosition;
    vGlyph = glyph;
    vColor = uSpectrum[int(mod(offset * 4.0, 4.0))];
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uPulse;
  uniform float uTime;

  varying vec3 vColor;
  varying float vGlyph;

  void main() {
    float g = mod(vGlyph, 128.0);
    float c = mod(g, 16.0);
    float r = floor(g / 16.0);
    float pad = 0.5 / 64.0;
    float u0 = (c + pad) / 16.0;
    float u1 = (c + 1.0 - pad) / 16.0;
    float v0 = 1.0 - (r + 1.0 - pad) / 8.0;
    float v1 = 1.0 - (r + pad) / 8.0;
    vec2 uv = vec2(mix(u0, u1, gl_PointCoord.x), mix(v1, v0, gl_PointCoord.y));
    vec4 texel = texture2D(uAtlas, uv);
    if (texel.a < 0.01) discard;
    gl_FragColor = vec4(vColor * (0.8 + 0.4 * uPulse), texel.a);
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
