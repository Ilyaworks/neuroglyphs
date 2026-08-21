import { encodeSeed, decodeSeed, SEED_FIELDS } from "../src/core/seed.js";
import { mulberry32 } from "../src/core/rng.js";

function fail(msg) {
  console.error("FAIL: " + msg);
  process.exit(1);
}

const MAX = (bits) => 1 << bits;

function randomFields(rng) {
  const f = {};
  for (const field of SEED_FIELDS) {
    f[field.name] = Math.floor(rng() * MAX(field.bits));
  }
  return f;
}

// 1. Круговой прогон decodeSeed(encodeSeed(f)) на 10 000 наборов полей
{
  const rng = mulberry32(12345);
  for (let i = 0; i < 10000; i++) {
    const f = randomFields(rng);
    const code = encodeSeed(f);
    if (code === null) fail("test 1: encodeSeed returned null for valid fields at i=" + i);
    const d = decodeSeed(code);
    if (d === null) fail("test 1: decodeSeed returned null for valid code at i=" + i);
    for (const field of SEED_FIELDS) {
      if (d[field.name] !== f[field.name]) {
        fail("test 1: roundtrip mismatch field " + field.name + " at i=" + i);
      }
    }
  }
}

// 2. Формат строки: XXXX-XXXX-XXXX из символов base36
{
  const rng = mulberry32(67890);
  for (let i = 0; i < 1000; i++) {
    const code = encodeSeed(randomFields(rng));
    if (!/^[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/.test(code)) {
      fail("test 2: bad format " + code + " at i=" + i);
    }
  }
}

// 3. null на мусоре: не строка, пустая строка, неверное число групп, недопустимые символы
{
  const garbage = [
    42,
    null,
    undefined,
    {},
    [],
    "",
    "0000",
    "0000-0000",
    "0000-0000-0000-0000",
    "0000-0000-00000",
    "0000-0000-000!",
    "0000-0000-0000 ",
    " 0000-0000-0000",
    "0000_0000_0000",
    "0000-0000-0000\n",
    "00-00000000-00",
    "000-00000-0000",
    "0-0-0000000000",
  ];
  for (const g of garbage) {
    if (decodeSeed(g) !== null) fail("test 3: decodeSeed should be null for " + JSON.stringify(g));
  }
}

// 4. null на коде, который не влезает в 40 бит, например zzzz-zzzz-zzzz
{
  const overflow = [
    "zzzz-zzzz-zzzz",
    "zzzz-zzzz-zzzy",
    "zzzz-zzzz-zzzx",
    "zzzz-zzzz-zyzz",
    "zzzz-zyzz-zzzz",
    "zyzz-zzzz-zzzz",
    "zzzz-zzzz-zzzz",
  ];
  for (const c of overflow) {
    if (decodeSeed(c) !== null) fail("test 4: decodeSeed should be null for overflow code " + c);
  }
  const maxCode = (36n ** 12n - 1n) >> 0n;
  if (maxCode >= 1n << 40n) {
    // 36^12 - 1 >= 2^40, so the top of the space overflows
  }
  if (decodeSeed("zzzz-zzzz-zzzz") !== null) fail("test 4: zzzz-zzzz-zzzz should be null");
}

// 5. Каноничность: encodeSeed(decodeSeed(code)) === code на 1000 кодов из encodeSeed
{
  const rng = mulberry32(24680);
  for (let i = 0; i < 1000; i++) {
    const code = encodeSeed(randomFields(rng));
    const d = decodeSeed(code);
    const re = encodeSeed(d);
    if (re !== code) fail("test 5: canonicality failed " + code + " -> " + re + " at i=" + i);
  }
}

// 6. Один код даёт один и тот же первый бросок rng; верхний регистр = нижний
{
  const rng = mulberry32(13579);
  const f = randomFields(rng);
  const code = encodeSeed(f);
  const a = decodeSeed(code).rng();
  const b = decodeSeed(code).rng();
  if (a !== b) fail("test 6: same code gave different rng first throw " + a + " vs " + b);
  const upper = code.toUpperCase();
  const c = decodeSeed(upper).rng();
  if (c !== a) fail("test 6: uppercase code gave different rng first throw " + c + " vs " + a);
}

// 7. Изменение любого поля меняет первый бросок rng — по всем десяти полям, включая exit
{
  const base = {
    structure: 0,
    palette: 0,
    mood: 0,
    density: 0,
    fractal: 0,
    motion: 0,
    nonEuclid: 0,
    music: 0,
    shape: 0,
    exit: 0,
  };
  const baseCode = encodeSeed(base);
  const baseRng = decodeSeed(baseCode).rng();
  for (const field of SEED_FIELDS) {
    const f = { ...base, [field.name]: 1 };
    const code = encodeSeed(f);
    const r = decodeSeed(code).rng();
    if (r === baseRng) {
      fail("test 7: changing field " + field.name + " did not change rng first throw");
    }
  }
}

console.log("SEED_OK");
