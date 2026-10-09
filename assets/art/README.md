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

- `main-menu-source.mp4` — исходный ответ Alibaba Wan 3.0 Prime через OpenRouter; хранится без перекодирования.
- `main-menu-video.json` — точная модель, промпт, входной кадр, параметры и идентификатор генерации, без токенов доступа.
- `main-menu-loop.mp4` — версия для игры: 1080 × 720, H.264, 15 секунд, 12 кадров/с (180 кадров), без аудиодорожки.

Для бесшовного повтора последняя секунда исходника плавно смешивается с первой. Цикл начинается на отметке 1 секунды исходника; полученные 14 секунд немного замедляются до 15. Поэтому последний кадр совпадает по фазе с началом, без обратного воспроизведения воды и лодок.

Провайдер фактически вернул 1762 × 1174, 30 кадров/с и аудиодорожку, хотя запрос отключал звук. Исходник сохранён побайтово; игровая версия сохраняет пропорции изображения и полностью удаляет аудио.

Камера плавно обозревает гавань; промпт просит движение вправо и мягкий возврат к исходному ракурсу. Исходная картинка остаётся постером и резервным фоном. Видео воспроизводится только в видимом главном меню и учитывает переключатель анимации и системное уменьшение движения.

Обработка (FFmpeg нужен только для подготовки ассета, не для обычной сборки):

```sh
ffmpeg -i assets/art/main-menu-source.mp4 -filter_complex_threads 1 \
  -filter_complex '[0:v]fps=24,scale=-2:720:flags=lanczos,setsar=1,split=2[body][head];[body]trim=start=1:end=15,setpts=PTS-STARTPTS[b];[head]trim=start=0:end=1,setpts=PTS-STARTPTS[h];[b][h]xfade=transition=fade:duration=1:offset=13,setpts=PTS*15/14,fps=12,tpad=stop_mode=clone:stop_duration=1,trim=duration=15,format=yuv420p[out]' \
  -map '[out]' -an -c:v libx264 -preset slow -crf 21 -frames:v 180 \
  -movflags +faststart assets/art/main-menu-loop.mp4
```

[Модель](https://openrouter.ai/alibaba/wan-3.0-prime) · [API генерации видео](https://openrouter.ai/docs/guides/overview/multimodal/video-generation).
