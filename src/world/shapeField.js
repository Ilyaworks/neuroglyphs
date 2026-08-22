import { SHAPES, SHAPE_KEYS } from './shapeCatalog.js';

export function buildShapeField(fields, opts = {}) {
  const count = Math.max(1, Math.floor(opts.count ?? 6000));
  const extent = opts.extent ?? 400;
  const shape = Number.isInteger(fields && fields.shape) ? fields.shape : 0;
  const key = SHAPE_KEYS[shape % SHAPE_KEYS.length];
  const fn = SHAPES[key];
  const params = {
    radius: extent * 0.5,
    flatten: 0.8,
    distPow: 0.8,
    tubeR: extent * 0.025,
    arms: 4,
    twist: 4,
    spread: 0.6,
    thickness: extent * 0.02,
    strands: 3,
    turns: 4,
    clusterCount: 6,
    clusterRadius: extent * 0.03,
    freq: 0.3,
    amp: extent * 0.02,
    knotP: 3,
    knotQ: 4,
  };
  return {
    key,
    count,
    params,
    fill(i, out) {
      const j = count >= 2000 ? (i % 2000) : Math.floor(i * 2000 / count);
      fn(j, params, out);
    },
  };
}
