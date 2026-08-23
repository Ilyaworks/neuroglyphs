import { mulberry32, strToSeed } from "../core/rng.js";

export const FORMULAS = [
  { text: "i² + 1 = 0", mood: "serene" },
  { text: "e^(iπ) + 1 = 0", mood: "serene" },
  { text: "∇·E = ρ/ε₀", mood: "serene" },
  { text: "F = ma", mood: "serene" },
  { text: "∂²u/∂t² = c²∇²u", mood: "eerie" },
  { text: "∇×B = μ₀J + μ₀ε₀∂E/∂t", mood: "eerie" },
  { text: "Δx·Δp ≥ ℏ/2", mood: "eerie" },
  { text: "S = k·ln(W)", mood: "eerie" },
  { text: "f(λ) = A·e^(-λt)", mood: "void" },
  { text: "∫e^(-x²)dx = √π", mood: "void" },
  { text: "ζ(s) = Σn^(-s)", mood: "void" },
  { text: "R_μν - ½Rg_μν = 8πT_μν", mood: "void" },
  { text: "a² + b² = c²", mood: "joyful" },
  { text: "φ = (1+√5)/2", mood: "joyful" },
  { text: "P(A|B) = P(B|A)P(A)/P(B)", mood: "joyful" },
  { text: "E = mc²", mood: "joyful" },
  { text: "∮E·dl = -dΦ/dt", mood: "uncanny" },
  { text: "det(A-λI) = 0", mood: "uncanny" },
  { text: "∇²φ = 0", mood: "uncanny" },
  { text: "x = (-b±√(b²-4ac))/2a", mood: "uncanny" },
  { text: "lim(n→∞)(1+1/n)^n = e", mood: "claustrophobic" },
  { text: "Σ1/n² = π²/6", mood: "claustrophobic" },
  { text: "dS/dt ≥ 0", mood: "claustrophobic" },
  { text: "∇×E = -∂B/∂t", mood: "claustrophobic" },
];

function rasterize(text) {
  const canvas = document.createElement("canvas");
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.font = "48px monospace";
  const m = g.measureText(text);
  const w = Math.ceil(m.width) + 2;
  const h = 64;
  canvas.width = w;
  canvas.height = h;
  g.font = "48px monospace";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillStyle = "#fff";
  g.fillText(text, 1, h / 2);
  const data = g.getImageData(0, 0, w, h).data;
  const pixels = [];
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a > 128) {
        pixels.push(x, y);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { pixels, w, h, minX, maxX, minY, maxY };
}

export function buildFormulaPlane(text, opts = {}) {
  const count = opts.count ?? 2000;
  const extent = opts.extent ?? 100;

  const { pixels, w, h, minX, maxX, minY, maxY } = rasterize(text);
  const n = pixels.length / 2;

  const realW = maxX - minX + 1;
  const realH = maxY - minY + 1;
  const scale = extent / realH;
  const width = realW * scale;
  const height = realH * scale;

  const xs = new Float32Array(count);
  const ys = new Float32Array(count);

  const step = n / count;
  for (let i = 0; i < count; i++) {
    const pi = Math.min(n - 1, Math.floor(i * step)) * 2;
    const px = pixels[pi];
    const py = pixels[pi + 1];
    xs[i] = (px - (minX + realW / 2)) * scale;
    ys[i] = ((maxY + realH / 2) - py) * scale;
  }

  return {
    count,
    fill(i, out) {
      out[0] = xs[i];
      out[1] = ys[i];
      out[2] = 0;
    },
    width,
    height,
    text,
  };
}
