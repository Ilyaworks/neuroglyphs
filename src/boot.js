import * as THREE from "three";
import { createWorld } from "./world/world.js";
import { buildGlyphAtlas } from "./core/atlas.js";
import { buildComposer } from "./render/post.js";
import { buildFloor } from "./render/floor.js";
import { buildFieldGeometry } from "./world/fieldGeometry.js";
import { buildFieldMaterial } from "./world/fieldMaterial.js";
import { buildFormulaPlane, FORMULAS } from "./world/textField.js";
import { createFlyCam } from "./player/flycam.js";
import { buildCollider } from "./player/collide.js";
import { createFreeze } from "./player/freeze.js";

const canvas = document.getElementById("scene");

export const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x555555, 0.0011);
scene.background = new THREE.Color(0x0a0a0a);

const frameFns = [];

export function onFrame(fn) {
  frameFns.push(fn);
}

const world = createWorld();
scene.add(world.group);
const palette = world.group.userData.palette;
scene.background = new THREE.Color(palette.bg);
scene.fog = new THREE.FogExp2(new THREE.Color(palette.fog), world.group.userData.fogDensity);
onFrame((dt) => {
  world.uniforms.uTime.value += dt;
  world.uniforms.uPulse.value = 0.5 + 0.5 * Math.sin(world.uniforms.uTime.value * 2.0);
});

const seedCode = world.group.userData.seed;

export const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  5000,
);

// Пол строится ТОЛЬКО после того, как геометрия мира наполнилась.
// buildFieldGeometry заполняет атрибуты порциями по кадрам и разрешает world.ready
// в конце. Пол, построенный раньше, снимает зеркальные копии с НЕДОСТРОЕННОГО мира:
// почти все точки ещё сидят в начале координат, копии оказываются комком у камеры,
// а линия пола считается по этому комку. Замером: на момент ранней постройки облака
// занимали по высоте всего от -18 до 18 при настоящем размахе -321..306, и пол
// садился на -19, то есть в середину мира. Именно так получались «дубли глифов
// вокруг» вместо отражения под ногами.
const FLOOR_EYE = 8;
const worldBounds = world.group.userData.bounds;
let floorLine = -Infinity;

world.ready.then(() => {
  const floor = buildFloor(seedCode, world);
  // Пол — не мир: метку userData.seed с его группы снимаем, иначе гейты
  // (mood-check, figure-check), ищущие группу мира по этой метке, найдут пол.
  delete floor.group.userData.seed;
  scene.add(floor.group);
  floorLine = floor.group.userData.floorY;

  // Игрок стоит НА полу, а не висит посреди мира. Пол лежит под всеми отражаемыми
  // объектами, значит весь мир оказывается НАД игроком — и отражается.
  const city = world.group.userData.city;
  const hall = world.group.userData.hall;
  if (city) {
    // Игрок появляется на входном участке города и смотрит в сторону зала: к нему и
    // идут, он предмет города.
    camera.position.set(city.spawn[0], Math.max(city.spawn[1] + FLOOR_EYE, floorLine + FLOOR_EYE), city.spawn[2]);
    const look = city.hallAt || city.portal;
    camera.lookAt(look[0], city.spawn[1] + 40, look[2]);
    textMesh.visible = false;
    // Осязаемость и ходьба: сквозь стены не пройти, по полу ходят. Тела города знает
    // сам город — камере про них знать незачем, она получает готовый ограничитель.
    const col = buildCollider(seedCode, {
      floorY: city.floorY, solids: city.solids, spawn: [city.spawn[0], city.floorY + 9, city.spawn[2]],
    });
    camera.position.set(col.spawn[0], col.spawn[1], col.spawn[2]);
    flyCam.setConstraint((f, to, out) => col.resolve(f, to, out));
    flyCam.setWalk(true, (x, z) => col.groundAt(x, z));
  } else if (hall) {
    // Срез по кадру референса: игрок стоит В ПРОЁМЕ зала, на оси, и смотрит вглубь —
    // за сферу. Именно с этой точки кадр и складывается тем, что на референсе.
    camera.position.set(hall.eye[0], Math.max(hall.eye[1], floorLine + FLOOR_EYE), hall.eye[2]);
    camera.lookAt(hall.axis.to[0], hall.eye[1] + hall.bounds.max[1] * 0.12, hall.axis.to[2]);
    textMesh.visible = false;
  } else {
    camera.position.set(
      (worldBounds.min[0] + worldBounds.max[0]) / 2,
      floorLine + FLOOR_EYE,
      (worldBounds.min[2] + worldBounds.max[2]) / 2 + worldBounds.size[2] * 0.30,
    );
  }
});

// Надписи из глифов: строка по настроению сида, плоскость смотрит на камеру.
const atlas = buildGlyphAtlas();
const mood = palette.mood || "serene";
const formula = (FORMULAS.find((f) => f.mood === mood) || FORMULAS[0]).text;
const plane = buildFormulaPlane(formula, { count: 1500, extent: 80 });
const { geometry: textGeo, ready: textReady } = buildFieldGeometry(plane.count, (i, out) => plane.fill(i, out));
const { material: textMat, uniforms: textUniforms } = buildFieldMaterial(atlas, { fogDensity: world.group.userData.fogDensity });
textMat.uniforms.uSpectrum.value = palette.glyph.map((c) => new THREE.Color(c));
textUniforms.uPulse = world.uniforms.uPulse;
textUniforms.uTime = world.uniforms.uTime;
const textMesh = new THREE.Points(textGeo, textMat);
textMesh.position.set(0, 40, -200);
textMesh.frustumCulled = false;
scene.add(textMesh);
textReady.then(() => {
  textMesh.lookAt(camera.position);
});

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  post.resize(width, height);
}

window.addEventListener("resize", resize);

export const post = buildComposer(renderer, scene, camera);

export const flyCam = createFlyCam(camera, canvas);
export const freeze = createFreeze(camera, canvas, flyCam);

let lastTime = performance.now();
let wasFrozen = false;

function tick(now) {
  const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1);
  lastTime = now;
  for (const fn of frameFns) fn(dt);
  const frozen = freeze.isFrozen();
  if (frozen) {
    freeze.update(dt);
  } else if (wasFrozen) {
    // Кадр сразу после выхода из осмотра: камера только что восстановлена,
    // полёт ещё не должен её двигать.
  } else {
    flyCam.update(dt);
  }
  wasFrozen = frozen;
  // Сквозь пол не проваливаемся. Ограничитель стоит ПОСЛЕ движения и перед
  // отрисовкой, а не до него: пока он стоял раньше flycam.update, камера успевала
  // уехать под пол в этом же кадре и кадр рисовался снизу. На Shift скорость
  // удваивается, за кадр это до 12 единиц — человек видел пространство под полом
  // именно так. Ограничитель после движения не даёт нарисовать ни одного такого
  // кадра, и заодно ловит осмотр со стороны (Tab), который тоже двигает камеру.
  if (camera.position.y < floorLine + 2) {
    camera.position.y = floorLine + 2;
  }
  post.composer.render();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
