# AI Travel Planner / wolves-web

Планировщик поездок. React-приложение на BroJS находится в `apps/web/`,
API на Hono находится в `apps/api/`.

## Локальный бэк

Нужны Node.js 22+ и запущенный PostgreSQL. Установи зависимости из корня
через `npm ci`. Скопируй `apps/api/.env.example` в `apps/api/.env` и задай
`DATABASE_URL` и `AUTH_SECRET`. Секрет можно получить командой
`openssl rand -hex 32`. Если API уже работал, сохрани прежний `AUTH_SECRET`,
чтобы не сбросить сессии.
Для базы через Docker есть команда `docker compose up -d db`.

- Только API: `npm run backend:local` применяет миграции и запускает API на порту 8787.
- Фронт и API: сначала `npm run db:migrate --workspace apps/api`, затем `npm run dev`.
  Фронт откроется на порту 8099, API на 8787.
- Если API уже запущен, для фронта достаточно `npm start`.
- Для туннеля запусти `npm run backend:tunnel` в другом терминале. Нужен `cloudflared`.

Для продового фронта задай `FRONTEND_URL`, `AUTH_CROSS_SITE_COOKIES=1`
и `TRUST_PROXY=1` в `apps/api/.env`. Адрес туннеля укажи в `wolves-web.agent` в BroJS.
После перезапуска туннеля адрес меняется. Для AI нужен `OPENROUTER_API_KEY`
или `LLM_API_KEY` в `apps/api/.env`.

## Дополнительные интеграции

| Возможность | Настройка |
|---|---|
| AI | `OPENROUTER_API_KEY`, при необходимости `OPENROUTER_MODEL` в `apps/api/.env` |
| Другой LLM-провайдер | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` в `apps/api/.env` |
| Поиск места по адресу | `GOOGLE_MAPS_API_KEY` в `apps/api/.env`; без ключа можно ввести координаты вручную |
| Отображение карты | `wolves-web.google-maps-key` в конфигурации BroJS; локально `GOOGLE_MAPS_PUBLIC_KEY=... npm run dev` |
| Изображения | URL картинки в форме; загрузка файла требует `UPLOADTHING_TOKEN` в `apps/api/.env` |
| OAuth | Пары `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, аналогично для Facebook и Apple |

OAuth-кнопки появляются только для настроенных провайдеров. Callback для Google
локально: `http://localhost:8787/api/auth/callback/google` (для остальных меняется
последний сегмент). Hono передаёт запросы Auth.js. JWT-сессия хранится в HttpOnly-cookie.

## Структура

```text
apps/web/             # BroJS, React, Tailwind, HTTP-клиент и заглушки API
apps/api/             # Hono, Prisma, авторизация, поездки, загрузка и AI
scripts/build-web.cjs # сборка фронта и перенос результата в корневой dist/
package.json          # команды для Jenkins и локальной разработки
compose.yaml          # локальный PostgreSQL
```

У каждого приложения свой `package.json`. npm workspaces использует один
корневой `package-lock.json` для обоих. Перед локальным запуском `prestart`
создаёт ссылки на `@brojs/fire.app` и `@brojs/templates` в
`apps/web/node_modules`, где BroJS ищет эти пакеты. Production-сборке ссылки не нужны.
У `react-i18next` внутри BroJS указана совместимость с TypeScript 5, а фронт
использует TypeScript 7. Корневой `overrides` действует только на эту зависимость BroJS.
Даты передаются через HTTP как ISO-строки. Новые миграции добавляем в
`apps/api/prisma/`.

## Проверки и сборка

```bash
npm run check                       # форматирование, lint, типы фронта и API
npm test                            # тесты фронта
npm run build:prod                  # production BroJS-бандл в dist/
npm run build --workspace apps/api  # сборка API в apps/api/dist/
npm run start --workspace apps/api  # запуск собранного API
```

Команды одного приложения запускай в его workspace. Например,
`npm run format --workspace apps/web` форматирует исходники фронта.

Для вызовов Google, OAuth-провайдеров, UploadThing и LLM нужны соответствующие ключи.

## Размещение

### Контракт с Jenkins

Следующие команды проверяют сборку, которую Jenkins запускает из корня.
Настройки Jenkins менять не нужно.

```bash
npm ci --progress=false --loglevel=error --fetch-retries=3
VERSION=main npm run build:prod
test -s dist/index.js
```

Корневой `npm ci` устанавливает оба пакета и генерирует Prisma Client.
Он не запускает API и не применяет миграции. Корневая команда `build:prod`
очищает старый `dist/`, собирает фронт в `apps/web/` и копирует бандл в корень
после проверки `index.js`. Jenkins забирает файлы из корневого `dist/`
и публикует их в `wolves-web/main` для ветки `main`.
Команда `npm run build:prod --workspace apps/web` оставляет файлы в `apps/web/dist/`.

### Настройки BroJS и API

Фронт размещается через BroJS с именем `wolves-web` и версией в `publicPath`.
Для API нужен отдельный Node.js-процесс. В админке BroJS задаются:

- навигация `wolves-web.main`: `/wolves-web`;
- конфигурация `wolves-web.agent`: базовый URL API без завершающего `/api`;
- конфигурация `wolves-web.google-maps-key`: публичный ключ карты, если она нужна.

В API задайте `FRONTEND_URL` с полным адресом приложения и префиксом маршрутов.
Для cookie-сессий размещайте фронт и API на одном сайте, например через reverse proxy
`/travel-agent` на домене фронта; тогда `wolves-web.agent` равен `/travel-agent`.
Прокси должен снимать этот префикс, передавать cookie и не буферизовать AI-стрим.
За одним доверенным прокси задайте `TRUST_PROXY=1` и при необходимости `AUTH_URL`
с публичным адресом `/api/auth`. HTTP deep links должны возвращать оболочку BroJS.

Для HTTPS-туннеля включите `AUTH_CROSS_SITE_COOKIES=1` в `apps/api/.env`.
Это включает cookie с `SameSite=None; Secure; Partitioned`.
Для постоянного размещения предпочтителен прокси на домене фронта.

## Следующий этап

LangGraph, тарифы/mock-оплата, библиотека работы с данными, CSS-in-JS и CI/CD
остаются задачами следующего этапа из `REQUIREMENTS.md`. Текущий перенос сохраняет
прямые AI-запросы и Tailwind, как договорились для первого рабочего варианта.
