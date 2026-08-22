// Эталон для tools/flycam-check.mjs: минимальный, но правильный полёт камеры.
// Гейт обязан быть зелёным на этом файле и красным на сломанном — инструмент,
// который не проходит ни на чём, ничего не проверяет.
//
// Файл живёт в tools/ и приложением не импортируется. Гейт грузит его в странице,
// поэтому "three" здесь разрешается штатной importmap из index.html.
import * as THREE from "three";

const KEYS = {
  KeyW: 'вперёд', KeyS: 'назад', KeyA: 'влево', KeyD: 'вправо',
  Space: 'вверх', KeyC: 'вниз',
  ShiftLeft: 'быстрее', ShiftRight: 'быстрее',
  ControlLeft: 'медленнее', ControlRight: 'медленнее',
};

export function createFlyCam(camera, dom) {
  const held = new Set();
  const velocity = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let base = 60;
  let yaw = 0;
  let pitch = 0;
  // Экспоненциальное сглаживание: чем больше, тем резче разгон и торможение.
  const SMOOTH = 8;
  const LOOK = 0.0022;
  const PITCH_LIMIT = Math.PI / 2 - 0.01;

  const onKeyDown = (e) => { if (KEYS[e.code]) { held.add(e.code); e.preventDefault?.(); } };
  const onKeyUp = (e) => { if (KEYS[e.code]) held.delete(e.code); };
  // Потеря фокуса окна: клавиши «залипают» нажатыми, и камера уезжает сама.
  const onBlur = () => held.clear();
  // Выход из захвата курсора (Escape) — тот же случай: мышь уже не управляет, а
  // зажатая клавиша продолжает нести камеру.
  const onLockChange = () => { if (document.pointerLockElement !== dom) held.clear(); };
  const onMouseDown = () => { dom?.requestPointerLock?.(); };
  const onMouseMove = (e) => {
    if (document.pointerLockElement !== dom) return;
    yaw -= (e.movementX || 0) * LOOK;
    pitch -= (e.movementY || 0) * LOOK;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onLockChange);
  if (dom && dom.addEventListener) dom.addEventListener('mousedown', onMouseDown);

  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    forward.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    desired.set(0, 0, 0);
    if (held.has('KeyW')) desired.add(forward);
    if (held.has('KeyS')) desired.sub(forward);
    if (held.has('KeyD')) desired.add(right);
    if (held.has('KeyA')) desired.sub(right);
    if (held.has('Space')) desired.add(up);
    if (held.has('KeyC')) desired.sub(up);
    if (desired.lengthSq() > 0) desired.normalize();

    let speed = base;
    if (held.has('ShiftLeft') || held.has('ShiftRight')) speed *= 3;
    if (held.has('ControlLeft') || held.has('ControlRight')) speed *= 0.3;
    desired.multiplyScalar(speed);

    // Плавно: скорость подтягивается к желаемой, а не прыгает на неё.
    const k = 1 - Math.exp(-SMOOTH * dt);
    velocity.lerp(desired, k);
    camera.position.addScaledVector(velocity, dt);
  }

  function setSpeed(v) { if (Number.isFinite(v) && v > 0) base = v; }

  function dispose() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('pointerlockchange', onLockChange);
    if (dom && dom.removeEventListener) dom.removeEventListener('mousedown', onMouseDown);
    held.clear();
    velocity.set(0, 0, 0);
  }

  return { update, setSpeed, dispose };
}
