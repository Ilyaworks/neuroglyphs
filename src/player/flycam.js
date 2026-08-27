import { Euler, Vector3 } from "three";

const BASE_SPEED = 60;
const ACCEL = 10;
const SHIFT_MULT = 2;
const CTRL_MULT = 0.5;

const MOUSE_SENS = 0.002;
const MAX_PITCH = Math.PI / 2 - 0.01;

const KEY_CODES = new Set([
  "KeyW", "KeyS", "KeyA", "KeyD", "Space", "KeyC",
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
]);

// Ходьба и осязаемость. Раньше камера летала свободно и проходила сквозь всё: мир
// от этого читается макетом, а не местом. Ограничитель приходит снаружи — полёту он
// не нужен, а городу нужен, и знать про город камере незачем.
const EYE_HEIGHT = 9;
const GRAVITY = 260;
const JUMP = 95;

export function createFlyCam(camera, dom) {
  const keys = new Set();
  let speed = BASE_SPEED;
  let constrain = null;     // (from, to, out) — куда игрок попадёт на самом деле
  let walking = false;      // ходьба: тяга вниз, вверх только прыжком
  let groundAt = null;      // высота пола под точкой
  let onGround = false;
  const from = [0, 0, 0], to = [0, 0, 0], solved = [0, 0, 0];
  let velX = 0;
  let velY = 0;
  let velZ = 0;
  let disposed = false;
  let yaw = 0;
  let pitch = 0;

  const dir = new Vector3();
  const right = new Vector3();
  const euler = new Euler(0, 0, 0, "YXZ");

  const onKeyDown = (e) => {
    if (KEY_CODES.has(e.code)) keys.add(e.code);
  };
  const onKeyUp = (e) => {
    if (KEY_CODES.has(e.code)) keys.delete(e.code);
  };
  const onWindowBlur = () => {
    keys.clear();
  };
  const onPointerLockChange = () => {
    if (document.pointerLockElement !== dom) keys.clear();
  };
  const onPress = () => {
    if (disposed) return;
    if (dom.requestPointerLock) dom.requestPointerLock();
  };
  const onMouseMove = (e) => {
    if (disposed) return;
    if (document.pointerLockElement !== dom) return;
    yaw -= (e.movementX || 0) * MOUSE_SENS;
    pitch -= (e.movementY || 0) * MOUSE_SENS;
    if (pitch > MAX_PITCH) pitch = MAX_PITCH;
    if (pitch < -MAX_PITCH) pitch = -MAX_PITCH;
    euler.set(pitch, yaw, 0);
    camera.quaternion.setFromEuler(euler);
    camera.updateMatrixWorld(true);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("pointerlockchange", onPointerLockChange);
  window.addEventListener("pointerdown", onPress);
  window.addEventListener("mousedown", onPress);
  window.addEventListener("click", onPress);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("pointermove", onMouseMove);

  function setSpeed(v) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return;
    speed = v;
  }

  function syncFromCamera() {
    euler.setFromQuaternion(camera.quaternion, "YXZ");
    yaw = euler.y;
    pitch = euler.x;
    velX = 0;
    velY = 0;
    velZ = 0;
  }

  function update(dt) {
    if (disposed) return;
    if (typeof dt !== "number" || !Number.isFinite(dt) || dt <= 0) return;

    const shift = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const ctrl = keys.has("ControlLeft") || keys.has("ControlRight");
    let mult = 1;
    if (shift) mult *= SHIFT_MULT;
    if (ctrl) mult *= CTRL_MULT;
    const target = speed * mult;

    const forward = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
    const rightKey = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
    // В ходьбе вертикаль клавишами не управляется: вверх — только прыжком.
    const up = walking ? 0 : (keys.has("Space") ? 1 : 0) - (keys.has("KeyC") ? 1 : 0);

    camera.updateMatrixWorld();
    camera.getWorldDirection(dir);
    right.setFromMatrixColumn(camera.matrixWorld, 0);

    let tx = dir.x * forward + right.x * rightKey;
    let ty = dir.y * forward + right.y * rightKey + up;
    let tz = dir.z * forward + right.z * rightKey;

    const len = Math.hypot(tx, ty, tz);
    if (len > 1) {
      tx /= len;
      ty /= len;
      tz /= len;
    }

    const k = 1 - Math.exp(-ACCEL * dt);
    velX += (tx * target - velX) * k;
    velY += (ty * target - velY) * k;
    velZ += (tz * target - velZ) * k;

    if (walking) {
      // Тяга вниз и прыжок. Горизонталь считается как обычно, вертикаль — своя.
      velY -= GRAVITY * dt;
      if (onGround && keys.has("Space")) { velY = JUMP; onGround = false; }
    }

    from[0] = camera.position.x; from[1] = camera.position.y; from[2] = camera.position.z;
    to[0] = from[0] + velX * dt;
    to[1] = from[1] + velY * dt;
    to[2] = from[2] + velZ * dt;

    if (constrain) {
      constrain(from, to, solved);
      // Упёрлись — гасим скорость по той оси, иначе игрок липнет к стене и потом
      // отскакивает, когда её отпустит.
      if (solved[0] === from[0] && to[0] !== from[0]) velX = 0;
      if (solved[2] === from[2] && to[2] !== from[2]) velZ = 0;
      to[0] = solved[0]; to[1] = solved[1]; to[2] = solved[2];
    }

    if (walking && groundAt) {
      const floor = groundAt(to[0], to[2]);
      if (to[1] <= floor + EYE_HEIGHT) {
        to[1] = floor + EYE_HEIGHT;
        if (velY < 0) velY = 0;
        onGround = true;
      } else {
        onGround = false;
      }
    }

    camera.position.set(to[0], to[1], to[2]);
  }

  function setConstraint(fn) { constrain = typeof fn === "function" ? fn : null; }
  function setWalk(on, ground) {
    walking = !!on;
    groundAt = typeof ground === "function" ? ground : null;
    if (walking) velY = 0;
  }

  function dispose() {
    disposed = true;
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onWindowBlur);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    window.removeEventListener("pointerdown", onPress);
    window.removeEventListener("mousedown", onPress);
    window.removeEventListener("click", onPress);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("pointermove", onMouseMove);
  }

  return { update, setSpeed, syncFromCamera, setConstraint, setWalk, dispose };
}
