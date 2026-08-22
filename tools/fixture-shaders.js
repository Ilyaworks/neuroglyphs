// Эталон для tools/shaders-check.mjs: минимальные, но работающие дисторсии.
// Гейт обязан быть зелёным на этом файле и красным на сломанном.
//
// Файл живёт в tools/ и приложением не импортируется. Гейт грузит его в странице,
// поэтому "three" здесь разрешается штатной importmap из index.html.
import { Vector2 } from "three";

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const FisheyeShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0.0 },
    // Значение по умолчанию обязательно: three читает у vec2 поле x, и на null
    // первый же кадр падает с «Cannot read properties of null».
    center: { value: new Vector2(0.5, 0.5) },
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform vec2 center;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - center;
      float r = length(d);
      vec2 uv = center + d * (1.0 - strength * r * r);
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
};

export const ChromaShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.0 },
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - vec2(0.5);
      vec2 off = dir * amount * length(dir);
      float cr = texture2D(tDiffuse, vUv + off).r;
      vec4 mid = texture2D(tDiffuse, vUv);
      float cb = texture2D(tDiffuse, vUv - off).b;
      gl_FragColor = vec4(cr, mid.g, cb, mid.a);
    }
  `,
};
