import type { Arrival, Tile } from '../domain/index.js';
/**
 * Хореография рейса в секундах. Функция не меняет население и не зависит от FPS.
 * 0–2: подход; 2–5: высадка; 5–7: отход. Это только визуализация события домена.
 */
export const VOYAGE_SECONDS = 7;
export function voyageFrame(
  event: Arrival,
  elapsed: number,
  direction: [number, number],
  landing = 2.7,
  dock?: { mooring: Tile; route: Tile[] },
) {
  const [dx, dz] = direction;
  const travel =
    elapsed < 2 ? 5 * (1 - elapsed / 2) : elapsed > 5 ? 5 * Math.min(1, (elapsed - 5) / 2) : 0;
  const passengers = [];
  if (elapsed >= 2 && elapsed <= 5) {
    for (let i = 0; i < event.count; i++) {
      const progress = Math.max(0, Math.min(1, (elapsed - 2 - i * 0.16) / 1.3));
      if (progress <= 0 || progress >= 1) continue;
      const distance = (landing - 0.5) * (1 - progress);
      let position = {
        x: event.port.x + 0.5 + dx * distance + dz * 0.28,
        z: event.port.z + 0.5 + dz * distance - dx * 0.28,
      };
      if (dock) {
        const lengths = dock.route
          .slice(1)
          .map((p, j) => Math.hypot(p.x - dock.route[j].x, p.z - dock.route[j].z));
        let remaining = progress * lengths.reduce((sum, length) => sum + length, 0);
        for (const [j, length] of lengths.entries()) {
          if (remaining <= length || j === lengths.length - 1) {
            const a = dock.route[j],
              b = dock.route[j + 1];
            const t = length ? Math.min(1, remaining / length) : 0;
            position = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
            break;
          }
          remaining -= length;
        }
      }
      passengers.push({
        id: i,
        ...position,
        ...(dock ? { deckHeight: 0.07 } : {}),
        progress,
      });
    }
  }
  return {
    done: elapsed >= VOYAGE_SECONDS,
    x: (dock?.mooring.x ?? event.port.x + 0.5 + dx * landing) + dx * travel,
    z: (dock?.mooring.z ?? event.port.z + 0.5 + dz * landing) + dz * travel,
    rotation: -Math.atan2(dx, dz) + Math.PI / 2,
    passengers,
  };
}
