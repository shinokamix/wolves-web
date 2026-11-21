# AI Travel Planner / wolves-web

Простой перенос `ai-travel-planner` на BroJS: React 18 SPA в корне, Express API
в `agent/`. Next.js больше не нужен. Сохранены страницы и Tailwind-стили исходника,
поездки, локации, карта, глобус, AI, публичная ссылка и печать.

## Первый запуск

Нужны Node.js 22+ и PostgreSQL. Команды выполняются из `main/`.

```bash
npm run setup
cp agent/.env.example agent/.env
```

В `agent/.env` задайте `DATABASE_URL` и `AUTH_SECRET` (случайная строка от 32 символов;
сгенерировать: `openssl rand -hex 32`). Для локальной базы есть `compose.yaml`:

```bash
docker compose up -d db
npm --prefix agent run db:migrate
npm run dev
```

Фронт: http://localhost:8099/wolves-web. API: http://localhost:8787, проверка запуска:
http://localhost:8787/health. Регистрация по email работает без OAuth.
`npm start` запускает только фронт, `npm --prefix agent run dev` — только API.

Для существующей базы укажите её `DATABASE_URL`: схема и история миграций сохранены
из исходника. Файлы конфигурации с секретами не коммитятся.

## Дополнительные интеграции

| Возможность | Настройка |
|---|---|
| AI | `OPENROUTER_API_KEY`, при необходимости `OPENROUTER_MODEL` в `agent/.env` |
| Другой LLM-провайдер | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` в `agent/.env` |
| Поиск места по адресу | `GOOGLE_MAPS_API_KEY` в `agent/.env`; без ключа можно ввести координаты вручную |
| Отображение карты | `wolves-web.google-maps-key` в конфигурации BroJS; локально `GOOGLE_MAPS_PUBLIC_KEY=... npm run dev` |
| Изображения | URL картинки в форме; загрузка файла требует `UPLOADTHING_TOKEN` в `agent/.env` |
| OAuth | Пары `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, аналогично для Facebook и Apple |

OAuth-кнопки появляются только для настроенных провайдеров. Callback для Google
локально: `http://localhost:8787/api/auth/callback/google` (для остальных меняется
последний сегмент). Используется Auth.js для Express, с JWT-сессией в HttpOnly-cookie.

## Структура

```text
src/
  app.tsx          # маршруты и общая оболочка
  pages/           # экраны
  components/      # компоненты исходника и UI-примитивы
  api/             # HTTP-клиент, авторизация, поездки, типы, сессия
  lib/             # небольшие вспомогательные функции
  styles.css       # Tailwind и стили исходника
agent/
  src/             # Express, авторизация, поездки, AI, загрузка
  prisma/          # исходная PostgreSQL-схема и миграции
  tests/           # HTTP-контракт и серверные проверки
```

`agent/` — самостоятельный пакет со своим lock-файлом и зависимостями,
без npm workspaces. Prisma и ключи провайдеров используются только сервером.
Даты передаются через API как ISO-строки. CSS генерируется перед запуском/сборкой
и обновляется в watch-режиме при разработке.

## Проверки и сборка

```bash
npm run check                   # форматирование, lint, типы фронта и API
npm test                        # тесты HTTP-клиента, API, Auth.js, AI-промптов и JSON
npm run build:prod              # production BroJS-бандл в dist/
npm --prefix agent run build    # сборка API в agent/dist/
npm --prefix agent start        # запуск собранного API
```

Серверные тесты проверяют настоящий обмен Auth.js/CSRF/cookie, но подменяют Prisma
и LLM: для них не нужны PostgreSQL и платные API. Вызовы Google, OAuth-провайдеров,
UploadThing и LLM требуют соответствующих ключей и отдельной проверки с ними.

## Размещение

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

## Следующий этап

LangGraph, тарифы/mock-оплата, библиотека работы с данными, CSS-in-JS и CI/CD
остаются задачами следующего этапа из `REQUIREMENTS.md`. Текущий перенос сохраняет
прямые AI-запросы и Tailwind, как договорились для первого рабочего варианта.
