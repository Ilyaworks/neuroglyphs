import * as THREE from "three";

const canvas = document.getElementById("scene");

export const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);

export const scene = new THREE.Scene();

export const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  5000,
);

const frameFns = [];

export function onFrame(fn) {
  frameFns.push(fn);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);

let lastTime = performance.now();

function tick(now) {
  const dt = Math.max((now - lastTime) / 1000, 0);
  lastTime = now;
  for (const fn of frameFns) fn(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
