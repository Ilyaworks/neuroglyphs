// План поверхностей мира: какие стены, стволы колонн, сферы и пол ставит каждая
// структура. Чем их покрыть — решают marks.js и surface.js.
//
// Лежит отдельно от layouts/index.js намеренно: layout-check считает КАЖДУЮ функцию,
// экспортированную из index.js, раскладкой и вызывает её как раскладку. Функция с
// другой подписью там валит гейт, и виноват будет не гейт.
//
// Это мостик до задач N70–N77: там структуры сменятся настоящими локациями, и список
// поверхностей будет приходить оттуда.

const WALL_MARKS  = ["emblem", "panel", "string", "formula", "edge", "rosette", "lattice"];
const FLOOR_MARKS = ["pattern", "marking", "string", "lattice", "rosette"];
const COLUMN_MARKS = ["formula", "string", "edge", "lattice", "rosette"];
const ORB_MARKS   = ["lattice", "string", "rosette", "emblem"];

export function layoutSurfaces(structure, rng, box) {
  const w = Math.max(240, box.x1 - box.x0);
  const list = [];

  // Расстановка ведётся от ТОЧКИ СТАРТА игрока, а не от начала координат и не от
  // середины процентильной коробки. Мир не обязан стоять на нуле, а его габарит
  // растягивают одиночные далёкие объекты: у сида 0000-8cng-bh0b середина по x
  // лежит на −41, и колонна по абсолютной координате вставала сбоку от камеры —
  // десять тысяч точек не давали ни одного пикселя. На части сидов стены и вовсе
  // оказывались за спиной. Замером: 55 поверхностей из 1025 вне кадра.
  const cx = box.camX !== undefined ? box.camX : (box.x0 + box.x1) / 2;
  const camZ = box.camZ !== undefined ? box.camZ : box.z1;

  // Ход начинается чуть впереди игрока и уходит вглубь, в −Z: туда он и смотрит.
  const near = camZ - 30;
  const deep = Math.min(box.z0, camZ - Math.max(420, box.z1 - box.z0));
  const d = near - deep;
  const wallH = Math.min(420, Math.max(90, Math.min(w, d) * 0.55));

  const x0 = cx - w / 2;
  const hx = Math.max(150, w * 0.42);
  const atZ = (f) => near + (deep - near) * f;
  const atX = (k) => cx + k * hx;

  const floor = () => list.push({
    role: "floor", marks: FLOOR_MARKS,
    spec: { type: "plane", origin: [x0, box.y0, deep], u: [1, 0, 0], v: [0, 0, 1], w, h: d },
  });
  // Стена вдоль хода: смотрит внутрь, стоит на полу.
  const sideWall = (k) => list.push({
    role: "wall", marks: WALL_MARKS,
    spec: { type: "plane", origin: [atX(k), box.y0, deep], u: [0, 0, 1], v: [0, 1, 0], w: d, h: wallH },
  });
  // Стена поперёк: дальняя грань помещения.
  const endWall = (f) => list.push({
    role: "wall", marks: WALL_MARKS,
    spec: { type: "plane", origin: [x0, box.y0, atZ(f)], u: [1, 0, 0], v: [0, 1, 0], w, h: wallH },
  });
  const column = (k, f, r) => list.push({
    role: "column", marks: COLUMN_MARKS,
    spec: { type: "cylinder", center: [atX(k), box.y0 + wallH * 0.5, atZ(f)], radius: r, height: wallH },
  });
  const orb = (k, f, r) => list.push({
    role: "orb", marks: ORB_MARKS,
    spec: { type: "sphere", center: [atX(k), box.y0 + wallH * 0.62, atZ(f)], radius: r },
  });

  switch (structure % 8) {
    case 0:   // коридор
      floor(); sideWall(-1); sideWall(1);
      column(-0.5, 0.45, wallH * 0.09);
      column(0.5, 0.7, wallH * 0.09);
      break;
    case 1:   // неевклидово: колоннада вокруг сферы
      floor(); orb(0, 0.7, wallH * 0.3);
      column(-0.55, 0.45, wallH * 0.08);
      column(0.55, 0.45, wallH * 0.08);
      column(0, 0.85, wallH * 0.08);
      break;
    case 2:   // кристаллическое: гранёные стены
      floor(); sideWall(-1); sideWall(0.8); endWall(0.9);
      break;
    case 3:   // органическое
      floor(); orb(0, 0.62, wallH * 0.36);
      column(0.5, 0.5, wallH * 0.1);
      break;
    case 4:   // геометрическое: зал с дальней стеной
      floor(); sideWall(-1); sideWall(1); endWall(0.92);
      column(-0.45, 0.55, wallH * 0.07);
      break;
    case 5:   // почти настоящее: улица
      floor(); sideWall(-1); sideWall(1); endWall(0.9);
      column(-0.6, 0.4, wallH * 0.07);
      column(0.6, 0.65, wallH * 0.07);
      break;
    case 6:   // пустота: одна дальняя стена и сфера
      endWall(0.9); orb(0, 0.6, wallH * 0.32);
      break;
    default:  // скрещённые миры
      floor(); sideWall(-1); orb(0.35, 0.6, wallH * 0.28);
      column(-0.4, 0.75, wallH * 0.09);
      break;
  }
  return list;
}

// ── формы языка в мире ────────────────────────────────────────────────────────
// Постройки этого города: арки, шпили, купола, плиты — те три-четыре формы, что выбрал
// язык, в своих вариациях. Расставлены вдоль хода, перед игроком, и стоят на полу.
//
// Часть ставится на ось хода вдалеке: без предмета в глубине коридор упирается в пустоту,
// а на каждом кадре референса в глубине что-то есть — портал, сфера, дальняя арка.

export function layoutForms(rng, box, language, opts = {}) {
  if (!language || !language.forms || !language.forms.length) return [];
  const w = Math.max(240, box.x1 - box.x0);
  const cx = box.camX !== undefined ? box.camX : (box.x0 + box.x1) / 2;
  const camZ = box.camZ !== undefined ? box.camZ : box.z1;
  const near = camZ - 60;
  const deep = Math.min(box.z0, camZ - Math.max(420, box.z1 - box.z0));
  const hx = Math.max(150, w * 0.42);

  const list = [];
  const count = opts.count || 9 + Math.floor(rng() * 5);
  for (let i = 0; i < count; i++) {
    const form = language.forms[Math.floor(rng() * language.forms.length)];
    // Две трети по бокам хода, треть — на оси в глубине.
    const onAxis = rng() < 0.32;
    const f = 0.2 + (i / count) * 0.7 + rng() * 0.08;
    const side = i % 2 === 0 ? -1 : 1;
    const off = onAxis ? (rng() - 0.5) * hx * 0.3 : side * hx * (0.45 + rng() * 0.7);
    list.push({
      form,
      at: [cx + off, box.y0, near + (deep - near) * Math.min(0.95, f)],
      // Дальние — крупнее: так глубина читается, а мелочь не теряется под ногами.
      grow: 0.7 + f * 0.9,
    });
  }
  return list;
}
