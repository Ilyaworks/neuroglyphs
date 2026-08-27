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

// Стены участков пишутся без решётки: она даёт семь тысяч точек на стену, и город из
// десяти участков встал бы колом. Решётка остаётся залу — он того стоит.
const CITY_WALL_MARKS = ["string", "edge", "panel", "emblem", "formula"];
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
  return [Math.max(1, max[0] - min[0]), Math.max(1, max[1] - min[1]), Math.max(1, max[2] - min[2])];
}

function placePoint(local, place, origin, out) {
  const st = place.stretch || [1, 1, 1];
  const x = local[0] * st[0] * place.scale;
  const y = local[1] * st[1] * place.scale;
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
    const form = language.forms[Math.floor(rng() * language.forms.length)];
    const variant = language.variantOf(form, mulberry32(strToSeed(seed + ":area" + area.id)));
    const foot = footprintOf(variant);
    // Постройка соразмерна участку: элемент подгоняется под клетку, а не наоборот.
    const want = area.size[0] * 0.16;
    const scale = want / foot[0];
    const built = assemble(area.rule, { footprint: [foot[0] * scale, foot[1] * scale, foot[2] * scale] },
      seed + ":" + area.id, { count: 4 + Math.floor(rng() * 4) });
    bodies.push({ area, variant, scale, places: built.places });
    total += variant.count * built.places.length;
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
          placePoint(local, p, origin, world);
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

  // ── стены и полы ────────────────────────────────────────────────────────────
  const surfaces = [];
  for (const area of city.areas) {
    const half = area.size[0] / 2, halfD = area.size[2] / 2;
    const h = area.size[1];
    const x0 = area.center[0] - half, z0 = area.center[2] - halfD;

    surfaces.push({
      role: "floor:" + area.id,
      spec: { type: "plane", origin: [x0, area.floorY, z0], u: [1, 0, 0], v: [0, 0, 1], w: half * 2, h: halfD * 2 },
      marks: CITY_FLOOR_MARKS,
    });

    const open = openSides.get(area.id);
    const sides = [
      ["north", [x0, area.floorY, z0], [1, 0, 0], half * 2],
      ["south", [x0, area.floorY, area.center[2] + halfD], [1, 0, 0], half * 2],
      ["west", [area.center[0] - half, area.floorY, z0], [0, 0, 1], halfD * 2],
      ["east", [area.center[0] + half, area.floorY, z0], [0, 0, 1], halfD * 2],
    ];
    for (const [name, origin, u, len] of sides) {
      if (open.has(name)) {
        // Проём: два простенка по краям, между ними вход к соседу.
        const gap = len * 0.3;
        const jamb = (len - gap) / 2;
        if (jamb < 8) continue;
        surfaces.push({ role: "wall:" + area.id + ":" + name + ":a",
          spec: { type: "plane", origin, u, v: [0, 1, 0], w: jamb, h }, marks: CITY_WALL_MARKS });
        const o2 = [origin[0] + u[0] * (jamb + gap), origin[1], origin[2] + u[2] * (jamb + gap)];
        surfaces.push({ role: "wall:" + area.id + ":" + name + ":b",
          spec: { type: "plane", origin: o2, u, v: [0, 1, 0], w: jamb, h }, marks: CITY_WALL_MARKS });
      } else {
        surfaces.push({ role: "wall:" + area.id + ":" + name,
          spec: { type: "plane", origin, u, v: [0, 1, 0], w: len, h }, marks: CITY_WALL_MARKS });
      }
    }
  }

  for (let i = 0; i < surfaces.length; i++) {
    const item = surfaces[i];
    const built = buildSurfaceField(seed + ":" + item.role, item.spec, atlas, {
      marks: item.marks, language, fogDensity: opts.fogDensity, spectrum: opts.spectrum,
      salt: item.role,
    });
    if (opts.uPulse) built.uniforms.uPulse = opts.uPulse;
    if (opts.uTime) built.uniforms.uTime = opts.uTime;
    built.points.userData.cityPart = item.role;
    group.add(built.points);
    parts.push(built);
  }

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
  };

  return {
    group, parts, hall,
    dispose() {
      for (const p of parts) {
        if (p.geometry) p.geometry.dispose();
        if (p.material) p.material.dispose();
      }
    },
  };
}
