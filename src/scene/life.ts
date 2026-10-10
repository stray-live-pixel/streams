import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { buildingObjectId, type GameModel } from '../domain/index.js';
import { objectSettings } from '../objects/index.js';
import type { Passenger } from './types.js';
import { sceneCoordinate } from './space.js';
import { buildingElevation, terrainHeight } from './terrain.js';

export const lifeColors = {
  coats: ['#af6248', '#437e86', '#dec18b', '#677a4d'],
  skin: '#eed0a0',
  smoke: '#eff0dc',
};

/** Визуальная жизнь города. Эти жители декоративные: население считает только домен.
 * Объекты создаются один раз, затем двигаются; новые меши в каждом кадре не появляются. */
export function createCityLife(scene: Scene) {
  function material(name: string, color: string) {
    const result = new StandardMaterial(name, scene);
    result.diffuseColor = Color3.FromHexString(color);
    result.specularColor = Color3.Black();
    return result;
  }
  const coats = lifeColors.coats.map((c, i) => material(`coat-${i}`, c));
  const skin = material('skin', lifeColors.skin);
  const smokeMaterial = material('chimney-smoke', lifeColors.smoke);
  smokeMaterial.alpha = 0.22;
  const neighbors = Array.from({ length: 12 }, (_, i) =>
    createPerson(scene, i, coats[i % coats.length], skin),
  );
  const passengers = Array.from({ length: 10 }, (_, i) =>
    createPerson(scene, i + 12, coats[(i + 12) % coats.length], skin),
  );
  const smoke = Array.from({ length: 12 }, (_, i) => {
    const mesh = createSmoke(scene, smokeMaterial, i);
    mesh.setEnabled(false);
    return mesh;
  });
  let model: GameModel | null = null;
  return {
    setModel(next: GameModel) {
      model = next;
    },
    update(seconds: number, arrivals: Passenger[], reducedMotion: boolean) {
      const homes = model?.buildings.filter((b) => b.t === 'house') ?? [];
      const streets = model?.buildings.filter((b) => b.t === 'road') ?? [];
      neighbors.forEach((node, i) => {
        const active = !!model && i < Math.min(12, Math.floor(model.pop / 3)) && homes.length > 0;
        node.setEnabled(active);
        if (!active) return;
        // На дороге гуляем в границах одного участка; без дорог — у фасада дома.
        const tile = streets.length ? streets[i % streets.length] : homes[i % homes.length];
        const walk = reducedMotion ? 0 : Math.sin(seconds * 0.7 + i * 2);
        const x = tile.x + 0.5 + walk * 0.32,
          z = tile.z + (streets.length ? 0.5 : 0.94);
        node.position.set(
          sceneCoordinate(x),
          0.075 + terrainHeight(x, z, model!.islandSeed, model!.buildings),
          sceneCoordinate(z),
        );
        node.rotation.y = walk > 0 ? Math.PI / 2 : -Math.PI / 2;
      });
      passengers.forEach((node, i) => {
        const p = arrivals[i];
        node.setEnabled(!!p);
        if (p)
          node.position.set(
            sceneCoordinate(p.x),
            0.085 + terrainHeight(p.x, p.z, model?.islandSeed ?? 0, model?.buildings ?? []),
            sceneCoordinate(p.z),
          );
      });
      smoke.forEach((mesh, i) => {
        const home = homes[Math.floor(i / 3)];
        mesh.setEnabled(!!home && !reducedMotion && !!model?.pop);
        if (!home) return;
        const phase = (seconds * 0.25 + i / 3) % 1;
        const tall = (home.x * 3 + home.z) % 2 === 1;
        const scale = objectSettings(buildingObjectId(home)).scale;
        mesh.position.set(
          sceneCoordinate(home.x + 0.5) + (0.17 + phase * 0.18) * scale,
          buildingElevation(home, model!.islandSeed) + ((tall ? 1.45 : 1.18) + phase * 0.7) * scale,
          sceneCoordinate(home.z + 0.5) - 0.18 * scale,
        );
        mesh.scaling.setAll(0.5 + phase * 1.8);
        mesh.visibility = 1 - phase;
      });
    },
  };
}

/** Общая фигура для города и изолированного просмотра. */
export function createPerson(
  scene: Scene,
  id: number,
  coat: StandardMaterial,
  skin: StandardMaterial,
) {
  const node = new TransformNode(`neighbor-${id}`, scene);
  const body = CreateBox(`coat-${id}`, { width: 0.065, height: 0.12, depth: 0.06 }, scene);
  body.parent = node;
  body.position.y = 0.085;
  body.material = coat;
  const head = CreateSphere(`head-${id}`, { diameter: 0.07, segments: 4 }, scene);
  head.parent = node;
  head.position.y = 0.18;
  head.material = skin;
  node.setEnabled(false);
  return node;
}

export function createSmoke(scene: Scene, material: StandardMaterial, id = 0) {
  const mesh = CreateSphere(`smoke-${id}`, { diameter: 0.1, segments: 4 }, scene);
  mesh.material = material;
  return mesh;
}
