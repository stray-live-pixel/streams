# Сторонние компоненты

Игра использует Babylon.js под лицензией Apache-2.0. Полный текст берётся из `node_modules/@babylonjs/core/license.md` вместе с NOTICE.md пакета и включается сборщиком в готовый HTML. Зависимости сборки не нужны игроку.

Иконки вступления — Lucide из пакета `lucide-react` (ISC, часть унаследованных иконок — MIT). Полный текст `node_modules/lucide-react/LICENSE` включается в HTML. React и React DOM нужны только при сборке SVG и не входят в приложение.

Исходные модели и иллюстрации:

- Kenney Fantasy Town Kit: https://kenney.nl/assets/fantasy-town-kit — CC0, `assets/kenney-fantasy-town/License.txt`.
- Kenney Pirate Kit: https://kenney.nl/assets/pirate-kit — CC0, `assets/kenney-pirate/License.txt`.

Полные скачанные наборы сохраняются в репозитории. Геометрия выбранных моделей преобразуется, масштабируется и соединяется в постройки; палитра читается из исходных текстур. Структура используемых наборов указана в `assets/manifest.json`.

Фон главного меню `assets/art/main-menu.webp` создан встроенным генератором image_gen. Промпт и описание визуального стиля находятся в `assets/art/README.md`.

Видео полного облёта в `assets/art/orbit/` создано из этой иллюстрации моделью Alibaba Wan 3.0 Prime через OpenRouter. Версия для игры — `assets/art/main-menu-loop.mp4`; параметры генерации и обработки сохранены в `assets/art/`. Первая генерация прежнего фона сохранена как `assets/art/main-menu-source.mp4`.
