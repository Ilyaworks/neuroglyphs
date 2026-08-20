// NEUROGLYPHS — glyph texture atlas: draw each glyph to a canvas, pack into a
// grid texture. One atlas, shared by the field, the core, and the ring.
//
// Returns { texture, cols, rows, cell, indexFor }.
// Keep the atlas cache in this module (see CLAUDE.md conventions); dispose the
// texture on rebuild.
import * as THREE from 'three';
import { GLYPHS } from './glyphs.js';

export function buildGlyphAtlas(fontPx = 64, cell = 96) {
  const cols = 16;
  const rows = Math.ceil(GLYPHS.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${fontPx}px "Consolas","SF Mono","Menlo",monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(120,240,255,0.9)';
  ctx.shadowBlur = 8;

  const indexFor = new Map();
  for (let i = 0; i < GLYPHS.length; i++) {
    const cx = (i % cols) * cell + cell / 2;
    const cy = Math.floor(i / cols) * cell + cell / 2;
    ctx.fillText(GLYPHS[i], cx, cy);
    indexFor.set(GLYPHS[i], i);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return { texture, cols, rows, cell, indexFor };
}