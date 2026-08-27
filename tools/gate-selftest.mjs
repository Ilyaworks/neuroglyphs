// Самопроверка гейта: общий каркас.
//
// Гейт, который никто не проверял, ничего не охраняет. В этом проекте уже трижды
// оказывалось, что проверка мерит не то: доля заполнения габарита не отличала честный
// результат от подделки, центр краски нормировался сам на себя, порог обрезания строки
// был флаком с запасом 7%. А в заглушке floor-check не было класса Mesh, и гейт
// запрещал единственную правильную конструкцию.
//
// Поэтому у каждого гейта есть эталон договора и набор порч. Правило простое:
//
//   * эталон обязан ПРОЙТИ — иначе гейт требует того, чего в договоре нет;
//   * каждая порча обязана УПАСТЬ, и упасть ПО СВОЕЙ причине.
//
// Последнее условие важнее, чем кажется. На surface-check четыре порчи из шести падали
// по посторонней ошибке, и проверка нормалей при этом не работала ни разу — без сверки
// причины это выглядело бы как «гейт кусается».
//
// Порча включается через globalThis.__MUTATE до импорта модуля.

export async function selfTest({ title, fixture, mutations, runOnce }) {
  console.log('#'.repeat(78));
  console.log('САМОПРОВЕРКА ГЕЙТА: ' + title);
  console.log('эталон обязан пройти, каждая порча — упасть по своей причине');
  console.log('#'.repeat(78));

  let failures = 0;

  globalThis.__MUTATE = '';
  console.log('');
  console.log('--- эталон ---');
  const base = await runOnce(fixture);
  if (base.length) {
    console.log('  !! ЭТАЛОН НЕ ПРОШЁЛ — гейт требует того, чего нет в договоре:');
    for (const p of base) console.log('     ' + p);
    failures++;
  } else {
    console.log('  эталон прошёл');
  }

  for (const [name, what, because] of mutations) {
    globalThis.__MUTATE = name;
    console.log('');
    console.log('--- порча "' + name + '": ' + what + ' ---');
    let problems = [];
    try {
      problems = await runOnce(fixture);
    } catch (e) {
      problems = ['порча уронила гейт с исключением: ' + e.message];
    }
    if (!problems.length) {
      console.log('  !! ГЕЙТ СЛЕП: порча прошла насквозь');
      failures++;
      continue;
    }
    const hit = problems.some((p) => p.includes(because));
    if (!hit) {
      console.log('  !! упало, но НЕ ПО ТОЙ ПРИЧИНЕ: ждали претензию про "' + because + '"');
      for (const p of problems) console.log('     ' + p);
      failures++;
    } else {
      console.log('  поймано по своей причине: "' + because + '"');
    }
  }
  globalThis.__MUTATE = '';

  console.log('');
  console.log('#'.repeat(78));
  if (failures) {
    console.log('САМОПРОВЕРКА ПРОВАЛЕНА: ' + failures + ' — гейту верить нельзя');
    return 1;
  }
  console.log('САМОПРОВЕРКА ПРОЙДЕНА: эталон проходит, все ' + mutations.length + ' порч ловятся');
  return 0;
}

// Импорт модуля заново на каждую порчу: без метки в адресе node отдаёт кэш, и все
// порчи проверялись бы на одном и том же коде.
export function freshUrl(href) {
  return href + '?mutate=' + (globalThis.__MUTATE || 'base');
}
