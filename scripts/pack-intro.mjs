import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChevronLeft, ChevronRight, House, Pause, Play, RotateCcw, X } from 'lucide-react';

/** Голос и субтитры собираются вместе; готовой игре не нужны отдельные MP3 или сеть. */
export async function packIntro(root) {
  const directory = path.join(root, 'assets/audio/marta-intro');
  const manifest = JSON.parse(await readFile(path.join(directory, 'frames.json'), 'utf8'));
  if (!Array.isArray(manifest) || manifest.length === 0) throw new Error('Нет кадров вступления');
  const frames = await Promise.all(
    manifest.map(async (frame) => {
      if (
        !frame ||
        typeof frame.title !== 'string' ||
        !frame.title.trim() ||
        typeof frame.text !== 'string' ||
        !frame.text.trim() ||
        typeof frame.file !== 'string' ||
        !/^frame-\d{2}\.mp3$/.test(frame.file)
      )
        throw new Error('Некорректный кадр вступления');
      const audio = await readFile(path.join(directory, frame.file));
      return {
        title: frame.title,
        text: frame.text,
        audio: `data:audio/mpeg;base64,${audio.toString('base64')}`,
      };
    }),
  );
  await mkdir(path.join(root, '.generated'), { recursive: true });
  await writeFile(path.join(root, '.generated/intro.json'), JSON.stringify(frames));
  // React используется только при сборке: в игре остаются выбранные SVG, без React runtime.
  const components = {
    previous: ChevronLeft,
    next: ChevronRight,
    home: House,
    pause: Pause,
    play: Play,
    replay: RotateCcw,
    close: X,
  };
  const icons = Object.fromEntries(
    Object.entries(components).map(([name, component]) => [
      name,
      renderToStaticMarkup(
        createElement(component, {
          size: 20,
          strokeWidth: 1.75,
          'aria-hidden': true,
          focusable: false,
        }),
      ),
    ]),
  );
  await writeFile(path.join(root, '.generated/intro-icons.json'), JSON.stringify(icons));
}
