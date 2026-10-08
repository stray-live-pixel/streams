import type { Arrival } from '../domain/index.js';
/**
 * Хореография рейса в секундах. Функция не меняет население и не зависит от FPS.
 * 0–2: подход; 2–5: высадка; 5–7: отход. Это только визуализация события домена.
 */
export const VOYAGE_SECONDS = 7;
export function voyageFrame(event: Arrival, elapsed: number, direction: [number, number]) {
  const [dx, dz] = direction;
  const travel =
    elapsed < 2 ? 5 * (1 - elapsed / 2) : elapsed > 5 ? 5 * Math.min(1, (elapsed - 5) / 2) : 0;
  const passengers = [];
  if (elapsed >= 2 && elapsed <= 5) {
    for (let i = 0; i < event.count; i++) {
      const progress = Math.max(0, Math.min(1, (elapsed - 2 - i * 0.16) / 1.3));
      if (progress <= 0 || progress >= 1) continue;
      const distance = 1.8 - 2.1 * progress;
      passengers.push({
        id: i,
        x: event.port.x + 0.5 + dx * distance,
        z: event.port.z + 0.5 + dz * distance,
        progress,
      });
    }
  }
  return {
    done: elapsed >= VOYAGE_SECONDS,
    x: event.port.x + 0.5 + dx * (1.8 + travel),
    z: event.port.z + 0.5 + dz * (1.8 + travel),
    rotation: -Math.atan2(dx, dz),
    passengers,
  };
}
