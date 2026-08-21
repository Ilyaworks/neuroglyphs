export function strToSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seedInt) {
  let a = seedInt >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash32(n) {
  let x = (n + 0x9e3779b9) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x21f0aaad) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x735a2d97) >>> 0;
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
