// Непрозрачные тела города: тёмные массивы, которые ЗАСЛОНЯЮТ.
//
// Корень жалобы «мир прозрачный». Всё в проекте сложено из светящихся точек с аддитивным
// смешением, а такое облако не заслоняет ничего В ПРИНЦИПЕ: оно только складывает свет,
// сколько его ни уплотняй. Сквозь любую стену виден весь город разом.
//
// На листе референса здания — сплошные тёмные массивы, а знаки светятся НА ИХ ГРАНЯХ.
// Значит нужны обычные непрозрачные коробки, пишущие в буфер глубины, и точки поверх них.
//
// Тела почти чёрные не для красоты: светиться должны знаки, а не сама постройка.
// Тело чуть светлее фона даёт грань силуэта — по ней здание и читается на фоне неба.
import * as THREE from "three";

const BODY_COLOR = 0x05070c;   // почти фон, но не фон: силуэт различим
const EDGE_COLOR = 0x0d1420;   // рёбра чуть светлее, чтобы грань читалась

export function buildSolids(boxes, opts = {}) {
  const group = new THREE.Group();
  if (!boxes || !boxes.length) return { group, dispose() {} };

  const geom = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: opts.color !== undefined ? opts.color : BODY_COLOR,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  });

  // Один инстансный меш на весь город: тел под сотню, и каждое отдельным объектом
  // стоило бы сотни вызовов отрисовки на кадр.
  const mesh = new THREE.InstancedMesh(geom, material, boxes.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    pos.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    scl.set(
      Math.max(1, b.max[0] - b.min[0]),
      Math.max(1, b.max[1] - b.min[1]),
      Math.max(1, b.max[2] - b.min[2]),
    );
    m.compose(pos, q, scl);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  // Тела рисуются ПЕРВЫМИ: они заполняют буфер глубины, и всё, что за ними, отсекается.
  // Светящиеся знаки идут следом и ложатся поверх.
  mesh.renderOrder = -10;
  mesh.userData.noReflect = false;
  group.add(mesh);

  // Рёбра: тонкая светлая обводка граней. По ней постройка читается объёмом, а не
  // чёрным провалом — ровно как на кадрах референса.
  if (opts.edges !== false) {
    const positions = [];
    for (const b of boxes) {
      const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
      const v = [
        [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
        [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
      ];
      const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4],
                 [0, 4], [1, 5], [2, 6], [3, 7]];
      for (const [a, c] of e) {
        positions.push(v[a][0], v[a][1], v[a][2], v[c][0], v[c][1], v[c][2]);
      }
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    const em = new THREE.LineBasicMaterial({
      color: opts.edgeColor !== undefined ? opts.edgeColor : EDGE_COLOR,
      transparent: true, opacity: 0.7, depthWrite: false,
    });
    const lines = new THREE.LineSegments(eg, em);
    lines.frustumCulled = false;
    lines.renderOrder = -9;
    group.add(lines);
  }

  return {
    group,
    mesh,
    dispose() {
      geom.dispose();
      material.dispose();
      group.traverse((o) => {
        if (o.isLineSegments) { o.geometry.dispose(); o.material.dispose(); }
      });
    },
  };
}
