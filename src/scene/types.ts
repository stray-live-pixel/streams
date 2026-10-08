import type { Tile } from '../domain/index.js';
/** Сцена видит только географию, а не правила экономики. */
export interface Board {
  size: number;
  isLand(x: number, z: number): boolean;
  shoreDirection(x: number, z: number): [number, number] | null;
}
export interface SceneOptions {
  canvas: HTMLCanvasElement;
  board: Board;
  onArrivalFinished(): void;
  onError(message: string): void;
}
export interface Passenger extends Tile {
  id: number;
  progress: number;
}
