import * as THREE from "three";
import { mulberry32, strToSeed } from "../core/rng.js";

const VERTEX = /* glsl */ `
  attribute float glyph;
  attribute float size;
  attribute float offset;
  attribute float fade;
  uniform float uPulse;
  uniform vec3 uSpectrum[4];
  uniform vec2 uDistFade;
  varying float vFade;
  varying float vGlyph;
  varying vec3 vColor;
  varying float vDepth;
  varying float vGrazing;
  void main() {
    // Цвет берётся из палитры мира по тому же правилу, что в поле глифов
    // (fieldMaterial): отражение обязано быть того же цвета, что предмет.
    // Без этого пол отражал мир белыми глифами — в кадре это выглядело как
    // серая пыль под горизонтом, а не как отражение золотого мира.
    vColor = uSpectrum[int(mod(offset * 4.0, 4.0))];
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(size * (1.0 + 0.5 * uPulse) * (300.0 / -mv.z), 64.0);
    gl_Position = projectionMatrix * mv;
    vFade = fade;
    vGlyph = glyph;
    vDepth = -mv.z;
    // Насколько взгляд скользит вдоль пола. 1 — смотрим вдоль поверхности,
    // 0 — смотрим отвесно вниз. Мокрый пол отражает сильно при скользящем
    // взгляде и почти не отражает при отвесном: сверху сквозь воду видно дно,
    // а у нас под полом нет ничего, значит там и должно быть пусто.
    vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 toPoint = normalize(world - cameraPosition);
    vGrazing = 1.0 - abs(toPoint.y);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uStrength;
  uniform float uGrazeOnly;
  uniform vec2 uDistFade;
  varying float vFade;
  varying float vGlyph;
  varying vec3 vColor;
  varying float vDepth;
  varying float vGrazing;
  void main() {
    float g = mod(vGlyph, 128.0);
    vec2 uv = (gl_PointCoord + vec2(mod(g, 16.0), floor(g / 16.0))) / 16.0;
    vec4 t = texture2D(uAtlas, uv);
    if (t.a < 0.05) discard;
    // Отражение слабее предмета и гаснет с расстоянием. Второе важнее первого:
    // у горизонта пол бесконечно далёк, и если отражение там не растворяется,
    // линия горизонта выходит резкой границей — а её REFERENCE.md запрещает.
    float far = 1.0 - smoothstep(uDistFade.x, uDistFade.y, vDepth);
    // uGrazeOnly = 1 у отражения, 0 у самой поверхности пола: сетка пола видна
    // под любым углом, отражение — только под скользящим.
    float graze = mix(1.0, smoothstep(0.20, 0.68, vGrazing), uGrazeOnly);
    float k = vFade * far * graze * uStrength;
    if (k < 0.01) discard;
    gl_FragColor = vec4(t.rgb * vColor * k, t.a * k);
  }
`;

