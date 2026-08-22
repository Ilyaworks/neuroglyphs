import * as THREE from "three";
import { createWorld } from "./world/world.js";
import { buildComposer } from "./render/post.js";
import { createFlyCam } from "./player/flycam.js";
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

export const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  5000,
);

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  post.resize(width, height);
}

window.addEventListener("resize", resize);

const post = buildComposer(renderer, scene, camera);

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
  post.composer.render();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
