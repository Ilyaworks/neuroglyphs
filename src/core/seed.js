import { mulberry32 } from "./rng.js";

export const SEED_FIELDS = [
  { name: "structure", bits: 3 },
  { name: "palette", bits: 3 },
  { name: "mood", bits: 3 },
  { name: "density", bits: 4 },
  { name: "fractal", bits: 3 },
  { name: "motion", bits: 3 },
  { name: "nonEuclid", bits: 3 },
  { name: "music", bits: 4 },
  { name: "shape", bits: 6 },
  { name: "exit", bits: 8 },
];

function packFields(fields) {
  let packed = 0n;
  let shift = 0n;
  for (const f of SEED_FIELDS) {
    const v = fields[f.name];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= 1 << f.bits) {
      return null;
    }
    packed |= BigInt(v) << shift;
    shift += BigInt(f.bits);
  }
  return packed;
}

function toBase36(n) {
  if (n === 0n) return "0";
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  let s = "";
  while (n > 0n) {
    s = chars[Number(n % 36n)] + s;
    n /= 36n;
  }
  return s;
}

export function encodeSeed(fields) {
  const packed = packFields(fields);
  if (packed === null) return null;
  const base36 = toBase36(packed).padStart(12, "0");
  return `${base36.slice(0, 4)}-${base36.slice(4, 8)}-${base36.slice(8, 12)}`;
}

export function decodeSeed(code) {
  if (typeof code !== "string") return null;
  const parts = code.toLowerCase().split("-");
  if (parts.length !== 3) return null;
  const full = parts.join("");
  if (!/^[0-9a-z]{12}$/.test(full)) return null;
  let packed = 0n;
  for (let i = 0; i < 12; i++) {
    const c = "0123456789abcdefghijklmnopqrstuvwxyz".indexOf(full[i]);
    if (c < 0) return null;
    packed = packed * 36n + BigInt(c);
  }
  if (packed >= 1n << 40n) return null;
  const fields = { rng: mulberry32(Number(packed & 0xffffffffn) ^ Number(packed >> 32n)) };
  let shift = 0n;
  for (const f of SEED_FIELDS) {
    fields[f.name] = Number((packed >> shift) & ((1n << BigInt(f.bits)) - 1n));
    shift += BigInt(f.bits);
  }
  return fields;
}

export function randomSeed(rng) {
  const fields = {};
  for (const f of SEED_FIELDS) {
    fields[f.name] = Math.floor(rng() * (1 << f.bits));
  }
  return encodeSeed(fields);
}