function material(atlasTexture, uniforms, spectrum) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlasTexture },
      uSpectrum: { value: spectrum },
      uStrength: { value: 1 },
      uGrazeOnly: { value: 0 },
      uDistFade: { value: new THREE.Vector2(1e9, 1e9 + 1) },
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
  const height = Math.max(1, bounds.size[1]);
  const uniforms = world.uniforms;

  let atlasTexture = null;
  world.group.traverse((o) => {
    if (!atlasTexture && o.isPoints && o.material && o.material.uniforms && o.material.uniforms.uAtlas) {
      atlasTexture = o.material.uniforms.uAtlas.value;
    }
  });

  // Палитра мира: те же четыре краски, которыми покрашено поле глифов.
  const palette = world.group.userData.palette;
  const spectrum = (palette && palette.glyph ? palette.glyph : ["#ffffff"])
    .map((c) => new THREE.Color(c));
  while (spectrum.length < 4) spectrum.push(spectrum[spectrum.length - 1].clone());

  const sources = [];
  world.group.traverse((o) => {
    // Погашенное облако не отражается и не тянет вниз линию пола: отражать то, чего
    // не рисуют, незачем. Без этого срез по залу считал пол по спрятанному старому
    // миру, и камера оказывалась на три сотни единиц выше зала.
    if (o.isPoints && o.visible !== false && o.userData.noReflect !== true
      && o.geometry.attributes.position) sources.push(o);
  });

  // Линия пола. Раньше бралась как bounds.min[1] — низ габаритной коробки мира.
  // Замером показано, что это не низ мира, а низ КОРОБКИ: у сида 0000-5hgu-kr7u
  // bounds.min[1] = -321, а сами глифы лежат в полосе от -19 до +17. Коробку
  // растягивают одиночные далёкие объекты, и пол уезжал на 300 единиц ниже всего,
  // что светится. Игрок оказывался на дне ямы, отражение — вертикально под ним,
  // за нижней кромкой кадра. Считаем по настоящему распределению точек: берём
  // низкий процентиль высот и отступаем немного вниз.
  const floorY = opts.floorY !== undefined ? opts.floorY : (() => {
    // Пол лежит ПОД всем, что он отражает, и ни один отражаемый объект не остаётся
    // ниже него: иначе пол оказывается среди предметов и режет мир пополам.
    // Считаем по тем же облакам, которые пойдут в отражение — звёзды в их число
    // не входят (userData.noReflect), поэтому их размах в ±2200 низ мира не тянет.
    let lo = Infinity, hi = -Infinity;
    for (const src of sources) {
      const a = src.geometry.attributes.position.array;
      for (let i = 1; i < a.length; i += 3) {
        const y = a[i];
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    }
    if (!Number.isFinite(lo)) return bounds.min[1];
    // Небольшой отступ вниз, чтобы самая нижняя точка мира лежала НАД полом,
    // а не в его плоскости.
    return lo - Math.max(1, (hi - lo)) * 0.03;
  })();

  const unusedPercentile = () => {
    const ys = [];
    if (!ys.length) return bounds.min[1];
    ys.sort((x, y) => x - y);
    // Процентиль, а не минимум: в мире есть облако «звёзд» с размахом до ±2200,
    // и по нему низ мира уезжает в никуда. Берём десятый процентиль — под ним
    // остаётся одна десятая точек, а девять десятых оказываются НАД полом и
    // отражаются. Замером: у сида 0000-5hgu-kr7u главное поле лежит в
    // [-321..306], и десятый процентиль сажает пол примерно на -250.
    const low = ys[Math.floor(ys.length * 0.10)];
    const high = ys[Math.floor(ys.length * 0.90)];
    const spread = Math.max(1, high - low);
    return low - spread * 0.04;
  };
  void unusedPercentile;

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
      // Затухание отражения с высотой предмета над полом. Было `fadeLen * 0.5`,
      // то есть длина затухания 66 единиц при высоте мира 379: структура, висящая
      // в 200 над полом, отражалась с яркостью 5% — на кадре это ноль. Мокрый пол
      // обязан удваивать картинку, а не намекать на неё.
      fade[i] = Math.exp(-d / (fadeLen * 2.6));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("glyph", new THREE.BufferAttribute(glyph, 1));
    geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
    geo.setAttribute("offset", new THREE.BufferAttribute(offset, 1));
    geo.setAttribute("fade", new THREE.BufferAttribute(fade, 1));
    geo.computeBoundingSphere();
    const p = new THREE.Points(geo, material(atlasTexture, uniforms, spectrum));
    p.userData.floorPart = "mirror";
    p.frustumCulled = false;
    // Отражение рисуется ПОВЕРХ непрозрачной поверхности, а не под ней: иначе
    // поверхность его же и закроет. Геометрически копии всё равно лежат ниже
    // плоскости пола, поэтому на экране они попадают строго под линию горизонта —
    // то есть ровно в ту область, где виден пол.
    p.material.depthTest = false;
    p.renderOrder = 1;
    // Сила отражения. 0.45 оказалось слишком мало, и не из-за самой цифры:
    // порог свечения в композере равен 0.8, мировые глифы его перешагивают и
    // получают ореол, а отражение при 0.45 не дотягивало и оставалось плоским.
    // Разница на кадре читалась не как «вдвое тусклее», а как «с ореолом против
    // без ореола». При 0.8 самые яркие отражённые глифы тоже начинают светиться.
    p.material.uniforms.uStrength.value = 1.15;
    // Затухание по скользящему взгляду ВЫКЛЮЧЕНО, и это разбор ошибки, а не
    // недоделка. Оно вводилось, когда человек сказал, что при взгляде в пол видны
    // «пространственные глифы»: я счёл, что копии выдают свою глубину, и приглушил
    // их под отвесным углом. Настоящей причиной оказался порядок ограничителя
    // высоты в boot.js — камера успевала уйти ПОД пол в том же кадре, и человек
    // видел мир снизу. Ограничитель исправлен, причина устранена, а приглушение
    // осталось бы данью неверному диагнозу и просто съедало отражение.
    // Механизм оставлен на месте: если глубина копий когда-нибудь начнёт мешать
    // по-настоящему, достаточно вернуть сюда 1.
    p.material.uniforms.uGrazeOnly.value = 0;
    // Растворение к горизонту: начинается на половине габарита мира, к двойному
    // габариту сходит в ноль.
    const reach = Math.max(bounds.size[0], bounds.size[2]);
    p.material.uniforms.uDistFade.value = new THREE.Vector2(reach * 1.0, reach * 3.5);
    group.add(p);
  }

  // ── непрозрачная поверхность пола ──────────────────────────────────────────
  // Без неё пол ничего не загораживает: зеркальные копии висят в открытом
  // пространстве, и глазами это второй мир снизу, а не отражение. Плюс сквозь
  // «пол» светили звёзды, из-за чего мир ощущался шаром вокруг зрителя.
  // Поверхность пишет глубину и закрывает ВСЁ, что ниже. Отражение потом
  // рисуется поверх неё, поэтому и читается как отражение В поверхности.
  const solidSpan = Math.max(bounds.size[0], bounds.size[2]) * 12 + 4000;
  const solidGeo = new THREE.BufferGeometry();
  const scx = (bounds.min[0] + bounds.max[0]) / 2;
  const scz = (bounds.min[2] + bounds.max[2]) / 2;
  const h = solidSpan / 2;
  solidGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
    scx - h, floorY, scz - h,
    scx + h, floorY, scz - h,
    scx + h, floorY, scz + h,
    scx - h, floorY, scz + h,
  ]), 3));
  solidGeo.setIndex([0, 2, 1, 0, 3, 2]);
  const bg = (world.group.userData.palette && world.group.userData.palette.bg) || "#000000";
  const solid = new THREE.Mesh(solidGeo, new THREE.MeshBasicMaterial({
    color: new THREE.Color(bg),
    side: THREE.DoubleSide,
    depthWrite: true,
    transparent: false,
  }));
  solid.userData.floorPart = "solid";
  solid.frustumCulled = false;
  solid.renderOrder = -1;
  group.add(solid);

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
  const plane = new THREE.Points(planeGeo, material(atlasTexture, uniforms, spectrum));
  plane.userData.floorPart = "plane";
  plane.frustumCulled = false;
  group.add(plane);

  group.userData = { floorY, seed: seedCode };

  let disposed = false;
  return {
    group,
    // Отражение здесь — зеркальные копии точек, они посчитаны один раз и живут в
    // геометрии. Пересчитывать их каждый кадр не нужно: мир за кадр не меняется,
    // а копия отражает его данные, а не вид с камеры. Метод оставлен, чтобы у
    // пола был один и тот же контракт независимо от способа отражения.
    update() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const c of group.children) { c.geometry.dispose(); c.material.dispose(); }
      group.children.length = 0;
    },
  };
}
