import * as THREE from "three";
import { createWorld } from "./world/world.js";
import { buildComposer } from "./render/post.js";

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

let lastTime = performance.now();

function tick(now) {
  const dt = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1);
  lastTime = now;
  for (const fn of frameFns) fn(dt);
  post.composer.render();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
