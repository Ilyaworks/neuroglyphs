// Зал со сферой: вертикальный срез по кадру референса.
//
// Из тринадцати кадров человек выбрал монохромный зал: две зеркальные аркады, крупная
// сфера в знаках посередине, шахматный пол с отражением, строго один тон. Через этот
// зал проходит вся цепочка проекта — язык, грамматика сборки, знаки на поверхностях,
// пол, композиция. Он собран НЕ из своих кирпичей: колонны и арки берутся из языка мира,
// расстановка — из грамматики. Иначе зал был бы красивым исключением, а не местом в городе.
//
// Модуль не импортирует three: наружу выходят числа и описания поверхностей.
import { mulberry32, strToSeed } from "../core/rng.js";
import { assemble } from "./grammar.js";

const PLAYER = 18;          // рост игрока в единицах мира
const NAVE_MIN = PLAYER * 3.4;

// Габарит элемента считается по его же облаку: язык отдаёт форму, а не коробку, и
// подгонять коробку на глазок значит расходиться с тем, что будет нарисовано.
function footprintOf(variant, samples = 400) {
  const out = [0, 0, 0];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const step = Math.max(1, Math.floor(variant.count / samples));
  for (let i = 0; i < variant.count; i += step) {
    variant.fill(i, out);
    for (let k = 0; k < 3; k++) {
      if (out[k] < min[k]) min[k] = out[k];
      if (out[k] > max[k]) max[k] = out[k];
    }
  }
  return {
    size: [Math.max(1, max[0] - min[0]), Math.max(1, max[1] - min[1]), Math.max(1, max[2] - min[2])],
    lo: min,
  };
}

