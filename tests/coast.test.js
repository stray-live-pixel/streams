import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coastSection,
  coastalCliffs,
  cliffLandRadius,
  coastalSurfaceHeight,
} from '../src/scene/cliff-layout.ts';
import { createWorld } from '../src/domain/index.ts';
import { cliffRockGeometry } from '../src/scene/cliffs.ts';
import { beachInset, coastalElevation } from '../src/scene/coast-height.ts';
import {
  beachInfluence,
  environmentGeometry,
  environmentLayout,
  shorelineRadius,
} from '../src/scene/environment.ts';
import { terrainHeight, buildingElevation, terrainContourPoints } from '../src/scene/terrain.ts';

test('ватерлиния следует объёму глыб без чрезмерных выступов и поднутрений', () => {
  for (const seed of [0, 1, 1234, 3210380753, 4294967295]) {
    const world = createWorld(seed);
    for (let i = 0; i < 128; i++) {
      const angle = (i / 128) * Math.PI * 2;
      const land = cliffLandRadius(angle, seed);
      const waterline = shorelineRadius(angle, seed, land);
      assert(waterline > land - 0.18 && waterline < land + 1.65);
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
    const [radius] = coastSection(angle, 4, world.seed);
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
    // Low beach ground can lie below zero; use its material tag, not height.
    for (let i = 0; i < data.positions.length; i += 9) {
      const points = [0, 3, 6].map((offset) => data.positions.slice(i + offset, i + offset + 3));
      if (data.uvs[(i / 3) * 2] !== 2) break;
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
      assert(
        Math.abs(terrainHeight(x, z, seed, buildings) - buildingElevation(house, seed)) < 1e-9,
      );
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
      const coast = cliffLandRadius(angle, seed);
      const edge = shorelineRadius(angle, seed);
      const profile = [];
      for (let i = 0; i < data.positions.length; i += 3) {
        const [x, y, z] = data.positions.slice(i, i + 3);
        const radius = Math.hypot(x - 6, z - 6);
        if (
          radius >= coast - 1e-8 &&
          radius <= coastSection(angle, 4, seed)[0] + 1e-8 &&
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
        17,
        'Плотная сетка соединяет траву, сухой и мокрый песок, ватерлинию и подводный склон',
      );
      assert(rings[0][1] > -0.49 && rings[0][1] < -0.47, 'Низкий песчаный край');
      assert(rings[4][1] < -0.53 && rings[4][1] > -0.55);
      assert(rings[8][1] < -0.6 && rings[8][1] > -0.62);
      assert(edge - coast < 1.1, 'Пляж не раздувается далеко в море');
      assert(edge < world.coastRadius(angle) + 0.25, 'Середина пляжа утоплена внутрь бухты');
      assert(
        (rings[0][1] - rings[4][1]) / (rings[4][0] - rings[0][0]) < 0.2,
        'Сухой песок поднимается полого, без выпуклой насыпи',
      );
      assert.equal(rings[12][1], -0.68);
      assert.equal(rings[16][1], -1.15);
      assert(rings[16][0] - edge < 0.85, 'Подводная часть короче сухого продолжения пляжа');
      const dryHeights = [0, 0.5, 1].map((inland) =>
        terrainHeight(
          6 + Math.cos(angle) * (coast - inland),
          6 + Math.sin(angle) * (coast - inland),
          seed,
        ),
      );
      assert(Math.max(...dryHeights) - Math.min(...dryHeights) < 0.06, 'Сухая полоса почти ровная');
      assert(Math.min(...dryHeights) > -0.55, 'Сухая полоса выше воды и прибрежных волн');
      for (let i = 1; i < rings.length; i++) {
        assert(rings[i][0] > rings[i - 1][0] + 0.075, 'У пляжа нет вертикальной стенки');
        assert(rings[i][1] < rings[i - 1][1], 'Пляж спускается к морю без ступеней');
      }
    }
    assert(
      environmentLayout(world, [])
        .filter(
          (instance) =>
            instance.asset.startsWith('rock') &&
            instance.y < -0.4 &&
            !world.contains(instance.x, instance.z),
        )
        .every(
          (instance) => beachInfluence(Math.atan2(instance.z - 6, instance.x - 6), seed) < 0.28,
        ),
      'Крупные камни не перекрывают вход в песчаные бухты',
    );
  }
});

test('сухой песок продолжается в глубь бухты до перехода в траву', () => {
  for (const seed of [0, 1, 3210380753]) {
    const world = createWorld(seed);
    const data = environmentGeometry(world, []);
    let checked = 0;
    for (let vertex = 0; vertex < data.positions.length / 3; vertex++) {
      if (data.uvs[vertex * 2] !== 2) continue;
      const x = data.positions[vertex * 3],
        z = data.positions[vertex * 3 + 2];
      const angle = Math.atan2(z - 6, x - 6);
      if (beachInfluence(angle, seed) < 0.999) continue;
      const inland = world.coastRadius(angle) - beachInset(angle, seed) - Math.hypot(x - 6, z - 6);
      if (inland < 0.3 || inland > 1.25) continue;
      assert(data.uvs[vertex * 2 + 1] > 0.99, 'У воды нет преждевременной зелёной каймы');
      checked++;
    }
    assert(checked > 15, 'Проверена широкая сухая полоса в ядрах бухт');
  }
});

test('выбор участка следует песчаному склону без невидимого продолжения суши', () => {
  const seed = 1530508826;
  const x = 6.157569065649572,
    z = 11.923454049960107;
  assert(terrainHeight(x, z, seed) > 0, 'Регрессия воспроизводит прежний невидимый гребень');
  assert(coastalSurfaceHeight(x, z, seed) < -0.4);
  for (const angle of [1.1 + 0.1 * Math.sin(seed), 3.85 - 0.1 * Math.sin(seed)]) {
    for (let band = 0; band < 5; band++) {
      const [radius, height] = coastSection(angle, band, seed);
      assert(
        Math.abs(
          coastalSurfaceHeight(6 + Math.cos(angle) * radius, 6 + Math.sin(angle) * radius, seed) -
            height,
        ) < 1e-7,
      );
    }
  }
});

test('вне пляжей высокие склоны сохраняют резные срезы, точки сетки совпадают с рельефом', () => {
  for (const seed of [0, 1, 3210380753]) {
    const points = terrainContourPoints(seed);
    const world = createWorld(seed);
    const geometry = environmentGeometry(world, []);
    const terrainVertices = new Set();
    for (let i = 0; i < geometry.positions.length; i += 9) {
      const triangle = [0, 3, 6].map((offset) =>
        geometry.positions.slice(i + offset, i + offset + 3),
      );
      if (geometry.uvs[(i / 3) * 2] !== 2) break;
      for (const [x, y, z] of triangle) {
        assert(Math.abs(y - terrainHeight(x, z, seed)) < 1e-9);
        terrainVertices.add(`${x.toFixed(8)},${z.toFixed(8)}`);
      }
    }
    for (const [x, z] of points)
      if (
        world.contains(x, z, 0.2) &&
        Math.hypot(x - 6, z - 6) < cliffLandRadius(Math.atan2(z - 6, x - 6), seed) - 0.2
      )
        assert(
          terrainVertices.has(`${x.toFixed(8)},${z.toFixed(8)}`),
          'Все изломы включены в сетку',
        );
    let steepSides = 0;
    let rockySides = 0;
    for (let angle = 0; angle < 32; angle++) {
      const low = points[angle * 7 + 2];
      const high = points[angle * 7 + 4];
      const onBeach = ([x, z]) => {
        const a = Math.atan2(z - 6, x - 6);
        const inland = world.coastRadius(a) - beachInset(a, seed) - Math.hypot(x - 6, z - 6);
        return beachInfluence(a, seed) > 0.72 && inland < 1.2;
      };
      if (onBeach(low) || onBeach(high)) continue;
      rockySides++;
      // Measure the upland profile separately from the long coastal apron.
      const grade =
        (terrainHeight(...high, seed) -
          coastalElevation(...high, seed) -
          terrainHeight(...low, seed) +
          coastalElevation(...low, seed)) /
        Math.hypot(high[0] - low[0], high[1] - low[1]);
      if (grade > 2) steepSides++;
    }
    assert(
      steepSides >= rockySides * 0.68 && steepSides <= rockySides * 0.86,
      'Большая часть непесчаных склонов — крутые срезы, остальное подъём',
    );
  }
});

test('скальный бок соединяется с травой и спускается вниз, а прибой следует его граням', () => {
  for (const seed of [0, 1, 3210380753]) {
    const world = createWorld(seed);
    const cliffs = coastalCliffs(seed);
    assert(new Set(cliffs.map((rock) => rock.width.toFixed(2))).size > 10);
    for (let i = 0; i < 192; i++) {
      const angle = (i / 192) * Math.PI * 2;
      const [topRadius, topY] = coastSection(angle, 0, seed);
      const [waterRadius, waterY] = coastSection(angle, 3, seed);
      assert.equal(topRadius, cliffLandRadius(angle, seed));
      assert.equal(
        topY,
        terrainHeight(6 + Math.cos(angle) * topRadius, 6 + Math.sin(angle) * topRadius, seed),
      );
      assert.equal(waterY, -0.68);
      assert(Math.abs(shorelineRadius(angle, seed) - waterRadius) < 1e-8);
      if (beachInfluence(angle, seed) > 0.001) continue;
      for (let band = 1; band < 5; band++) {
        const [radius, height] = coastSection(angle, band, seed);
        assert(
          Math.abs(radius - topRadius) < (band === 3 ? 1.1 : 0.44),
          'Скалы не разъезжаются наружу длинными клиньями',
        );
        assert(height < topY);
      }
    }
    // Проверяем общий шов в итоговом меше: каждое граничное ребро травы
    // должно иметь ровно одну ответную грань скалы, включая последний сегмент.
    const data = environmentGeometry(world, []);
    const edges = new Map();
    for (let i = 0; i < data.positions.length; i += 9) {
      const pts = [0, 3, 6].map((offset) => data.positions.slice(i + offset, i + offset + 3));
      for (let j = 0; j < 3; j++) {
        const a = pts[j],
          b = pts[(j + 1) % 3];
        const onBoundary = (p) => {
          const angle = Math.atan2(p[2] - 6, p[0] - 6);
          const [radius, y] = coastSection(angle, 0, seed);
          return (
            Math.abs(p[1] - y) < 1e-8 && Math.abs(Math.hypot(p[0] - 6, p[2] - 6) - radius) < 1e-8
          );
        };
        if (!onBoundary(a) || !onBoundary(b)) continue;
        const key = [a.join(','), b.join(',')].sort().join('|');
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    assert(
      [...edges.values()].every((count) => count === 2),
      'Нет висящих рёбер земли',
    );
    assert(coastalCliffs(seed, [{ t: 'port', x: 11, z: 6 }]).length < cliffs.length);
  }
});

// A prismatic extrusion would also pass seam tests. Require real shoulders and
// changing slopes, while retaining a shared, watertight turf boundary.
test('берег состоит из объёмных глыб с плечами, а не вытянутой плоской стенки', () => {
  for (const seed of [0, 1, 3210380753]) {
    let shaped = 0;
    for (let i = 0; i < 192; i++) {
      const angle = (i / 192) * Math.PI * 2;
      if (beachInfluence(angle, seed) > 0.001) continue;
      const radii = [0, 1, 2, 3].map((band) => coastSection(angle, band, seed)[0]);
      if (Math.max(...radii) - Math.min(...radii) > 0.12) shaped++;
    }
    assert(shaped > 65, 'Большинство скальных участков имеют объёмный профиль');
    const layout = coastalCliffs(seed);
    const rendered = environmentGeometry(createWorld(seed), []).positions;
    const triangles = new Set();
    const signature = (points) => points.map((n) => n.toFixed(6)).join(',');
    for (let i = 0; i < rendered.length; i += 9) triangles.add(signature(rendered.slice(i, i + 9)));
    for (const rock of layout) {
      const mesh = cliffRockGeometry(rock).positions;
      for (let i = 0; i < mesh.length; i += 9)
        assert(triangles.has(signature(mesh.slice(i, i + 9))), 'В сцене есть сами объёмные глыбы');
    }
  }
});
