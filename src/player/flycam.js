const BASE_SPEED = 60;
const ACCEL = 10;
const SHIFT_MULT = 2;
const CTRL_MULT = 0.5;

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

  const onKeyDown = (e) => {
    if (KEY_CODES.has(e.code)) keys.add(e.code);
  };
  const onKeyUp = (e) => {
    if (KEY_CODES.has(e.code)) keys.delete(e.code);
  };
  const onWindowBlur = () => {
    keys.clear();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onWindowBlur);

  function setSpeed(v) {
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
    const right = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
    const up = (keys.has("Space") ? 1 : 0) - (keys.has("KeyC") ? 1 : 0);

    const q = camera.quaternion;
    const dirX = -(q.x * q.z * 2 + q.y * q.w * 2);
    const dirY = -(q.y * q.z * 2 - q.x * q.w * 2);
    const dirZ = -(1 - q.x * q.x - q.y * q.y);

    const rightX = q.w * q.w - q.x * q.x - q.y * q.y - q.z * q.z;
    const rightY = q.x * q.y * 2 + q.w * q.z * 2;
    const rightZ = q.x * q.z * 2 - q.w * q.y * 2;


    let tx = dirX * forward + rightX * right;
    let ty = dirY * forward + rightY * right + up;
    let tz = dirZ * forward + rightZ * right;

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
  }

  return { update, setSpeed, dispose };
}
