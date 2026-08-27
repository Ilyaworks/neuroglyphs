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
  const kindArr = new Float32Array(n);
  const offset = new Float32Array(n);
  const fade = new Float32Array(n);
  const out = [0, 0, 0, 0, 0, 0, 0];
  if (mut() !== "zeroattr") {
    for (let i = 0; i < n; i++) {
      fill(i, out);
      pos[i * 3] = out[0]; pos[i * 3 + 1] = out[1]; pos[i * 3 + 2] = out[2];
      glyph[i] = out[3]; size[i] = out[4]; offset[i] = out[5]; fade[i] = out[6];
      kindArr[i] = out[7] || 0;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("glyph", new THREE.BufferAttribute(glyph, 1));
  g.setAttribute("size", new THREE.BufferAttribute(size, 1));
  g.setAttribute("kind", new THREE.BufferAttribute(kindArr, 1));
  g.setAttribute("offset", new THREE.BufferAttribute(offset, 1));
  g.setAttribute("fade", new THREE.BufferAttribute(fade, 1));
  g.computeBoundingSphere();
  return new THREE.Points(g, material(atlasTexture, uniforms));
}

// ── рисунок пола (задача N68) ────────────────────────────────────────────────
// Пол на референсе не пустое зеркало: по нему рассыпаны крупные знаки, идут длинные
// светящиеся дуги разметки, в зале лежит шахматная клетка. Роды и масштабы берутся
// из того же словаря, что и прочие поверхности (marks.js), поэтому у точек плоскости
// появляются атрибуты kind и несколько разных size.
export const FLOOR_MARK_KINDS = ["emblem", "string", "lattice", "pattern", "marking"];

// Какой рисунок лежит в какой локации. Пожелание «род рисунка зависит от локации»
// проверяется числом, а не на слово.
const BY_LOCATION = {
  city:   ["marking", "emblem", "lattice"],
  hall:   ["pattern", "lattice", "string"],
  tunnel: ["pattern", "marking", "lattice"],
  open:   ["emblem", "lattice", "string"],
};

const MARK_SCALE = { emblem: 9.0, string: 2.2, lattice: 0.4, pattern: 6.0, marking: 12.0 };

export function floorMarks(seedCode, location, rng) {
  const m = globalThis.__FLOOR_MUTATE || "";
  let kinds = BY_LOCATION[m === "sameloc" ? "open" : (location || "open")] || BY_LOCATION.open;
  if (m === "onekind") kinds = [kinds[0]];
  return kinds.map((k) => ({
    kind: k,
    index: FLOOR_MARK_KINDS.indexOf(k),
    scale: m === "onescale" ? 3 : MARK_SCALE[k],
  }));
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
    const half = Math.hypot(spanX, spanZ) / 2;

    // Рисунок пола: несколько родов, у каждого свой масштаб. Решётка мелкая и частая,
    // эмблемы крупные и редкие, разметка — длинные дуги через весь пол.
    const marks = floorMarks(seedCode, opts.location, rng);
    const prepared = [];
    for (const mk of marks) {
      if (mk.kind === "lattice" || mk.kind === "pattern") {
        const n = mk.kind === "lattice" ? 44 : 20;
        for (let ix = 0; ix < n; ix++) for (let iz = 0; iz < n; iz++) {
          if (mk.kind === "pattern" && (ix + iz) % 2) continue;
          prepared.push([
            cx - spanX / 2 + (spanX * ix) / (n - 1),
            cz - spanZ / 2 + (spanZ * iz) / (n - 1),
            mk.scale, mk.index, rng, 0,
          ]);
        }
      } else if (mk.kind === "marking") {
        // Разметка идёт СВЯЗНЫМИ линиями: две длинные дуги через весь пол. Если рисовать
        // её россыпью, она перестаёт уводить взгляд, а именно за это она на референсе.
        const dots = globalThis.__FLOOR_MUTATE === "dots";
        for (let line = 0; line < 2; line++) {
          for (let k = 0; k < 260; k++) {
            const t = k / 259;
            if (dots) {
              prepared.push([cx + (rng() - 0.5) * spanX, cz + (rng() - 0.5) * spanZ,
                mk.scale, mk.index, rng, 1]);
            } else {
              const off = (line - 0.5) * spanZ * 0.22;
              prepared.push([
                cx - spanX / 2 + spanX * t,
                cz + off + Math.sin(t * Math.PI) * spanZ * 0.1,
                mk.scale, mk.index, rng, 1,
              ]);
            }
          }
        }
      } else {
        const n = mk.kind === "emblem" ? 6 : 40;
        for (let e = 0; e < n; e++) {
          const ex = cx + (rng() - 0.5) * spanX * 0.8;
          const ez = cz + (rng() - 0.5) * spanZ * 0.8;
          const per = mk.kind === "emblem" ? 90 : 24;
          for (let k = 0; k < per; k++) {
            const a = (k / per) * Math.PI * 2;
            const rr = mk.scale * (mk.kind === "emblem" ? 4 : 2);
            prepared.push([ex + Math.cos(a) * rr, ez + Math.sin(a) * rr,
              mk.scale, mk.index, rng, 2]);
          }
        }
      }
    }

    const glyphs = new Float32Array(prepared.length);
    const offs = new Float32Array(prepared.length);
    for (let i = 0; i < prepared.length; i++) { glyphs[i] = Math.floor(rng() * 128); offs[i] = rng(); }

    const plane = points(prepared.length, atlasTexture, uniforms, (i, out) => {
      const [x, z, scale, kindIdx] = prepared[i];
      const r = Math.hypot(x - cx, z - cz);
      out[0] = x; out[1] = floorY; out[2] = z;
      out[3] = glyphs[i];
      out[4] = scale;
      out[5] = offs[i];
      out[6] = Math.exp(-r / (half * 0.5));
      out[7] = kindIdx;
    });
    plane.userData.floorPart = "plane";
    plane.frustumCulled = false;
    group.add(plane);
  }

  // Сплошная непрозрачная поверхность: она закрывает всё, что ниже пола. Без неё
  // зеркальные копии висят в открытом пространстве и читаются вторым миром снизу.
  if (m !== "nosolid") {
    const g = new THREE.BufferGeometry();
    const hx = Math.max(1, bounds.size[0]) * 6 + 2000;
    const hz = Math.max(1, bounds.size[2]) * 6 + 2000;
    const ccx = (bounds.min[0] + bounds.max[0]) / 2;
    const ccz = (bounds.min[2] + bounds.max[2]) / 2;
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
      ccx - hx, floorY, ccz - hz,
      ccx + hx, floorY, ccz - hz,
      ccx + hx, floorY, ccz + hz,
      ccx - hx, floorY, ccz + hz,
    ]), 3));
    if (g.setIndex) g.setIndex([0, 2, 1, 0, 3, 2]);
    const solid = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x000000), transparent: false, depthWrite: true,
    }));
    solid.userData.floorPart = "solid";
    solid.frustumCulled = false;
    group.add(solid);
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
