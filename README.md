# Neuroglyphs

An endless generative kaleidoscope explorer: infinite 3D worlds made entirely of glyphs,
formulas and light. One seed produces one deterministic world; the things you collect fold
back into the seed and shape the next world. Music is the heartbeat — everything pulses and
reacts to it.

> No goal, no victory, no death. Exploration and atmosphere are the point. Every world has
> exactly one rectangular exit; fill its shaped hole correctly and the next world is a
> curated one, ignore it and the next world is random.

## Состояние

Полный сброс кода 2026-08-21. Плана из старых задач `T00`–`T14` больше нет: работа идёт
по 62 мелким задачам `N01`–`N62`, разложенным на шесть демо-точек D1–D6.

- `.planning/CONCEPT.md` — дизайн целиком, источник истины
- `.planning/ISSUES.md` — задачи и дорожная карта
- `.planning/BACKLOG.md` — статусы, ведутся инструментами
- `.planning/REFERENCE.md` — чек-лист приёмки картинки

## Как ведётся работа

Код пишет локальная модель, по одной задаче за сессию. Человек только запускает сессии
строкой:

```
Первым действием выполни: node tools/next-task.mjs
Дальше делай ровно то, что он напечатал. Не составляй план.
```

Инструменты конвейера:

| команда | что делает |
|---|---|
| `node tools/next-task.mjs` | печатает промт следующей задачи; не выдаёт её, если проект сломан |
| `node tools/finish-task.mjs N01` | гоняет тесты, браузер и аудит, отмечает задачу, коммитит |
| `node tools/audit-task.mjs N01` | ищет `Math.random()`, заглушки, копипаст, правку тестов мимо задачи |
| `node tools/browser-check.mjs` | открывает страницу в headless Chrome, ловит ошибки, снимает скриншот |
| `node tools/report.mjs` | сводка для проверяющего: что сделано, что подозрительно, куда смотреть |
| `node tools/undo-task.mjs N01` | откат задачи через revert |
| `node tools/gh-issues.mjs --push` | заливка задач в GitHub issues (нужен `GITHUB_TOKEN`) |

Правила сессии, инварианты и грабли — в `.clinerules` (подгружается автоматически) и
`AGENTS.md`.

## Стек

Ни зависимостей, ни сборщика: Three.js приходит через CDN import map, статический сервер —
на голом Node. `npm run dev` поднимает сервер, `npm test` гоняет проверки детерминизма.

## License

MIT
