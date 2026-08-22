// Эталон для tools/freeze-check.mjs: минимальный, но правильный осмотр со стороны.
// Гейт обязан быть зелёным на этом файле и красным на сломанном.
//
// Файл живёт в tools/ и приложением не импортируется. Гейт грузит его в странице,
// поэтому "three" здесь разрешается штатной importmap из index.html.
import { Vector3, Quaternion } from "three";

const SPIN = 0.35;      // радиан в секунду вокруг точки игрока
const START_RADIUS = 120;
const MIN_RADIUS = 20;
const MAX_RADIUS = 600;
const WHEEL_STEP = 0.12;
const HEIGHT = 0.25;    // подъём над точкой, в долях радиуса

export function createFreeze(camera, dom, flycam) {
  const anchor = new Vector3();
  const savedPos = new Vector3();
  const savedQuat = new Quaternion();
  let frozen = false;
  let radius = START_RADIUS;
  let angle = 0;

  function place() {
    camera.position.set(
      anchor.x + Math.sin(angle) * radius,
      anchor.y + radius * HEIGHT,
      anchor.z + Math.cos(angle) * radius,
    );
    camera.lookAt(anchor);
    camera.updateMatrixWorld(true);
  }

  function toggle() {
    if (!frozen) {
      // Запоминаем ровно то, что придётся вернуть: место и угол взгляда.
      savedPos.copy(camera.position);
      savedQuat.copy(camera.quaternion);
      anchor.copy(camera.position);
      angle = 0;
      frozen = true;
      place();
    } else {
      camera.position.copy(savedPos);
      camera.quaternion.copy(savedQuat);
      camera.updateMatrixWorld(true);
      frozen = false;
    }
  }

  const onKeyDown = (e) => {
    if (e.code !== "Tab") return;
    if (e.preventDefault) e.preventDefault();
    toggle();
  };
  const onWheel = (e) => {
    if (!frozen) return;
    const dir = (e.deltaY || 0) > 0 ? 1 : -1;
    radius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, radius * (1 + dir * WHEEL_STEP)));
    place();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("wheel", onWheel, { passive: true });

  function update(dt) {
    if (!frozen) return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    angle += SPIN * dt;
    place();
  }

  function isFrozen() { return frozen; }

  function dispose() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("wheel", onWheel);
    frozen = false;
    void flycam;
    void dom;
  }

  return { update, isFrozen, dispose };
}
