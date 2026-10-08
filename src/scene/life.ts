import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { GameModel } from '../domain/index.js';
import type { Passenger } from './types.js';

/** Визуальная жизнь города. Эти жители декоративные: население считает только домен.
 * Объекты создаются один раз, затем двигаются; новые меши в каждом кадре не появляются. */
export function createCityLife(scene: Scene) {
  const colors = ['#af6248', '#437e86', '#dec18b', '#677a4d'];
  function material(name: string, color: string) {
    const result = new StandardMaterial(name, scene);
    result.disableLighting = true;
    result.emissiveColor = Color3.FromHexString(color);
    return result;
  }
  const coats = colors.map((c, i) => material(`coat-${i}`, c));
  const skin = material('skin', '#eed0a0');
  const smokeMaterial = material('chimney-smoke', '#eff0dc');
  smokeMaterial.alpha = 0.22;
  function person(id: number) {
    const node = new TransformNode(`neighbor-${id}`, scene);
    const body = CreateBox(`coat-${id}`, { width: 0.065, height: 0.12, depth: 0.06 }, scene);
    body.parent = node;
    body.position.y = 0.085;
    body.material = coats[id % coats.length];
    const head = CreateSphere(`head-${id}`, { diameter: 0.07, segments: 4 }, scene);
    head.parent = node;
    head.position.y = 0.18;
    head.material = skin;
    node.setEnabled(false);
    return node;
  }
  const neighbors = Array.from({ length: 12 }, (_, i) => person(i));
  const passengers = Array.from({ length: 10 }, (_, i) => person(i + 12));
  const smoke = Array.from({ length: 12 }, (_, i) => {
    const mesh = CreateSphere(`smoke-${i}`, { diameter: 0.1, segments: 4 }, scene);
    mesh.material = smokeMaterial;
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
        node.position.set(
          tile.x + 0.5 + walk * 0.32,
          0.075,
          tile.z + (streets.length ? 0.5 : 0.94),
        );
        node.rotation.y = walk > 0 ? Math.PI / 2 : -Math.PI / 2;
      });
      passengers.forEach((node, i) => {
        const p = arrivals[i];
        node.setEnabled(!!p);
        if (p) node.position.set(p.x, 0.085, p.z);
      });
      smoke.forEach((mesh, i) => {
        const home = homes[Math.floor(i / 3)];
        mesh.setEnabled(!!home && !reducedMotion && !!model?.pop);
        if (!home) return;
        const phase = (seconds * 0.25 + i / 3) % 1;
        const tall = (home.x * 3 + home.z) % 2 === 1;
        mesh.position.set(
          home.x + 0.67 + phase * 0.18,
          (tall ? 1.45 : 1.18) + phase * 0.7,
          home.z + 0.32,
        );
        mesh.scaling.setAll(0.5 + phase * 1.8);
        mesh.visibility = 1 - phase;
      });
    },
  };
}
