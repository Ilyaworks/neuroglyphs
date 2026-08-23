// Эталон поля надписей: заведомо правильная реализация контракта N30.
// Нужен, чтобы у tools/textfield-check.mjs было на чём быть зелёным.
//
// Живёт в странице, а не в узле: буквы растеризует настоящий canvas, и никакой
// заглушкой это не подменить — именно растеризация и решает, будет ли надпись
// сделана из глифов или получится комок.
//
// Мутации — в window.__TEXT_MUTATE, гейт обязан краснеть на каждой.
import { mulberry32, strToSeed } from "../src/core/rng.js";

const mut = () => String((typeof window !== "undefined" && window.__TEXT_MUTATE) || "");

// 24 строки, по четыре на каждое из шести настроений palettes.js.
// Ни одна не сообщает игроку задачу — это декор атмосферы (инвариант 8).
const BASE = [
  { text: "d^2u/dt^2 = c^2 * nabla^2 u", mood: "serene" },
  { text: "e^(i*pi) + 1 = 0", mood: "serene" },
  { text: "F(w) = int f(t) e^(-i w t) dt", mood: "serene" },
  { text: "div E = rho / eps0", mood: "serene" },
  { text: "curl B = mu0 J + mu0 eps0 dE/dt", mood: "eerie" },
  { text: "S = -k sum p log p", mood: "eerie" },
  { text: "dS/dt >= 0", mood: "eerie" },
  { text: "lim x->0 sin x / x = 1", mood: "eerie" },
  { text: "R_uv - 1/2 g_uv R = 8 pi T_uv", mood: "void" },
  { text: "ds^2 = -dt^2 + dx^2", mood: "void" },
  { text: "nabla . B = 0", mood: "void" },
  { text: "H |psi> = E |psi>", mood: "void" },
  { text: "E = m c^2", mood: "joyful" },
  { text: "a^2 + b^2 = c^2", mood: "joyful" },
  { text: "phi = (1 + sqrt 5) / 2", mood: "joyful" },
  { text: "sum 1/n^2 = pi^2 / 6", mood: "joyful" },
  { text: "i d/dt psi = H psi", mood: "uncanny" },
  { text: "dx dp >= hbar / 2", mood: "uncanny" },
  { text: "Z = sum e^(-E/kT)", mood: "uncanny" },
  { text: "f(z) = sum a_n z^n", mood: "uncanny" },
  { text: "dV/dt + nabla . (V v) = 0", mood: "claustrophobic" },
  { text: "P(A|B) = P(B|A) P(A) / P(B)", mood: "claustrophobic" },
  { text: "det(A - lambda I) = 0", mood: "claustrophobic" },
  { text: "oint E . dl = -dPhi/dt", mood: "claustrophobic" },
];

// Мутации самого набора применяются на загрузке модуля: гейт ставит флаг до import.
export const FORMULAS = (() => {
  const m = mut();
  if (m === "moodless") return BASE.map((f) => f.text);          // просто 24 строки
  if (m === "fewmoods") return BASE.map((f) => ({ ...f, mood: "serene" }));
  if (m === "dupes") return BASE.map((f, i) => (i % 2 ? { ...f, text: BASE[0].text } : f));
  if (m === "short") return BASE.slice(0, 12);
  return BASE;
})();

const PX = 64;          // высота строки в пикселях растра
const FONT = 'px "Consolas", "Courier New", monospace';

function raster(text) {
  const m = mut();
  const drawn = m === "nospace" ? text.split(" ").join("") : text;
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = PX + FONT;
  const w = Math.max(1, Math.ceil(probe.measureText(drawn).width));
  const c = document.createElement("canvas");
  c.width = m === "fixedwidth" ? 512 : w;
  c.height = Math.ceil(PX * 1.7);
  const ctx = c.getContext("2d");
  ctx.font = PX + FONT;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  if (m === "boxfill") {
    // Заливка клетки каждого знака вместо отбора непрозрачных пикселей: надпись
    // становится полосой прямоугольников, «M» и «I» перестают отличаться.
    const cw = probe.measureText("M").width;
    for (let i = 0; i < drawn.length; i++) {
      if (drawn[i] === " ") continue;
      ctx.fillRect(i * cw, PX * 0.25, cw, PX);
    }
  } else if (m === "blob") {
    // Текст игнорируется вовсе: рассеянный эллипс вместо надписи.
    ctx.beginPath();
    ctx.ellipse(c.width / 2, c.height / 2, c.width / 2, c.height / 3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillText(m === "sametext" ? "E = m c^2" : drawn, 0, PX);
  }
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const ink = [];
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 40) ink.push(x, y);
    }
  }
  return { ink, w: c.width, h: c.height };
}

export function buildFormulaPlane(text, opts = {}) {
  const m = mut();
  const str = String(text ?? "");
  const target = Math.max(1, Math.floor(opts.count ?? 2000));
  const extent = m === "noextent" ? 100 : (opts.extent ?? 100);
  const { ink } = raster(str);
  const n = ink.length / 2;

  // Единиц мира на пиксель растра: высота строки в мире = extent.
  const scale = extent / PX;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = ink[i * 2], y = ink[i * 2 + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!n) { minX = maxX = minY = maxY = 0; }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

  const count = m === "nocount" ? n : target;
  const rng = m === "random" ? Math.random : mulberry32(strToSeed(str + ":formula"));
  // Дрожание внутри пикселя набирается заранее: fill обязан быть чистой функцией
  // от i, иначе один и тот же i даст разные точки при повторном обходе.
  const jitter = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) jitter[i] = rng();

  return {
    text: str,
    count,
    width: (maxX - minX) * scale,
    height: (maxY - minY) * scale,
    fill(i, out) {
      if (!n) { out[0] = out[1] = out[2] = 0; return; }
      // Точек может быть и больше, и меньше, чем пикселей краски. Больше — идём по
      // кругу с дрожанием; меньше — берём с равным шагом по всей надписи, а НЕ первые
      // count пикселей: пиксели идут построчно, и такой срез отрезал бы низ строки.
      const j = count >= n ? i % n : Math.floor((i * n) / count);
      const px = ink[j * 2] + jitter[i * 3] - 0.5;
      const py = ink[j * 2 + 1] + jitter[i * 3 + 1] - 0.5;
      out[0] = (px - cx) * scale;
      out[1] = -(py - cy) * scale;   // y растра вниз, y мира вверх
      out[2] = m === "solid" ? (jitter[i * 3 + 2] - 0.5) * extent : 0;
    },
  };
}
