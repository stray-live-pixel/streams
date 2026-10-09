import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Подготовка ассета вручную; обычная сборка игры не требует FFmpeg.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// В этом участке первого ролика причал и постройки сохраняются. Полный круг менял геометрию.
const source = path.join(root, 'assets/art/orbit/segment-01-source.mp4');
await access(source);
const temporary = await mkdtemp(path.join(tmpdir(), 'quiet-harbor-pack-'));
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
  ffmpeg([
    '-ss',
    '1',
    '-i',
    source,
    '-vf',
    frameSize +
      // Растягиваем пять секунд исходника на 7,5 с с замедлением у обоих концов.
      ',fps=30,trim=end_frame=150,setpts=acos(1-2*N/149)*7.5/(PI*TB),' +
      'minterpolate=fps=48:mi_mode=mci:mc_mode=obmc:me_mode=bidir,' +
      'tpad=stop_mode=clone:stop=48,trim=end_frame=360,setpts=N/(48*TB),format=yuv420p',
    '-an',
    '-r',
    '48',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '23',
    '-frames:v',
    '360',
    '-movflags',
    '+faststart',
    interpolated,
  ]);
  // Обратная половина использует те же кадры. На стыках объекты не растворяются.
  ffmpeg([
    '-i',
    interpolated,
    '-filter_complex',
    '[0:v]split[forward][back];' +
      '[forward]setpts=PTS-STARTPTS[f];[back]reverse,setpts=PTS-STARTPTS[b];' +
      '[f][b]concat=n=2:v=1:a=0,format=yuv420p[out]',
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
    // Ключевой кадр раз в полсекунды облегчает перемотку в обе стороны.
    '-g',
    '24',
    '-keyint_min',
    '24',
    '-sc_threshold',
    '0',
    '-frames:v',
    '720',
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
    media.streams[0].nb_frames !== '720' ||
    Math.abs(Number(media.format.duration) - 15) > 0.001
  )
    throw new Error(`Неверные параметры готового видео: ${probe.stdout}`);
  const manifest = {
    model: 'alibaba/wan-3.0-prime',
    segments: [1, 2, 3].map((number) => ({
      source: `orbit/segment-0${number}-source.mp4`,
      metadata: `orbit/segment-0${number}.json`,
    })),
    active_source: 'orbit/segment-01-source.mp4',
    source_range_seconds: [1, 6],
    original_generation: 'main-menu-original.json',
    playback: {
      file: 'main-menu-loop.mp4',
      sha256: createHash('sha256')
        .update(await readFile(output))
        .digest('hex'),
      ...media,
      playback_rate: 0.5,
      presentation_duration: 30,
      motion: 'ping-pong',
      loop_processing:
        'Stable seconds 1–6 of segment 01, eased to 7.5 seconds and mirrored in reverse. ' +
        'No crossfade, no mixing of different island geometry. Keyframes every 0.5 seconds for scrubbing. ' +
        '48 fps with browser playback at 0.5 gives 24 presented fps and a 30-second round trip.',
    },
  };
  await rename(output, path.join(root, 'assets/art/main-menu-loop.mp4'));
  await writeFile(
    path.join(root, 'assets/art/main-menu-video.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  console.log(
    `Готово: 15 с, 48 кадров/с, ${(Number(media.format.size) / 1024 / 1024).toFixed(2)} МиБ.`,
  );
  complete = true;
} finally {
  if (complete) await rm(temporary, { recursive: true, force: true });
  else console.error(`Прежний фон сохранён. Промежуточный результат: ${temporary}`);
}
