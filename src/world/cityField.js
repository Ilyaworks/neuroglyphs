// Город на экране: план из city.js застраивается языком и грамматикой.
//
// Каждый участок получает свою постройку: улица — решётку плит, колоннада — ряд опор,
// башня — стопку ярусов, двор — веер, туннель — кольца по оси. Зал строится отдельно,
// через halls.js: он предмет города, и у него свой договор.
//
// Стены ставятся ТОЛЬКО там, где нет прохода к соседу. Отсюда и лабиринт: город
// огорожен сам собой, и дорога в нём читается по проёмам, а не по разметке.
import * as THREE from "three";
import { mulberry32, strToSeed } from "../core/rng.js";
import { buildFieldMaterial } from "./fieldMaterial.js";
import { buildSurfaceField } from "./surfaceField.js";
import { assemble } from "./grammar.js";
import { buildHall } from "./halls.js";
import { buildHallField } from "./hallField.js";
import { buildSolids } from "./solids.js";

// Стена города обязана быть СПЛОШНОЙ: сквозь редкую россыпь знаков видно весь город
// разом, и он читается макетом, а не местом. Сплошной её делает крупная плитка обоев —
// знаки в ней стоят вплотную и перекрывают друг друга.
//
// Плитка КРУПНАЯ намеренно: мелкая дала бы ту же сплошность за пятнадцать тысяч точек
// на стену, а таких стен в городе четыре десятка. Крупная стоит тысячу с небольшим.
const CITY_WALL_MARKS = ["lattice", "string", "edge", "panel", "emblem", "formula"];
const CITY_WALL_TILE = 0.085;
const CITY_FLOOR_MARKS = ["pattern", "marking"];

function footprintOf(variant, samples = 200) {
  const out = [0, 0, 0];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const step = Math.max(1, Math.floor(variant.count / samples));
  for (let i = 0; i < variant.count; i += step) {
    variant.fill(i, out);
    for (let k = 0; k < 3; k++) {
      if (out[k] < min[k]) min[k] = out[k];
      if (out[k] > max[k]) max[k] = out[k];
    }
  }
  return {
    size: [Math.max(1, max[0] - min[0]), Math.max(1, max[1] - min[1]), Math.max(1, max[2] - min[2])],
    lo: min,
  };
}

// lift — насколько поднять элемент, чтобы он СТОЯЛ НА ПОЛУ. У кольца, ромба и купола
// начало координат в середине, и без подъёма половина постройки уходит под пол.
function placePoint(local, place, origin, out, lift) {
  const st = place.stretch || [1, 1, 1];
  const x = local[0] * st[0] * place.scale;
  const y = (local[1] - (lift || 0)) * st[1] * place.scale;
  const z = local[2] * st[2] * place.scale;
  const t = place.turn || 0;
  const c = Math.cos(t), s = Math.sin(t);
  out[0] = origin[0] + place.at[0] + x * c - z * s;
  out[1] = origin[1] + place.at[1] + y;
  out[2] = origin[2] + place.at[2] + x * s + z * c;
  return out;
}

