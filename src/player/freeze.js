import { Vector3, Quaternion, Euler } from "three";

const ORBIT_SPEED = Math.PI / 4;
const WHEEL_STEP = 0.08;
const MIN_RADIUS = 2;
const MAX_RADIUS = 200;

export function createFreeze(camera, dom, flycam) {
  let frozen = false;
  let disposed = false;
  let radius = 12;
  let heading = 0;
  let pitch = 0;
  let savedPos = null;
  let savedQuat = null;

  const target = new Vector3();
  const offset = new Vector3();
  const up = new Vector3(0, 1, 0);
  const euler = new Euler(0, 0, 0, "YXZ");
  const fwd = new Vector3();
  const right = new Vector3();

  const onKeyDown = (e) => {
    if (disposed) return;
    if (e.code !== "Tab") return;
    e.preventDefault();
    if (frozen) {
      frozen = false;
      if (savedPos) camera.position.copy(savedPos);
      if (savedQuat) camera.quaternion.copy(savedQuat);
      camera.updateMatrixWorld(true);
      if (flycam && flycam.syncFromCamera) flycam.syncFromCamera();
    } else {
      frozen = true;
      savedPos = camera.position.clone();
      savedQuat = camera.quaternion.clone();
      camera.getWorldDirection(fwd);
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      heading = Math.atan2(right.x, right.z);
      pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
      radius = 12;
    }
  };

  const onWheel = (e) => {
    if (disposed) return;
    if (!frozen) return;
    const step = (e.deltaY || 0) * WHEEL_STEP;
    if (!Number.isFinite(step) || step === 0) return;
    radius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, radius + step));
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("wheel", onWheel, { passive: true });

  function isFrozen() {
    return frozen;
  }

  function update(dt) {
    if (disposed) return;
    if (typeof dt !== "number" || !Number.isFinite(dt) || dt <= 0) return;
    if (!frozen) return;

    target.copy(savedPos);

    heading += ORBIT_SPEED * dt;
    const cp = Math.cos(pitch);
    offset.set(Math.sin(heading) * cp, Math.sin(pitch), Math.cos(heading) * cp).multiplyScalar(radius);
    camera.position.copy(target).add(offset);
    camera.up.copy(up);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
  }

  function dispose() {
    disposed = true;
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("wheel", onWheel);
  }

  return { update, isFrozen, dispose };
}
