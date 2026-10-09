import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Подготовка ассета вручную; обычная сборка игры не требует FFmpeg.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = [1, 2, 3].map((number) =>
  path.join(root, `assets/art/orbit/segment-0${number}-source.mp4`),
);
for (const source of sources) await access(source);
const temporary = await mkdtemp(path.join(tmpdir(), 'quiet-harbor-pack-'));
const firstFrame = path.join(temporary, 'first.png');
const interpolated = path.join(temporary, 'interpolated.mp4');
const output = path.join(temporary, 'loop.mp4');
// Провайдер слегка меняет пропорции между роликами: обрезаем пару краевых пикселей, не растягиваем.
const frameSize =
  'scale=1080:720:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:720,setsar=1';
let complete = false;
function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', ...args], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`FFmpeg завершился с кодом ${result.status}`);
}
try {
  ffmpeg(['-i', sources[0], '-vf', frameSize, '-frames:v', '1', '-update', '1', firstFrame]);
  const segments = sources.map(
    (_, index) => `[${index}:v]${frameSize},fps=30,trim=end_frame=450,setpts=N/(30*TB)[v${index}]`,
  );
  ffmpeg([
    ...sources.flatMap((source) => ['-i', source]),
    '-loop',
    '1',
    '-framerate',
    '30',
    '-i',
    firstFrame,
    '-filter_complex_threads',
    '1',
    '-filter_complex',
    [
      ...segments,
      '[v0][v1][v2]concat=n=3:v=1:a=0,fps=30,settb=AVTB[tour]',
      '[3:v]setsar=1,trim=duration=0.5,settb=AVTB,setpts=PTS-STARTPTS[start]',
      // Последние полсекунды возвращают первый кадр, не растягивая 45-секундный файл.
      '[tour][start]xfade=transition=fade:duration=0.5:offset=44.5,' +
        'minterpolate=fps=48:mi_mode=mci:mc_mode=obmc:me_mode=bidir,' +
        'setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop=48,trim=end_frame=2160,format=yuv420p[out]',
    ].join(';'),
    '-map',
    '[out]',
    '-an',
    '-r',
    '48',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '26',
    '-frames:v',
    '2160',
    '-movflags',
    '+faststart',
    interpolated,
  ]);
  // Замыкаем после интерполяции, чтобы её крайние кадры не оставили скачок на повторе.
  ffmpeg(['-i', interpolated, '-frames:v', '1', '-update', '1', firstFrame]);
  ffmpeg([
    '-i',
    interpolated,
    '-loop',
    '1',
    '-framerate',
    '48',
    '-i',
    firstFrame,
    '-filter_complex_threads',
    '1',
    '-filter_complex',
    '[0:v]settb=AVTB,setpts=PTS-STARTPTS[tour];' +
      '[1:v]setsar=1,trim=duration=1,settb=AVTB,setpts=PTS-STARTPTS[start];' +
      '[tour][start]xfade=transition=fade:duration=0.4:offset=44.5,' +
      'fps=48,trim=end_frame=2160,format=yuv420p[out]',
    '-map',
    '[out]',
    '-an',
    '-r',
    '48',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '25',
    '-frames:v',
    '2160',
    '-movflags',
    '+faststart',
    output,
  ]);
  const probe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_name,codec_type,width,height,r_frame_rate,nb_frames:format=duration,size',
      '-of',
      'json',
      output,
    ],
    { encoding: 'utf8' },
  );
  if (probe.error) throw probe.error;
  if (probe.status !== 0) throw new Error(probe.stderr);
  const media = JSON.parse(probe.stdout);
  if (
    media.streams.length !== 1 ||
    media.streams[0].codec_type !== 'video' ||
    media.streams[0].r_frame_rate !== '48/1' ||
    media.streams[0].nb_frames !== '2160' ||
    Math.abs(Number(media.format.duration) - 45) > 0.001
  )
    throw new Error(`Неверные параметры готового видео: ${probe.stdout}`);
  const manifest = {
    model: 'alibaba/wan-3.0-prime',
    segments: [1, 2, 3].map((number) => ({
      source: `orbit/segment-0${number}-source.mp4`,
      metadata: `orbit/segment-0${number}.json`,
    })),
    original_generation: 'main-menu-original.json',
    playback: {
      file: 'main-menu-loop.mp4',
      sha256: createHash('sha256')
        .update(await readFile(output))
        .digest('hex'),
      ...media,
      playback_rate: 0.5,
      presentation_duration: 90,
      loop_processing:
        'Three 15-second clips in sequence; final half-second dissolves to the first frame. ' +
        'Motion interpolation to 48 fps, no time stretching. Browser playback at 0.5 gives 24 presented fps.',
    },
  };
  await rename(output, path.join(root, 'assets/art/main-menu-loop.mp4'));
  await writeFile(
    path.join(root, 'assets/art/main-menu-video.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  console.log(
    `Готово: 45 с, 48 кадров/с, ${(Number(media.format.size) / 1024 / 1024).toFixed(2)} МиБ.`,
  );
  complete = true;
} finally {
  if (complete) await rm(temporary, { recursive: true, force: true });
  else console.error(`Прежний фон сохранён. Промежуточный результат: ${temporary}`);
}
