import test from 'node:test';
import assert from 'node:assert/strict';
import { coastalCliffs, cliffLandRadius } from '../src/scene/cliff-layout.ts';
import { cliffRockGeometry } from '../src/scene/cliffs.ts';
import { createWorld } from '../src/domain/index.ts';
import {
  beachInfluence,
  environmentGeometry,
  environmentLayout,
  shorelineRadius,
} from '../src/scene/environment.ts';
import { terrainHeight, buildingElevation, terrainContourPoints } from '../src/scene/terrain.ts';

test('береговой скат остаётся снаружи строительной поверхности для разных островов', () => {
  for (const seed of [0, 1, 1234, 3210380753, 4294967295]) {
    const world = createWorld(seed);
    for (let i = 0; i < 128; i++) {
      const angle = (i / 128) * Math.PI * 2;
      const land = world.coastRadius(angle);
      const waterline = shorelineRadius(angle, seed, land);
      assert(waterline >= land - 1e-6 && waterline < land + 1.65);
      assert.equal(waterline, shorelineRadius(angle, seed));
    }
  }
});

test('подложка острова замкнута ниже воды, геометрия конечна и воспроизводима', () => {
  const world = createWorld(3210380753);
  const data = environmentGeometry(world, []);
  const edge = new Set();
  for (let i = 0; i < data.positions.length; i += 3) {
    const [x, y, z] = data.positions.slice(i, i + 3);
    assert(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
    if (y !== -1.15) continue;
    const angle = Math.atan2(z - 6, x - 6);
    const sand = beachInfluence(angle, world.seed);
    const radius = cliffLandRadius(angle, world.seed) + sand * 1.4 * 1.29;
    if (Math.abs(Math.hypot(x - 6, z - 6) - radius) < 1e-6)
      edge.add(`${x.toFixed(8)},${z.toFixed(8)}`);
  }
  assert.equal(edge.size, 192, 'Нижняя кромка включает все сегменты и замыкающий шов');
  assert.deepEqual(data.positions, environmentGeometry(world, []).positions);
});

test('земля имеет нерегулярные грани, а её замкнутая граница совпадает со скальным верхом', () => {
  for (const seed of [0, 1, 3210380753]) {
    const data = environmentGeometry(createWorld(seed), []);
    const edges = new Map();
    const vertices = new Set();
    // Земля записана первой; первое отрицательное Y начинает скальный берег.
    for (let i = 0; i < data.positions.length; i += 9) {
      const points = [0, 3, 6].map((offset) => data.positions.slice(i + offset, i + offset + 3));
      if (points.some((point) => point[1] < 0)) break;
      for (let j = 0; j < 3; j++) {
        const a = points[j].map((v) => v.toFixed(6)).join(',');
        const b = points[(j + 1) % 3].map((v) => v.toFixed(6)).join(',');
        vertices.add(a);
        const key = a < b ? `${a} ${b}` : `${b} ${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
      assert(data.normals[i + 1] > 0, 'Земля смотрит вверх');
    }
    assert.equal([...edges.values()].filter((count) => count === 1).length, 192);
    assert([...edges.values()].every((count) => count === 1 || count === 2));
    assert(vertices.size > 500, 'Сетка заполняет всю площадь независимыми точками');
    assert(
      ![...vertices].some((point) => point.startsWith('6.000000,') && point.endsWith(',6.000000')),
    );
  }
});

test('рельеф воспроизводим, имеет перепад высот и ровные площадки под зданиями и портом', () => {
  const seed = 3210380753;
  const samples = [];
  for (let x = 1; x < 11; x += 0.5)
    for (let z = 1; z < 11; z += 0.5) {
      const height = terrainHeight(x, z, seed);
      assert.equal(height, terrainHeight(x, z, seed));
      samples.push(height);
    }
  assert(Math.max(...samples) - Math.min(...samples) > 1);
  const house = {
    t: 'house',
    x: 3,
    z: 4,
    footprint: [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ],
  };
  const port = { t: 'port', x: 6, z: 11 };
  const buildings = [house, port];
  for (const x of [3, 3.5, 4.5, 5])
    for (const z of [4, 4.5, 5])
      assert.equal(terrainHeight(x, z, seed, buildings), buildingElevation(house, seed));
  assert.equal(buildingElevation(port, seed), 0);
  assert.equal(terrainHeight(6.5, 11.5, seed, buildings), 0);
  assert.equal(
    terrainHeight(9, 2, seed, buildings),
    terrainHeight(9, 2, seed),
    'Строительство не меняет дальнюю сторону острова',
  );
});

test('два песчаных берега полого продолжаются ниже воды и свободны от береговых скал', () => {
  for (const seed of [0, 1, 3210380753]) {
    const world = createWorld(seed);
    const data = environmentGeometry(world, []);
    const centers = [1.1 + 0.1 * Math.sin(seed), 3.85 - 0.1 * Math.sin(seed)];
    for (const center of centers) {
      const index = Math.round((center / (Math.PI * 2)) * 192);
      const angle = (index / 192) * Math.PI * 2;
      const sand = beachInfluence(angle, seed);
      assert(sand > 0.99, 'Обе бухты имеют широкое песчаное ядро');
      const coast = world.coastRadius(angle);
      const edge = shorelineRadius(angle, seed);
      const profile = [];
      for (let i = 0; i < data.positions.length; i += 3) {
        const [x, y, z] = data.positions.slice(i, i + 3);
        const radius = Math.hypot(x - 6, z - 6);
        if (
          radius >= coast - 1e-8 &&
          radius <= edge + 0.53 &&
          Math.abs(Math.atan2(z - 6, x - 6) - (angle > Math.PI ? angle - Math.PI * 2 : angle)) <
            1e-8
        )
          profile.push([radius, y]);
      }
      const rings = [...new Map(profile.map((p) => [p[0].toFixed(8), p])).values()].sort(
        (a, b) => a[0] - b[0],
      );
      assert.equal(
        rings.length,
        5,
        'Трава, сухой и мокрый песок, ватерлиния и подводный склон связаны',
      );
      assert(rings[0][1] >= 0);
      assert(rings[1][1] < -0.21 && rings[1][1] > -0.23);
      assert(rings[2][1] < -0.46 && rings[2][1] > -0.48);
      assert.equal(rings[3][1], -0.68);
      assert.equal(rings[4][1], -1.15);
      for (let i = 1; i < rings.length; i++) {
        assert(rings[i][0] > rings[i - 1][0] + 0.3, 'У пляжа нет вертикальной стенки');
        assert(rings[i][1] < rings[i - 1][1], 'Пляж спускается к морю без ступеней');
      }
    }
    assert(
      environmentLayout(world, [])
        .filter((instance) => instance.y < -0.2)
        .every(
          (instance) => beachInfluence(Math.atan2(instance.z - 6, instance.x - 6), seed) < 0.28,
        ),
      'Крупные камни не перекрывают вход в песчаные бухты',
    );
  }
});

test('примерно три четверти высоких склонов имеют резные срезы, точки сетки совпадают с рельефом', () => {
  for (const seed of [0, 1, 3210380753]) {
    const points = terrainContourPoints(seed);
    const world = createWorld(seed);
    const geometry = environmentGeometry(world, []);
    const terrainVertices = new Set();
    for (let i = 0; i < geometry.positions.length; i += 9) {
      const triangle = [0, 3, 6].map((offset) =>
        geometry.positions.slice(i + offset, i + offset + 3),
      );
      if (triangle.some((point) => point[1] < 0)) break;
      for (const [x, y, z] of triangle) {
        assert(y === 0 || Math.abs(y - terrainHeight(x, z, seed)) < 1e-9);
        terrainVertices.add(`${x.toFixed(8)},${z.toFixed(8)}`);
      }
    }
    for (const [x, z] of points)
      if (world.contains(x, z, 0.2))
        assert(
          terrainVertices.has(`${x.toFixed(8)},${z.toFixed(8)}`),
          'Все изломы включены в сетку',
        );
    let steepSides = 0;
    for (let angle = 0; angle < 32; angle++) {
      const low = points[angle * 7 + 2];
      const high = points[angle * 7 + 4];
      const grade =
        (terrainHeight(...high, seed) - terrainHeight(...low, seed)) /
        Math.hypot(high[0] - low[0], high[1] - low[1]);
      if (grade > 2) steepSides++;
    }
    assert(
      steepSides >= 22 && steepSides <= 25,
      'Около 75% периметра — крутые срезы, остальное подъём',
    );
  }
});

test('прибой следует реальному сечению объёмных скал, а пляжи остаются открыты', () => {
  for (const seed of [0, 1, 3210380753]) {
    const cliffs = coastalCliffs(seed);
    assert(cliffs.length > 15);
    assert(new Set(cliffs.map((rock) => rock.width.toFixed(2))).size > 10);
    for (const spec of cliffs) {
      assert(beachInfluence(Math.atan2(spec.z - 6, spec.x - 6), seed) <= 0.18);
      const mesh = cliffRockGeometry(spec);
      let cuts = 0;
      for (let i = 0; i < mesh.positions.length; i += 9) {
        const points = [0, 3, 6].map((offset) => mesh.positions.slice(i + offset, i + offset + 3));
        for (let edge = 0; edge < 3; edge++) {
          const a = points[edge],
            b = points[(edge + 1) % 3];
          if (a[1] < -0.68 === b[1] < -0.68) continue;
          const t = (-0.68 - a[1]) / (b[1] - a[1]);
          const x = a[0] + (b[0] - a[0]) * t - 6;
          const z = a[2] + (b[2] - a[2]) * t - 6;
          const angle = Math.atan2(z, x);
          if (beachInfluence(angle, seed) > 0.001) continue;
          assert(
            shorelineRadius(angle, seed) >= Math.hypot(x, z) - 0.055,
            'Ватерлиния не проходит внутри скального выступа',
          );
          cuts++;
        }
      }
      if (beachInfluence(Math.atan2(spec.z - 6, spec.x - 6), seed) < 0.001) assert(cuts > 0);
    }
    assert(coastalCliffs(seed, [{ t: 'port', x: 11, z: 6 }]).length < cliffs.length);
  }
});
