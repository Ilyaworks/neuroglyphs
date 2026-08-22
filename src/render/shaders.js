export const FisheyeShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0.0 },
    center: { value: null },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform vec2 center;
    varying vec2 vUv;
    void main() {
      vec2 c = center;
      vec2 d = vUv - c;
      float r = length(d);
      float angle = strength * r * r;
      vec2 uv = c + d * (1.0 - angle);
      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
};

export const ChromaShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec2 c = vec2(0.5);
      vec2 dir = vUv - c;
      float r = length(dir);
      vec2 off = dir * amount * r;
      float cr = texture2D(tDiffuse, vUv + off).r;
      vec4 g = texture2D(tDiffuse, vUv);
      float cb = texture2D(tDiffuse, vUv - off).b;
      gl_FragColor = vec4(cr, g.g, cb, g.a);
    }
  `,
};
