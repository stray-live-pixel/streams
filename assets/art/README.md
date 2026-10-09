# Иллюстрация главного меню

`main-menu.webp` — сгенерированный фон 1536 × 1024. Создан встроенным image_gen 9 октября 2026; исходный PNG сохранён инструментом, для игры подготовлен WebP (качество 88). Сборка встраивает картинку в HTML, внешние запросы не нужны.

## Визуальный ориентир

- Low-poly формы, читаемые силуэты и правдоподобное объёмное освещение.
- Приглушённая бирюзовая вода, шалфейная зелень, кремовая штукатурка, терракотовые и бирюзовые крыши.
- Небольшие деревянные и фахверковые дома, рабочий причал, маяк, парусники, хвойные деревья.
- Иллюстрация дополняет текущую графику игры и задаёт направление развития; игровая сцена не заменяется.
- Заголовок и кнопки остаются HTML. Картинка не содержит надписей.

## Промпт генерации

Use case: stylized-concept.
Asset type: full-bleed landscape main-menu background and visual style reference for the cozy town-building game "Quiet Harbor". Generate one polished, high-resolution, landscape 3D low-poly environment illustration, aspect ratio approximately 3:2.
Primary request: a believable miniature island harbor with physically coherent depth, sunlight, soft ambient occlusion and sculpted low-poly forms. This should feel like a beautifully art-directed in-engine render, NOT flat vector artwork and NOT photorealism. It must complement an existing simple low-poly isometric town game, using the same modest architecture and warm restrained palette.
Scene: a small inhabited grassy island in a calm muted turquoise sea, seen from an elevated three-quarter isometric camera. Low stepped sandy rock shoreline, simple faceted grass terrain, a handful of tall narrow half-timbered cottages with warm wooden framing, cream plaster, terracotta red gabled roofs and occasional muted teal roofs; a small windmill; spaced conical evergreen trees. A broad wooden working harbor with plank piers, mooring posts, a few wooden crates and barrels reaches into the water. A small wooden sailing boat with cream cloth sails is approaching. A modest cream lighthouse with faded terracotta-red bands stands beside the harbor. All buildings and paths have coherent proportions and navigation; cozy, handmade, peaceful, open, inviting.
Composition: the distinctive island, harbor and lighthouse occupy the LOWER LEFT and CENTER LEFT two thirds of the image. Island and major buildings must be entirely readable, not extreme close-up; the lower left quarter contains water and a pier leading the eye inland. The upper left third is mostly quiet warm pale sky / sea haze with very little detail, so the game title can be overlaid there. The RIGHT third should be quiet softly lit water and misted distant coast, because a parchment menu card will cover it. Landscape can extend behind that card. Horizon in upper third, delicate distant land silhouettes, no dramatic mountains. No text, no lettering, no logos, no UI, no borders.
Lighting: warm late-afternoon sun from upper left, soft long shadows, subtle atmospheric depth, water has broad calm facets and restrained reflections, realistic sense of materials and volume while every silhouette stays low-poly.
Palette to harmonize with current game: desaturated sea #8eb8b7, sage grass #a8b78d, pine green #496951, cream #f7efd9, terracotta #aa503c, warm timber brown and soft honey highlights. Avoid saturated blue, neon green, stark white, and heavy orange cinematic grading.
Materials: matte faceted surfaces, simplified timber and stucco, enough believable detail to guide future game art, no gritty photographic texture, no miniature tilt-shift blur, no outlines, no flat infographic shapes. Keep the whole main island in focus. Cheerful but quiet and unhurried.

## Живой фон меню

- `orbit/segment-01-source.mp4`, `segment-02-source.mp4`, `segment-03-source.mp4` — три сохранённых 15-секундных ролика, сгенерированных Alibaba Wan 3.0 Prime через OpenRouter. Каждый следующий запрашивался из последнего кадра предыдущего, но траектории получились несогласованными. Для игры выбран только третий исходник с самостоятельным круговым облётом.
- `orbit/segment-0N.json` — промпт, параметры, идентификатор задания, стоимость и контрольная сумма каждого оригинала. `segment-02-first.png` и `segment-03-first.png` — входные кадры продолжений.
- `main-menu-loop.mp4` — единая версия для игры: 1080 × 720, H.264, 15 секунд, 48 кадров/с (720 кадров), без аудиодорожки, с расположением MP4-заголовка в начале файла (`faststart`).
- `main-menu-video.json` — список исходников и проверенные параметры готового файла.
- `main-menu-source.mp4` и `main-menu-original.json` — сохранённая первая генерация прежнего фона; новый облёт их не изменяет.

Третий исходник проигрывается без предыдущих двух и без обратного хода. Последние 0,4 секунды переходят в его собственный первый кадр для зацикливания. Это генеративное видео, поэтому замыкание сглаживает небольшое изменение деталей пейзажа, а не восстанавливает точную 3D-геометрию. Файл не растягивается: скорость `0.5` задаёт проигрыватель в `ui/menu-background.ts`, поэтому один круг занимает 30 секунд. Промежуточные кадры рассчитываются при экспорте до 48 кадров/с; при замедленном показе остаётся 24 кадра/с.

Перетаскивание фона перематывает таймлайн в обе стороны с переходом через границу круга. Через 5 секунд после отпускания мыши воспроизведение продолжается с выбранного места. Карточка меню не перехватывается этим жестом. Ключевые кадры через каждые 0,5 секунды файла помогают быстро искать нужный ракурс.

Объём уменьшен за счёт экспорта H.264 CRF 25 при высоте 720 px, удаления звука и лишних метаданных. Едва заметное размытие 0,6 px задаётся отдельно через `--menu-art-blur`: оно не изменяет исходные файлы и не затрагивает меню. Небольшое увеличение изображения скрывает край размытия.

Провайдер фактически вернул пропорции входного изображения, а также аудиодорожку, хотя запрос отключал звук. Все исходники сохранены побайтово; игровой файл полностью удаляет аудио.

Видео воспроизводится только в видимом главном меню, учитывает переключатель анимации и системное уменьшение движения. При недоступном воспроизведении остаётся исходная иллюстрация.

Повторная подготовка ассета (FFmpeg и ffprobe нужны только для этого шага, не для обычной сборки):

```sh
node scripts/pack-menu-video.mjs
```

[Модель](https://openrouter.ai/alibaba/wan-3.0-prime) · [API генерации видео](https://openrouter.ai/docs/guides/overview/multimodal/video-generation).
