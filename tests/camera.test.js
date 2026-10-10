import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraMotion } from '../src/scene/camera.ts';

const advance = (camera, seconds, fps = 60) => {
  for (let i = 0; i < seconds * fps; i++) camera.tick(1 / fps);
};
const close = (actual, expected, tolerance = 0.0001) =>
  assert(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);

test('поворот непрерывен, зависит от удержания и одинаков при 60/120 FPS', () => {
  const results = [];
  for (const fps of [60, 120]) {
    const camera = createCameraMotion();
    const initial = camera.state.yaw;
    camera.input('key:KeyE', 'right');
    camera.tick(1 / fps);
    assert(camera.state.yaw > initial && camera.state.yaw - initial < 0.03);
    advance(camera, 0.5, fps);
    assert(camera.state.yaw - initial > 0.5);
    camera.clear();
    advance(camera, 1, fps);
    results.push(camera.state.yaw);
    const stopped = camera.state.yaw;
    advance(camera, 1, fps);
    close(camera.state.yaw, stopped);
  }
  close(results[0], results[1], 0.012);
});

test('клавиатура и панель независимы; stop исключает залипание после потери фокуса', () => {
  const camera = createCameraMotion();
  camera.input('key:KeyE', 'right');
  camera.input('toolbar:right', 'right');
  camera.clear('key:');
  advance(camera, 0.3);
  const moving = camera.state.yaw;
  advance(camera, 0.3);
  assert(camera.state.yaw > moving + 0.2);
  camera.stop();
  const stopped = camera.state;
  advance(camera, 2);
  assert.deepEqual(camera.state, stopped);
});

test('наклон и масштаб ограничены; сброс плавно возвращает центр, масштаб и ракурс', () => {
  const camera = createCameraMotion();
  const initial = camera.state;
  camera.orbit(1700, 1000);
  camera.zoom(100);
  camera.pan(250, -150, 45);
  advance(camera, 2);
  close(camera.state.pitch, 1.2);
  close(camera.state.zoom, 3);
  assert.notEqual(camera.state.x, initial.x);
  camera.input('key:KeyE', 'right');
  camera.reset();
  const before = camera.state;
  camera.tick(1 / 60);
  assert.notEqual(camera.state.zoom, initial.zoom, 'Сброс не прыгает мгновенно');
  assert(camera.state.zoom < before.zoom);
  advance(camera, 2);
  for (const key of ['x', 'z', 'pitch', 'zoom']) close(camera.state[key], initial[key]);
  close(Math.sin(camera.state.yaw - initial.yaw), 0);
  camera.orbit(0, -1000);
  camera.zoom(-100);
  advance(camera, 2);
  close(camera.state.pitch, -1.4);
  close(camera.state.zoom, 0.55);
});

test('WASD следуют ракурсу; диагональ не быстрее, колесо не вызывает мгновенный скачок', () => {
  const straight = createCameraMotion();
  const diagonal = createCameraMotion();
  const initial = straight.state;
  straight.input('d', 'panRight');
  diagonal.input('d', 'panRight');
  diagonal.input('w', 'panUp');
  advance(straight, 1);
  advance(diagonal, 1);
  straight.clear();
  diagonal.clear();
  advance(straight, 1);
  advance(diagonal, 1);
  const distance = (camera) => Math.hypot(camera.state.x - initial.x, camera.state.z - initial.z);
  close(distance(straight), distance(diagonal), 0.1);
  const camera = createCameraMotion();
  camera.zoom(0.2);
  close(camera.state.zoom, 1);
  camera.tick(1 / 60);
  assert(camera.state.zoom > 1 && camera.state.zoom < Math.exp(0.2));
});
