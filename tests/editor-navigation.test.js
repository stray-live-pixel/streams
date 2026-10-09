import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { moveEditorCamera, lookEditorCamera } from '../src/editor/navigation.ts';

function fixture(t, alpha = Math.PI / 3, beta = Math.PI / 3) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new ArcRotateCamera('camera', alpha, beta, 4, Vector3.Zero(), scene);
  camera.getViewMatrix(true);
  t.after(() => engine.dispose());
  return camera;
}
const near = (actual, expected) =>
  assert(Vector3.Distance(actual, expected) < 0.00001, `${actual} != ${expected}`);

test('W/S летят вдоль наклонённого взгляда, сохраняя дистанцию и ориентацию камеры', (t) => {
  const camera = fixture(t);
  const eye = camera.position.clone();
  const target = camera.target.clone();
  const forward = target.subtract(eye).normalize();
  moveEditorCamera(camera, { forward: 1, right: 0, up: 0 }, 0.7);
  near(camera.position, eye.add(forward.scale(0.7)));
  near(camera.target, target.add(forward.scale(0.7)));
  assert.equal(camera.radius, 4);
  moveEditorCamera(camera, { forward: -1, right: 0, up: 0 }, 0.7);
  near(camera.position, eye);
});

test('A/D используют правую ось после поворота, диагональ не ускоряет полёт', (t) => {
  const camera = fixture(t, Math.PI, Math.PI / 2);
  const eye = camera.position.clone();
  const forward = camera.target.subtract(eye).normalize();
  const right = Vector3.Cross(forward, Vector3.Up()).normalize();
  moveEditorCamera(camera, { forward: 0, right: 1, up: 0 }, 1);
  near(camera.position, eye.add(right));
  moveEditorCamera(camera, { forward: 0, right: -1, up: 0 }, 1);
  near(camera.position, eye);
  moveEditorCamera(camera, { forward: 1, right: 1, up: 0 }, 1);
  assert(Math.abs(Vector3.Distance(camera.position, eye) - 1) < 0.00001);
});

test('Q/E движутся по вертикали мира, а обзор поворачивает взгляд без сдвига камеры', (t) => {
  const camera = fixture(t);
  const eye = camera.position.clone();
  moveEditorCamera(camera, { forward: 0, right: 0, up: 1 }, 0.5);
  near(camera.position, eye.add(new Vector3(0, 0.5, 0)));
  moveEditorCamera(camera, { forward: 0, right: 0, up: -1 }, 0.5);
  near(camera.position, eye);
  const oldTarget = camera.target.clone();
  const oldRight = Vector3.Cross(oldTarget.subtract(eye), Vector3.Up()).normalize();
  lookEditorCamera(camera, 50, 30);
  near(camera.position, eye);
  assert(Vector3.Dot(camera.target.subtract(oldTarget), oldRight) > 0);
  assert(camera.target.y < oldTarget.y);
  assert.equal(camera.radius, 4);
  lookEditorCamera(camera, 0, 100000);
  assert(camera.beta > 0 && camera.beta < Math.PI);
  near(camera.position, eye);
});
