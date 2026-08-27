import * as THREE from "three";
import { mulberry32, strToSeed } from "../core/rng.js";
import { decodeSeed, randomSeed } from "../core/seed.js";
import { buildGlyphAtlas } from "../core/atlas.js";
import { buildFieldGeometry } from "./fieldGeometry.js";
import { buildFieldMaterial } from "./fieldMaterial.js";
import { buildShapeField } from "./shapeField.js";
import { buildSurfaceField } from "./surfaceField.js";
import { LAYOUTS } from "./layouts/index.js";
import { layoutSurfaces, layoutForms } from "./surfacePlan.js";
import { buildLanguage } from "./language.js";
import { buildHall } from "./halls.js";
import { buildHallField } from "./hallField.js";
import { buildCity } from "./city.js";
import { buildCityField } from "./cityField.js";
import { buildExitPortal } from "./portal.js";
import { buildImpossible, IMPOSSIBLE_KINDS } from "../atmosphere/impossible.js";
import { resolvePalette, paletteByName } from "../art/palettes.js";

const FIELD_RADIUS = 400;
const STAR_RADIUS = 2200;

function resolveSeed() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("seed");
  if (fromUrl && decodeSeed(fromUrl)) return fromUrl.toUpperCase();
  const rng = mulberry32(strToSeed(String(Date.now())));
  const code = randomSeed(rng);
  params.set("seed", code);
  history.replaceState(null, "", location.pathname + "?" + params.toString());
  return code;
}

