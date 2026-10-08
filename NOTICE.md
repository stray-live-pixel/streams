# Сторонние компоненты

Игра использует Babylon.js под лицензией Apache-2.0. Полный текст берётся из `node_modules/@babylonjs/core/license.md` вместе с NOTICE.md пакета и включается сборщиком в готовый HTML. Зависимости сборки не нужны игроку.

Исходные модели и иллюстрации:

- Kenney Fantasy Town Kit: https://kenney.nl/assets/fantasy-town-kit — CC0, `assets/kenney-fantasy-town/License.txt`.
- Kenney Pirate Kit: https://kenney.nl/assets/pirate-kit — CC0, `assets/kenney-pirate/License.txt`.

Полные скачанные наборы сохраняются в репозитории. Геометрия выбранных моделей преобразуется, масштабируется и соединяется в постройки; палитра читается из исходных текстур. Структура используемых наборов указана в `assets/manifest.json`.