export function buildHall(seedCode, language, opts = {}) {
  const rng = mulberry32(strToSeed(String(seedCode) + ":hall"));
  const floorY = opts.floorY !== undefined ? opts.floorY : 0;

  // Колонна — форма языка. Предпочитаем стоячие: плита, шпиль, тетраэдр. Если язык
  // таких не знает, берём первую его форму: зал обязан остаться в языке города.
  const upright = ["slab", "spire", "tetra", "diamond"];
  const forms = (language && language.forms) || ["slab"];
  const colForm = forms.find((f) => upright.includes(f)) || forms[0];
  const spanForm = forms.includes("arch") ? "arch" : colForm;

  const colVar = language.variantOf(colForm, rng);
  const colFoot = footprintOf(colVar);

  // Колонна должна быть КОЛОННОЙ. Если брать масштаб по высоте, приземистая форма
  // раздувается в куб шириной с неф: у сида 0000-3n56-4p2k выходили опоры 136 в ширину
  // при 162 в высоту. Масштаб берётся по ШИРИНЕ, а высота добирается вытягиванием —
  // форма остаётся узнаваемой, но становится опорой.
  const colW = PLAYER * (1.3 + rng() * 0.6);
  const grow = colW / colFoot.size[0];
  const colH = PLAYER * (8 + rng() * 4);
  const stretchY = colH / Math.max(1e-6, colFoot.size[1] * grow);
  const foot = [colW, colH, colFoot.size[2] * grow];

  const bays = 5 + Math.floor(rng() * 3);
  const built = assemble("mirror", { footprint: foot }, String(seedCode) + ":hall", { count: bays * 2 });

  // Ширина нефа приходит из грамматики; если она узка для прохода, раздвигаем аркады.
  let naveHalf = Math.abs(built.places[0].at[0]);
  const widen = naveHalf * 2 < NAVE_MIN ? NAVE_MIN / (naveHalf * 2) : 1;
  naveHalf *= widen;

  const columns = built.places.map((p) => ({
    at: [p.at[0] * widen, floorY, p.at[2]],
    scale: p.scale * grow,
    stretch: [1, stretchY, 1],
    turn: p.turn,
    form: colForm,
  }));

  const zs = columns.map((c) => c.at[2]);
  const depth = Math.max(1, Math.max(...zs) - Math.min(...zs)) + foot[2] * 2;
  const zNear = Math.max(...zs) + foot[2];
  const zFar = zNear - depth;

  // Арки поверх колонн: перекрывают пролёт между соседними опорами одной стороны.
  const spanVar = language.variantOf(spanForm, rng);
  const spanFoot = footprintOf(spanVar);
  const arches = [];
  const bySide = { left: [], right: [] };
  for (const c of columns) (c.at[0] < 0 ? bySide.left : bySide.right).push(c);
  for (const side of ["left", "right"]) {
    const row = bySide[side].slice().sort((a, b) => b.at[2] - a.at[2]);
    for (let i = 0; i + 1 < row.length; i++) {
      const z = (row[i].at[2] + row[i + 1].at[2]) / 2;
      const span = Math.abs(row[i].at[2] - row[i + 1].at[2]);
      arches.push({
        at: [row[i].at[0], floorY + colH, z],
        scale: (span / Math.max(1, spanFoot.size[0])) * 1.05,
        stretch: [1, 0.55, 1],
        turn: row[i].turn,
        form: spanForm,
        span,
      });
    }
  }

  // Сфера: предмет кадра. Стоит на оси, в дальней половине, и она крупная — на кадре
  // она занимает середину и читается сразу.
  const sphereR = Math.min(naveHalf * 0.82, colH * 0.42);
  const sphere = {
    center: [0, floorY + sphereR * 1.25, zNear - depth * (0.55 + rng() * 0.12)],
    radius: sphereR,
  };

  const wallX = naveHalf + foot[0] * 1.9;
  const wallH = colH * 1.5;
  const gateW = Math.min(wallX * 1.4, naveHalf * 1.7);

  const walls = [
    { origin: [-wallX, floorY, zFar], u: [0, 0, 1], v: [0, 1, 0], w: depth, h: wallH },
    { origin: [wallX, floorY, zFar], u: [0, 0, 1], v: [0, 1, 0], w: depth, h: wallH },
    { origin: [-wallX, floorY, zFar], u: [1, 0, 0], v: [0, 1, 0], w: wallX * 2, h: wallH },
  ];
  // Ближняя стена с проёмом: два простенка, между ними вход. Без неё зал открыт спереди
  // во всю ширину и залом не читается — читается навесом.
  const jamb = wallX - gateW / 2;
  if (jamb > 1) {
    walls.push({ origin: [-wallX, floorY, zNear], u: [1, 0, 0], v: [0, 1, 0], w: jamb, h: wallH });
    walls.push({ origin: [gateW / 2, floorY, zNear], u: [1, 0, 0], v: [0, 1, 0], w: jamb, h: wallH });
  }

  const gates = [{ center: [0, floorY, zNear], width: gateW, height: colH, normal: [0, 0, 1] }];

  const floorPlan = {
    origin: [-wallX, floorY, zFar],
    u: [1, 0, 0], v: [0, 0, 1],
    w: wallX * 2, h: depth,
    cell: Math.min(wallX * 2, depth) / (10 + Math.floor(rng() * 5)),
  };

  // Глаз стоит ВНУТРИ зала, а не в дверях: от порога тот же зал читается коробочкой
  // посреди кадра, потому что до дальней стены полкилометра. Отойдя на пятую часть
  // глубины внутрь, игрок оказывается между ближними колоннами — и они возвышаются
  // над ним, как на кадре референса.
  const eye = [0, floorY + PLAYER * 0.5, zNear - depth * 0.2];

  const marksWall = ["string", "lattice", "formula", "edge"];
  const surfaces = [
    { role: "sphere", spec: { type: "sphere", center: sphere.center, radius: sphere.radius },
      marks: ["lattice", "string", "formula"] },
    { role: "wall", spec: { type: "plane", origin: [-wallX, floorY, zFar], u: [0, 0, 1], v: [0, 1, 0], w: depth, h: wallH },
      marks: marksWall },
    { role: "wall", spec: { type: "plane", origin: [wallX, floorY, zFar], u: [0, 0, 1], v: [0, 1, 0], w: depth, h: wallH },
      marks: marksWall },
    { role: "wall", spec: { type: "plane", origin: [-wallX, floorY, zFar], u: [1, 0, 0], v: [0, 1, 0], w: wallX * 2, h: wallH },
      marks: ["emblem", "string", "lattice", "edge"] },
    { role: "floor", spec: { type: "plane", origin: [-wallX, floorY, zFar], u: [1, 0, 0], v: [0, 0, 1], w: wallX * 2, h: depth },
      marks: ["pattern", "marking", "lattice"] },
    // Свод: зал накрыт. Без него сверху видно небо, и помещение перестаёт быть
    // помещением — а на кадре референса зал закрыт со всех сторон.
    { role: "ceiling", spec: { type: "plane", origin: [-wallX, floorY + wallH, zFar], u: [1, 0, 0], v: [0, 0, 1], w: wallX * 2, h: depth },
      marks: ["lattice", "pattern", "edge"] },
  ];

  return {
    floorY,
    bounds: { min: [-wallX, floorY, zFar], max: [wallX, floorY + wallH, zNear] },
    axis: { from: [0, floorY, zNear], to: [0, floorY, zFar] },
    eye,
    columns,
    arches,
    sphere,
    walls,
    gates,
    floorPlan,
    naveHalfWidth: naveHalf,
    element: { footprint: foot },
    spanElement: { footprint: spanFoot.size },
    forms: { column: colForm, span: spanForm },
    surfaces,
  };
}
