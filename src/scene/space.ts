/** Двойная площадь суши при прежних координатах сохранений и размерах домов. */
export const ISLAND_SPREAD = Math.SQRT2;
export const sceneCoordinate = (value: number) => 6 + (value - 6) * ISLAND_SPREAD;
export const boardCoordinate = (value: number) => 6 + (value - 6) / ISLAND_SPREAD;