export function createWorld(seedCode) {
  const code = decodeSeed(seedCode) ? seedCode : resolveSeed();
  const fields = decodeSeed(code);
  const rng = fields.rng;
  const group = new THREE.Group();

  // Срез по кадру референса: ?hall=1 строит ТОЛЬКО зал со сферой — без облака-раскладки,
  // без формы из каталога, без невозможной фигуры. Отдельным входом, а не заменой мира:
  // так на срез можно смотреть уже сейчас, а гейты продолжают мерить прежний мир. Когда
  // город вокруг зала будет готов (N88), этот вход станет обычной дорогой.
  const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : null;
  const hallOnly = params && params.get("hall") === "1";
  // ?city=1 — весь город: постройки, лабиринт улиц, зал внутри как одно из мест.
  const cityOnly = params && params.get("city") === "1";

  const budget = 1500 + fields.density * 2000;
  const density = Math.floor(budget * 0.6);
  const shapeCount = Math.max(1, budget - density);
  const atlas = buildGlyphAtlas();

  // Мир строится не сферой, а раскладкой из сида: восемь структур, по три бита сида.
  // Раскладка получает тот же поток rng, поэтому один сид даёт один мир побайтово.
  const structure = fields.structure % LAYOUTS.length;
  const layout = LAYOUTS[structure](rng, { target: density, extent: FIELD_RADIUS });
  const points = layout.positions;
  const count = layout.count;

  // Габарит нужен камере и дальнему плану: у раскладок он разный, сфера тут не подходит.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      const v = points[i * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  const bounds = count > 0
    ? { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] }
    : { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };

  const { geometry, ready } = buildFieldGeometry(count, (i, out) => {
    out[0] = points[i * 3];
    out[1] = points[i * 3 + 1];
    out[2] = points[i * 3 + 2];
  });

  let palette = resolvePalette(fields);
  // В срезе цвет не отдаётся на волю сида: кадр, выбранный человеком, монохромный.
  // Ключ ?mood=<имя> даёт посмотреть любую другую гамму: serene, eerie, joyful,
  // uncanny, claustrophobic, void.
  if (cityOnly || hallOnly) {
    const want = (params && params.get("mood")) || "void";
    palette = paletteByName(want) || palette;
  }
  const fogDensity = Math.min(0.004, Math.max(0.0003, palette.fogDensity * (0.5 + fields.density / 15)));
  const { material, uniforms } = buildFieldMaterial(atlas, { fogDensity });
  material.uniforms.uSpectrum.value = palette.glyph.map((c) => new THREE.Color(c));
  const field = new THREE.Points(geometry, material);
  group.add(field);

  // Второе, «формовое» поле: облако по форме из каталога, выбранной по seed.shape.
  // Делит тот же бюджет точек, красится той же палитрой мира.
  const shape = buildShapeField(fields, { count: shapeCount, extent: FIELD_RADIUS });
  const { geometry: shapeGeo, ready: shapeReady } = buildFieldGeometry(shape.count, (i, out) => shape.fill(i, out));
  const { material: shapeMat, uniforms: shapeUniforms } = buildFieldMaterial(atlas, { fogDensity });
  shapeMat.uniforms.uSpectrum.value = palette.glyph.map((c) => new THREE.Color(c));
  shapeUniforms.uPulse = uniforms.uPulse;
  shapeUniforms.uTime = uniforms.uTime;
  const shapeField = new THREE.Points(shapeGeo, shapeMat);
  group.add(shapeField);

  // Невозможная фигура: привязка — позиция камеры на старте (начало координат),
  // центр — между камерой и порталом, тип — по seed.shape. Добавляем ПОСЛЕ полей,
  // не первым: гейт палитры мерит цвет кадра по первому облаку в группе мира.
  const impKind = IMPOSSIBLE_KINDS[fields.shape % IMPOSSIBLE_KINDS.length];
  const impCount = Math.max(1, Math.floor(budget * 0.15));
  // Точка привязки — позиция камеры на старте, центр — на 45% пути к порталу,
  // габарит соразмерен миру: эталон 260 даёт 0.88 высоты кадра.
  const impAnchor = [0, 0, 0];
  const impCenter = [impAnchor[0], impAnchor[1], (bounds.min[2] - 40) * 0.45];
  const imp = buildImpossible(impKind, impAnchor, { count: impCount, extent: 260, center: impCenter });
  const { geometry: impGeo, ready: impReady } = buildFieldGeometry(imp.count, (i, out) => imp.fill(i, out));
  const { material: impMat, uniforms: impUniforms } = buildFieldMaterial(atlas, { fogDensity });
  impMat.uniforms.uSpectrum.value = palette.glyph.map((c) => new THREE.Color(c));
  impUniforms.uPulse = uniforms.uPulse;
  impUniforms.uTime = uniforms.uTime;
  const impField = new THREE.Points(impGeo, impMat);
  impField.userData.impossible = true;
  group.add(impField);
  impReady.then(() => {
    const sz = impGeo.attributes.size.array;
    for (let i = 0; i < sz.length; i++) sz[i] = Math.max(6, sz[i]);
    impGeo.attributes.size.needsUpdate = true;
  });

  // Дальний план живёт на своём потоке случайности: иначе он зависит от того, сколько
  // чисел израсходовала раскладка, и меняется при любой правке структуры мира.
  const starRng = mulberry32(strToSeed(code + ":stars"));
  const starCount = 2000;
  const starPos = new Float32Array(starCount * 3);
  const starGlyph = new Float32Array(starCount);
  const starSize = new Float32Array(starCount);
  const starOff = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const u = starRng() * 2 - 1;
    const v = starRng() * 2 - 1;
    const w = starRng() * 2 - 1;
    const len = Math.hypot(u, v, w) || 1;
    starPos[i * 3] = (u / len) * STAR_RADIUS;
    starPos[i * 3 + 1] = (v / len) * STAR_RADIUS;
    starPos[i * 3 + 2] = (w / len) * STAR_RADIUS;
    starGlyph[i] = Math.floor(starRng() * 128);
    starSize[i] = 14 + starRng() * 22;
    starOff[i] = starRng();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute("glyph", new THREE.BufferAttribute(starGlyph, 1));
  starGeo.setAttribute("size", new THREE.BufferAttribute(starSize, 1));
  starGeo.setAttribute("offset", new THREE.BufferAttribute(starOff, 1));
  starGeo.computeBoundingSphere();
  const { material: starMat } = buildFieldMaterial(atlas, { fogDensity: 0 });
  starMat.uniforms.uPulse = uniforms.uPulse;
  starMat.uniforms.uTime = uniforms.uTime;
  const stars = new THREE.Points(starGeo, starMat);
  stars.userData.noReflect = true;
  group.add(stars);

  // Портал выхода: ровно один на мир. Садим его на дальнюю по −Z границу габарита —
  // камера в boot.js стоит в начале координат и смотрит в −Z, поэтому портал обязан
  // оказаться перед ней, а не за спиной.
  const portal = buildExitPortal(fields, atlas);
  const pz = bounds.min[2] - 40;
  portal.group.position.set(0, 0, pz);
  portal.group.traverse((o) => {
    if (o.isPoints) o.frustumCulled = false;
  });
  portal.group.traverse((o) => {
    if (o.isPoints && o.material && o.material.uniforms) {
      o.material.uniforms.uPulse = uniforms.uPulse;
      o.material.uniforms.uTime = uniforms.uTime;
    }
  });
  group.add(portal.group);

  // Поверхности: стены, стволы колонн, пол и сферы, покрытые знаками. Признак 27
  // референса — символы ЛЕЖАТ НА ПОВЕРХНОСТЯХ; без них мир читается облаком, а не
  // постройкой. Свой поток случайности, как у дальнего плана: иначе поверхности
  // зависят от того, сколько чисел израсходовала раскладка.
  //
  // Габарит для расстановки берём НЕ по коробке мира: её растягивают одиночные
  // далёкие объекты, и стены уезжали бы за горизонт. Считаем по процентилям —
  // тем же способом, каким чинили линию пола.
  // Язык мира: одна стилистика на весь город. Свой поток случайности, как у дальнего
  // плана, — иначе язык зависит от того, сколько чисел израсходовала раскладка.
  const language = buildLanguage(code);
  const surfRng = mulberry32(strToSeed(code + ":surfaces"));
  const surfaces = [];
  if (count > 8) {
    const cut = (axis, q) => {
      const vals = new Float64Array(count);
      for (let i = 0; i < count; i++) vals[i] = points[i * 3 + axis];
      vals.sort();
      return vals[Math.min(count - 1, Math.max(0, Math.floor(q * (count - 1))))];
    };
    // Точка старта игрока считается ровно так же, как в boot.js: по ГАБАРИТУ мира.
    // Габарит и процентили расходятся тем сильнее, чем дальше одиночные объекты, и
    // на таких сидах камера оказывалась за пределами процентильной коробки — стены
    // вставали у неё за спиной. План поверхностей обязан знать, где стоит игрок.
    const box = {
      x0: cut(0, 0.03), x1: cut(0, 0.97),
      y0: cut(1, 0.02), y1: cut(1, 0.98),
      z0: cut(2, 0.03), z1: cut(2, 0.97),
      camX: (bounds.min[0] + bounds.max[0]) / 2,
      camZ: (bounds.min[2] + bounds.max[2]) / 2 + bounds.size[2] * 0.30,
    };
    for (const item of layoutSurfaces(structure, surfRng, box)) {
      const built = buildSurfaceField(code + ":" + item.role + ":" + surfaces.length, item.spec, atlas, {
        marks: item.marks,
        language,
        fogDensity,
        spectrum: palette.glyph,
        salt: item.role + surfaces.length,
      });
      built.uniforms.uPulse = uniforms.uPulse;
      built.uniforms.uTime = uniforms.uTime;
      built.points.userData.surfaceRole = item.role;
      group.add(built.points);
      surfaces.push(built);
    }

    // Постройки на языке мира: арки, шпили, купола — те формы, что выбрал сид, в своих
    // вариациях. Собраны В ОДНО облако: каждое отдельное облако обязано быть видно на
    // экране (это стережёт world-check), а полтора десятка мелких построек по одному
    // облаку на штуку такую проверку не переживут и правильно сделают.
    const formPlan = layoutForms(surfRng, box, language);
    if (formPlan.length) {
      const parts = [];
      let total = 0;
      for (const item of formPlan) {
        const v = language.variantOf(item.form, surfRng);
        const pts = new Float32Array(v.count * 3);
        const out = [0, 0, 0];
        let lo = Infinity;
        for (let i = 0; i < v.count; i++) {
          v.fill(i, out);
          pts[i * 3] = out[0] * item.grow;
          pts[i * 3 + 1] = out[1] * item.grow;
          pts[i * 3 + 2] = out[2] * item.grow;
          if (pts[i * 3 + 1] < lo) lo = pts[i * 3 + 1];
        }
        // Постройка СТОИТ НА ПОЛУ, а не висит и не тонет: поднимаем на её же низ.
        for (let i = 0; i < v.count; i++) {
          pts[i * 3] += item.at[0];
          pts[i * 3 + 1] += item.at[1] - lo;
          pts[i * 3 + 2] += item.at[2];
        }
        parts.push({ pts, n: v.count, form: item.form, grow: item.grow });
        total += v.count;
      }
      const fPos = new Float32Array(total * 3);
      const fGlyph = new Float32Array(total);
      const fSize = new Float32Array(total);
      const fOff = new Float32Array(total);
      const alpha = language.glyphs;
      let w2 = 0;
      for (let pi = 0; pi < parts.length; pi++) {
        const part = parts[pi];
        for (let i = 0; i < part.n; i++) {
          fPos[w2 * 3] = part.pts[i * 3];
          fPos[w2 * 3 + 1] = part.pts[i * 3 + 1];
          fPos[w2 * 3 + 2] = part.pts[i * 3 + 2];
          fGlyph[w2] = alpha[(w2 * 7 + pi) % alpha.length];
          fSize[w2] = 2 + part.grow * 2.5;
          fOff[w2] = ((pi % 4) + 0.5) / 4;
          w2++;
        }
      }
      const fGeo = new THREE.BufferGeometry();
      fGeo.setAttribute("position", new THREE.BufferAttribute(fPos, 3));
      fGeo.setAttribute("glyph", new THREE.BufferAttribute(fGlyph, 1));
      fGeo.setAttribute("size", new THREE.BufferAttribute(fSize, 1));
      fGeo.setAttribute("offset", new THREE.BufferAttribute(fOff, 1));
      fGeo.computeBoundingSphere();
      const { material: fMat, uniforms: fUni } = buildFieldMaterial(atlas, { fogDensity });
      fMat.uniforms.uSpectrum.value = palette.glyph.map((c) => new THREE.Color(c));
      fUni.uPulse = uniforms.uPulse;
      fUni.uTime = uniforms.uTime;
      const fPoints = new THREE.Points(fGeo, fMat);
      fPoints.frustumCulled = false;
      fPoints.userData.cityForms = formPlan.map((f) => f.form);
      group.add(fPoints);
      surfaces.push({ points: fPoints, geometry: fGeo, material: fMat, uniforms: fUni });
    }
  }

  // Зал со сферой — срез по кадру референса. Старые слои не удаляются, а ГАСЯТСЯ:
  // так вход ?hall=1 показывает чистый кадр, а прежний мир остаётся на месте и его
  // продолжают мерить прежние гейты. Удалять их можно будет, когда город вокруг зала
  // встанет на их место (N88).
  let hallBuilt = null;
  let cityBuilt = null;
  if (cityOnly) {
    const city = buildCity(code, language, { floorY: 0 });
    cityBuilt = buildCityField(city, language, atlas, {
      seed: code, spectrum: palette.glyph, fogDensity,
      uPulse: uniforms.uPulse, uTime: uniforms.uTime,
      noSolids: params && params.get("solids") === "0",
    });
    group.add(cityBuilt.group);
    field.visible = false;
    shapeField.visible = false;
    impField.visible = false;
    for (const s of surfaces) s.points.visible = false;
    const info = cityBuilt.group.userData.city;
    portal.group.position.set(info.portal[0], city.floorY + 60, info.portal[2]);
  } else if (hallOnly) {
    const hall = buildHall(code, language, { floorY: 0 });
    hallBuilt = buildHallField(hall, language, atlas, {
      seed: code, spectrum: palette.glyph, fogDensity,
      uPulse: uniforms.uPulse, uTime: uniforms.uTime,
    });
    group.add(hallBuilt.group);
    field.visible = false;
    shapeField.visible = false;
    impField.visible = false;
    for (const s of surfaces) s.points.visible = false;
    // Звёзд в закрытом зале не бывает: свод их и так закрывает, но гасим явно —
    // иначе они просвечивают в проёмах и выдают, что зал стоит в пустоте.
    stars.visible = false;
    // Портал — за сферой, в глубине зала: по кадру референса выход читается в дальнем конце.
    portal.group.position.set(0, hall.floorY + hall.sphere.radius, hall.bounds.min[2] + 40);
  }

  group.userData = { seed: code, structure, bounds, exitPosition: portal.group.position, palette, fogDensity };
  group.userData.language = { manner: language.manner, alphabet: language.alphabet, forms: language.forms };
  // ПОСЛЕ общего присваивания userData: строка выше заменяет объект целиком, и ссылка
  // на зал, поставленная раньше, просто пропадала. Камера всё это время стояла по-старому.
  if (hallBuilt) group.userData.hall = hallBuilt.group.userData.hall;
  if (cityBuilt) group.userData.city = cityBuilt.group.userData.city;
  group.userData.surfaces = surfaces.map((s) => s.points.userData.surface);
  group.userData.impossible = {
    kind: imp.kind,
    anchor: impAnchor,
    center: impCenter,
    count: imp.count,
    seams: imp.seams.map((s) => ({ a: [s.a[0], s.a[1], s.a[2]], b: [s.b[0], s.b[1], s.b[2]] })),
  };

  group.traverse((o) => {
    if (o.isPoints) {
      o.frustumCulled = false;
    }
  });

  let disposed = false;
  return {
    group,
    ready: Promise.all([ready, shapeReady, impReady]).then(() => true),
    uniforms,
    distanceToExit(cameraPos) {
      return cameraPos.distanceTo(group.userData.exitPosition);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      shapeGeo.dispose();
      impGeo.dispose();
      starGeo.dispose();
      material.dispose();
      shapeMat.dispose();
      impMat.dispose();
      starMat.dispose();
      portal.group.traverse((o) => {
        if (o.isPoints) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
      for (const s of surfaces) { s.geometry.dispose(); s.material.dispose(); }
      if (hallBuilt) hallBuilt.dispose();
      if (cityBuilt) cityBuilt.dispose();
    },
  };
}
