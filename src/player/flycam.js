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

export function createFlyCam(camera, dom) {
  const keys = new Set();
  let speed = BASE_SPEED;
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
    const up = (keys.has("Space") ? 1 : 0) - (keys.has("KeyC") ? 1 : 0);

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

    camera.position.x += velX * dt;
    camera.position.y += velY * dt;
    camera.position.z += velZ * dt;
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

  return { update, setSpeed, dispose };
}
