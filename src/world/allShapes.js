// Единый набор форм глифового поля: старые 169 + новые из каталога.
//
// Ничего не выбрасывается: при совпадении имён побеждает форма из shapeCatalog.js
// (она переработана), старая с тем же именем просто перекрывается.
// Что из этого набора реально попадает в мир — решают метрики, см. fieldShapes.js.
import { LEGACY_SHAPES, setRng as setLegacyRng } from './legacyShapes.js';
import { SHAPES as CATALOG_SHAPES } from './shapeCatalog.js';

export const ALL_SHAPES = { ...LEGACY_SHAPES, ...CATALOG_SHAPES };
export const ALL_SHAPE_KEYS = Object.keys(ALL_SHAPES);

/** Подставить сеяный генератор для старых форм (новые его не используют). */
export function setRng(fn) { setLegacyRng(fn); }
