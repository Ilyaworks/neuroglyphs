import * as THREE from "three";
import { GLYPHS } from "./glyphs.js";

const FONT_SIZE = 48;

let cached = null;

function makeAtlas(cell, cols) {
  const rows = Math.ceil(GLYPHS.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.font = FONT_SIZE + "px monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#fff";
  for (let i = 0; i < GLYPHS.length; i++) {
    const cx = (i % cols) * cell;
    const cy = Math.floor(i / cols) * cell;
    const m = g.measureText(GLYPHS[i]);
    const boxW = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0);
    const boxH = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0);
    const dx = (m.actualBoundingBoxRight || 0) - (m.actualBoundingBoxLeft || 0);
    const dy = (m.actualBoundingBoxAscent || 0) - (m.actualBoundingBoxDescent || 0);
    g.fillText(GLYPHS[i], cx + cell / 2 + dx / 2, cy + cell / 2 + dy / 2);
    if (boxW > cell || boxH > cell) {
      throw new Error("glyph does not fit in cell: " + GLYPHS[i]);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const uv = (index) => {
    const c = index % cols;
    const r = Math.floor(index / cols);
    const pad = 0.5 / cell;
    return {
      u0: (c + pad) / cols,
      u1: (c + 1 - pad) / cols,
      v0: 1 - (r + 1 - pad) / rows,
      v1: 1 - (r + pad) / rows,
    };
  };
  return { texture, uv, cell, cols, rows, canvas };
}

export function buildGlyphAtlas(opts = {}) {
  const cell = opts.cell ?? 64;
  const cols = opts.cols ?? 16;
  if (cached && cached.cell === cell && cached.cols === cols) return cached;
  disposeAtlas();
  cached = makeAtlas(cell, cols);
  return cached;
}

export function disposeAtlas() {
  if (!cached) return;
  cached.texture.dispose();
  cached = null;
}