export function buildCityField(city, language, atlas, opts = {}) {
  const group = new THREE.Group();
  const parts = [];
  const seed = String(opts.seed || "city");
  const rng = mulberry32(strToSeed(seed + ":cityfield"));
  const glyphs = (language && language.glyphs) || [0, 1, 2, 3];

  const mk = (geo, name) => {
    const { material, uniforms } = buildFieldMaterial(atlas, { fogDensity: opts.fogDensity });
    if (opts.spectrum) material.uniforms.uSpectrum.value = opts.spectrum.map((c) => new THREE.Color(c));
    if (opts.uPulse) uniforms.uPulse = opts.uPulse;
    if (opts.uTime) uniforms.uTime = opts.uTime;
    const pts = new THREE.Points(geo, material);
    pts.frustumCulled = false;
    pts.userData.cityPart = name;
    group.add(pts);
    parts.push({ points: pts, geometry: geo, material });
  };

  const byId = new Map(city.areas.map((a) => [a.id, a]));
  const openSides = new Map(city.areas.map((a) => [a.id, new Set()]));
  for (const l of city.links) {
    const a = byId.get(l.a), b = byId.get(l.b);
    if (!a || !b) continue;
    const dx = b.cell[0] - a.cell[0], dj = b.cell[1] - a.cell[1];
    openSides.get(a.id).add(dx === 1 ? "east" : dx === -1 ? "west" : dj === 1 ? "south" : "north");
    openSides.get(b.id).add(dx === 1 ? "west" : dx === -1 ? "east" : dj === 1 ? "north" : "south");
  }

  // ── постройки ───────────────────────────────────────────────────────────────
  const bodies = [];
  let total = 0;
  for (const area of city.areas) {
    if (area.kind === "hall") continue;   // зал строится своим модулем
    // На участке ВХОДА построек нет. Постройка ставится в середину участка, а игрок
    // появляется там же — он оказывался ВНУТРИ здания, и экран был сплошной заливкой.
    // По кадрам референса человек и стоит на пустой площади.
    const isPlaza = area.id === city.spawn;
    const form = language.forms[Math.floor(rng() * language.forms.length)];
    const variant = language.variantOf(form, mulberry32(strToSeed(seed + ":area" + area.id)));
    const fp = footprintOf(variant);
    const foot = fp.size;
    // Постройка соразмерна участку: элемент подгоняется под клетку, а не наоборот.
    const want = area.size[0] * 0.16;
    const scale = want / foot[0];
    const built = assemble(area.rule, { footprint: [foot[0] * scale, foot[1] * scale, foot[2] * scale] },
      seed + ":" + area.id, { count: 4 + Math.floor(rng() * 4) });
    if (!isPlaza) {
      bodies.push({ area, variant, scale, places: built.places, lift: fp.lo[1] });
      total += variant.count * built.places.length;
    }

    // Предметы: одиночные вещи СЛУЧАЙНОЙ формы, стоящие по участку. Постройка задаёт
    // строй, предметы его разбивают — без них участок читается образцом застройки,
    // а не местом, где что-то произошло.
    const things = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < things; k++) {
      const tf = language.forms[Math.floor(rng() * language.forms.length)];
      const tv = language.variantOf(tf, mulberry32(strToSeed(seed + ":thing" + area.id + ":" + k)));
      const tfp = footprintOf(tv);
      // Размер вещи — от четверти до полутора ростов игрока по ширине: это предмет,
      // а не здание. Здания строит грамматика, вещи стоят между ними.
      const tw = 18 * (0.6 + rng() * 2.2);
      const ts = tw / tfp.size[0];
      // Ставим ближе к краю участка, чтобы проход посередине оставался свободным.
      const a = rng() * Math.PI * 2;
      // Вещи стоят НА УЛИЦЕ, вокруг квартала, а не внутри массива: внутрь здания их
      // всё равно не видно, а на улице они и разбивают строй.
      const r = area.size[0] * (0.36 + rng() * 0.12);
      bodies.push({
        area, variant: tv, scale: ts, lift: tfp.lo[1], isThing: true,
        places: [{ at: [Math.cos(a) * r, 0, Math.sin(a) * r], scale: 1, turn: rng() * Math.PI * 2, stretch: [1, 1, 1] }],
      });
      total += tv.count;
    }
  }

  if (total) {
    const pos = new Float32Array(total * 3);
    const gl = new Float32Array(total);
    const sz = new Float32Array(total);
    const off = new Float32Array(total);
    const local = [0, 0, 0], world = [0, 0, 0];
    let w = 0;
    for (let bi = 0; bi < bodies.length; bi++) {
      const b = bodies[bi];
      const origin = [b.area.center[0], b.area.floorY, b.area.center[2]];
      for (const place of b.places) {
        const p = { ...place, scale: place.scale * b.scale };
        for (let i = 0; i < b.variant.count; i++) {
          b.variant.fill(i, local);
          placePoint(local, p, origin, world, b.lift);
          pos[w * 3] = world[0]; pos[w * 3 + 1] = world[1]; pos[w * 3 + 2] = world[2];
          gl[w] = glyphs[(w * 7 + bi) % glyphs.length];
          sz[w] = 2.2;
          off[w] = ((bi % 4) + 0.5) / 4;
          w++;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos.subarray(0, w * 3), 3));
    geo.setAttribute("glyph", new THREE.BufferAttribute(gl.subarray(0, w), 1));
    geo.setAttribute("size", new THREE.BufferAttribute(sz.subarray(0, w), 1));
    geo.setAttribute("offset", new THREE.BufferAttribute(off.subarray(0, w), 1));
    geo.computeBoundingSphere();
    mk(geo, "bodies");
  }

  // ── кварталы: здание посреди клетки, улица вокруг ───────────────────────────
  // Модель перевёрнута по второму листу референса. Раньше участок был КОМНАТОЙ со
  // стенами по краям: с непрозрачными телами игрок оказывался внутри коробки. На кадрах
  // же улица идёт МЕЖДУ массивами — здание стоит посреди квартала, а дорога обходит его.
  // Ширина улицы к высоте здания примерно один к трём: это и есть каньон.
  const surfaces = [];
  const BLOCK = 0.62;          // какую долю клетки занимает здание
  for (const area of city.areas) {
    if (area.kind === "hall") continue;   // зал — не глухой массив, в него входят
    // Участок входа остаётся ПЛОЩАДЬЮ: игрок появляется на открытом месте, а не
    // упирается носом в стену. На кадрах референса человек тоже стоит на площади.
    if (area.id === city.spawn) continue;
    const bw = area.size[0] * BLOCK, bd = area.size[2] * BLOCK;
    const h = area.size[1];
    const x0 = area.center[0] - bw / 2, z0 = area.center[2] - bd / 2;
    // Сторона сдвига задана ЯВНО. Нормаль плоскости — это векторное произведение её
    // осей, и наружу оно смотрит не всегда: на двух гранях из четырёх знаки уезжали
    // ВНУТРЬ здания и пропадали за его же телом. Грань выходила чёрной.
    const faces = [
      [[x0, area.floorY, z0], [1, 0, 0], bw, -1],
      [[x0, area.floorY, z0 + bd], [1, 0, 0], bw, 1],
      [[x0, area.floorY, z0], [0, 0, 1], bd, 1],
      [[x0 + bw, area.floorY, z0], [0, 0, 1], bd, -1],
    ];
    for (let k = 0; k < faces.length; k++) {
      const [origin, u, len, side] = faces[k];
      surfaces.push({
        role: "face:" + area.id + ":" + k,
        spec: { type: "plane", origin, u, v: [0, 1, 0], w: len, h },
        marks: CITY_WALL_MARKS,
        side,
      });
    }
    // Тело чуть МЕНЬШЕ граней: знаки на гранях остаются снаружи и не тонут в нём.
    area.block = { min: [x0 + 1, area.floorY, z0 + 1], max: [x0 + bw - 1, area.floorY + h, z0 + bd - 1] };
  }

  // Пол — общий на весь город, одним полотном: у каждого участка свой давал швы
  // и лишние тысячи точек на стыках.
  {
    const b = city.bounds;
    surfaces.push({
      role: "ground",
      spec: { type: "plane", origin: [b.min[0], city.floorY, b.min[2]], u: [1, 0, 0], v: [0, 0, 1],
        w: b.max[0] - b.min[0], h: b.max[2] - b.min[2] },
      marks: CITY_FLOOR_MARKS,
    });
  }

  // ── тела для столкновений ───────────────────────────────────────────────────
  // Стена — тонкая коробка по своей длине, постройка — коробка по своему габариту.
  // Их и получит collide.js: сквозь них пройти нельзя.
  const solids = [];
  for (const area of city.areas) {
    if (area.block) solids.push(area.block);
  }
  // Тела предметов и построек — с ОГРАНИЧИТЕЛЕМ. Без него одна вещь с вытянутой формой
  // раздувалась до размеров квартала и накрывала камеру целиком: экран становился
  // сплошной заливкой, и понять это по кадру было нельзя — пришлось красить тела в
  // яркий цвет, чтобы увидеть, где они на самом деле.
  // Вещь не бывает размером с квартал. Без раздельных пределов одна вытянутая форма
  // раздувалась до трёхсот единиц в поперечнике и накрывала камеру целиком: экран
  // становился сплошной заливкой, и понять это по кадру было нельзя — пришлось красить
  // тела в яркий цвет, чтобы увидеть, где они на самом деле.
  const BODY_LIMIT = city.cell * 0.5;
  const THING_LIMIT = 34;
  for (const b of bodies) {
    const cap = b.isThing ? THING_LIMIT : BODY_LIMIT;
    for (const place of b.places) {
      const sc = place.scale * b.scale;
      const fw = footprintOf(b.variant).size;
      const hx = Math.min(cap, fw[0] * sc * 0.5);
      const hz = Math.min(cap, fw[2] * sc * 0.5);
      const hy = Math.min(cap * (b.isThing ? 3 : 6), fw[1] * sc);
      if (hx < 2 || hz < 2 || hy < 2) continue;
      solids.push({
        min: [b.area.center[0] + place.at[0] - hx, b.area.floorY, b.area.center[2] + place.at[2] - hz],
        max: [b.area.center[0] + place.at[0] + hx, b.area.floorY + hy, b.area.center[2] + place.at[2] + hz],
      });
    }
  }

  for (let i = 0; i < surfaces.length; i++) {
    const item = surfaces[i];
    const built = buildSurfaceField(seed + ":" + item.role, item.spec, atlas, {
      marks: item.marks, language, fogDensity: opts.fogDensity, spectrum: opts.spectrum,
      salt: item.role,
      tile: item.role.startsWith("face:") ? CITY_WALL_TILE : undefined,
      // Знаки лежат чуть снаружи тела: иначе их съедает буфер глубины.
      lift: item.role.startsWith("face:") ? 9 * (item.side || 1) : 0,
    });
    if (opts.uPulse) built.uniforms.uPulse = opts.uPulse;
    if (opts.uTime) built.uniforms.uTime = opts.uTime;
    built.points.userData.cityPart = item.role;
    group.add(built.points);
    parts.push(built);
  }

  // ── непрозрачные тела ───────────────────────────────────────────────────────
  // Те же коробки, что ушли в столкновения, ставятся и в кадр — тёмными массивами.
  // Без них светящиеся точки только складывают свет и не заслоняют ничего: сквозь любую
  // стену виден весь город разом, и он читается макетом.
  const bodyMesh = buildSolids(opts.noSolids ? [] : solids, {});
  group.add(bodyMesh.group);
  parts.push({ dispose: () => bodyMesh.dispose() });

  // ── зал ─────────────────────────────────────────────────────────────────────
  let hall = null, hallField = null;
  const hallArea = city.areas.find((a) => a.kind === "hall");
  if (hallArea) {
    hall = buildHall(seed, language, { floorY: hallArea.floorY });
    hallField = buildHallField(hall, language, atlas, {
      seed: seed + ":hall", spectrum: opts.spectrum, fogDensity: opts.fogDensity,
      uPulse: opts.uPulse, uTime: opts.uTime,
    });
    // Зал ставится в свою клетку: у halls.js своя система координат от нуля.
    hallField.group.position.set(hallArea.center[0], 0, hallArea.center[2] + hall.bounds.max[2]);
    group.add(hallField.group);
    parts.push(...hallField.parts);
  }

  const spawnArea = byId.get(city.spawn);
  const portalArea = byId.get(city.portal);

  group.userData.city = {
    spawn: spawnArea ? [spawnArea.center[0], city.floorY, spawnArea.center[2]] : [0, city.floorY, 0],
    portal: portalArea ? [portalArea.center[0], city.floorY, portalArea.center[2]] : [0, city.floorY, 0],
    hallAt: hallArea ? [hallArea.center[0], city.floorY, hallArea.center[2]] : null,
    areas: city.areas.map((a) => a.kind),
    bounds: city.bounds,
    floorY: city.floorY,
    solids,
  };

  return {
    group, parts, hall,
    dispose() {
      for (const p of parts) {
        if (typeof p.dispose === "function") { p.dispose(); continue; }
        if (p.geometry) p.geometry.dispose();
        if (p.material) p.material.dispose();
      }
    },
  };
}
