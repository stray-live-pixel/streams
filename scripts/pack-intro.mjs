import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

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
}
