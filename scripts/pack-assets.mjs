import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

/**
 * На этапе сборки переводим OBJ + палитру в простые массивы.
 * В браузере не понадобится fetch(), поэтому HTML открывается через file://.
 * Оригинальные наборы не изменяем. Игра получает manifest, просмотрщик — весь каталог OBJ.
 */
export async function packAssets(root) {
  const manifest = JSON.parse(await readFile(path.join(root, 'assets/manifest.json'), 'utf8'));
  const sources = [
    { directory: 'kenney-fantasy-town', models: manifest.models },
    ...manifest.additionalPacks.map((pack) => ({
      directory: 'kenney-pirate',
      models: pack.models,
    })),
  ];
  const models = {};
  const library = {};
  for (const source of sources) {
    const directory = path.join(root, 'assets', source.directory, 'Models/OBJ format');
    const image = PNG.sync.read(await readFile(path.join(directory, 'Textures/colormap.png')));
    const names = (await readdir(directory))
      .filter((name) => name.endsWith('.obj'))
      .map((name) => name.slice(0, -4))
      .sort();
    for (const name of names) {
      const positions = [],
        uvs = [],
        faces = [],
        colors = [];
      const colorIds = new Map();
      const text = await readFile(path.join(directory, name + '.obj'), 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] === 'v')
          positions.push(parts.slice(1, 4).map((v) => Number(Number(v).toFixed(6))));
        if (parts[0] === 'vt') uvs.push(parts.slice(1, 3).map(Number));
        if (parts[0] !== 'f') continue;
        const refs = parts.slice(1).map((ref) => ref.split('/').slice(0, 2).map(Number));
        // OBJ допускает многоугольники; видеокарта получает только треугольники.
        for (let i = 1; i < refs.length - 1; i++) {
          const triangle = [refs[0], refs[i], refs[i + 1]];
          const u = triangle.reduce((sum, r) => sum + uvs[r[1] - 1][0], 0) / 3;
          const v = triangle.reduce((sum, r) => sum + uvs[r[1] - 1][1], 0) / 3;
          const x = Math.min(image.width - 1, Math.max(0, Math.floor(u * image.width)));
          const y = Math.min(image.height - 1, Math.max(0, Math.floor((1 - v) * image.height)));
          const offset = (y * image.width + x) * 4;
          const color = [...image.data.subarray(offset, offset + 3)];
          const key = color.join(',');
          if (!colorIds.has(key)) {
            colorIds.set(key, colors.length);
            colors.push(color);
          }
          faces.push([...triangle.map((r) => r[0] - 1), colorIds.get(key)]);
        }
      }
      const data = { p: positions, f: faces, c: colors };
      library[`${source.directory}/${name}`] = data;
      if (source.models.includes(name)) models[name] = data;
    }
  }
  const imageTag = async (directory, name) => {
    const buffer = await readFile(path.join(root, 'assets', directory, 'Previews', name + '.png'));
    return `<img alt="" src="data:image/png;base64,${buffer.toString('base64')}">`;
  };
  const town = (name) => imageTag('kenney-fantasy-town', name);
  const art = {
    house: (await town('wall-block')) + (await town('roof-gable')),
    farm: await town('windmill'),
    shop: await town('stall-red'),
    road: await town('planks'),
    port: await imageTag('kenney-pirate', 'ship-small'),
  };
  await mkdir(path.join(root, '.generated'), { recursive: true });
  await writeFile(path.join(root, '.generated/models.json'), JSON.stringify(models));
  await writeFile(path.join(root, '.generated/library-models.json'), JSON.stringify(library));
  await writeFile(path.join(root, '.generated/card-art.json'), JSON.stringify(art));
  return Object.keys(models).length;
}
