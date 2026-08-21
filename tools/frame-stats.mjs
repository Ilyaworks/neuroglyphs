// Разбор PNG-кадра: сколько пикселей светятся, средняя яркость, разнообразие цветов.
// Нужен, чтобы «чёрный экран» не считался успехом.
import zlib from 'node:zlib';

export function decodePng(buf) {
  let p = 8, w = 0, h = 0, depth = 0, type = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const tag = buf.toString('ascii', p + 4, p + 8);
    if (tag === 'IHDR') {
      w = buf.readUInt32BE(p + 8);
      h = buf.readUInt32BE(p + 12);
      depth = buf[p + 16];
      type = buf[p + 17];
    }
    if (tag === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  if (depth !== 8) throw new Error('поддерживается только 8 бит на канал, получено ' + depth);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error('неизвестный тип PNG: ' + type);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const row = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let v = row[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
  }
  return { data: out, w, h, channels };
}

export function frameStats(buf) {
  const { data, w, h, channels } = decodePng(buf);
  let lit = 0, sum = 0, max = 0;
  const hues = new Set();
  const total = w * h;
  for (let i = 0; i < total; i++) {
    const o = i * channels;
    const r = data[o], g = channels >= 3 ? data[o + 1] : r, b = channels >= 3 ? data[o + 2] : r;
    const lum = (r * 299 + g * 587 + b * 114) / 1000;
    sum += lum;
    if (lum > max) max = lum;
    if (lum > 24) {
      lit++;
      hues.add(((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5));
    }
  }
  return {
    width: w,
    height: h,
    litShare: lit / total,
    meanLum: sum / total,
    maxLum: max,
    colors: hues.size,
  };
}
